import express from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import https from 'https';
import { URL } from 'url';
import compression from 'compression';
import { randomUUID } from 'crypto';
import { Resvg } from '@resvg/resvg-js';
import dns from 'dns/promises';
import net from 'net';
import apiRouter from './server/api.js';
import { renderOgPng } from './server/ogGenerator.js';
import { getNormalizedChannels } from './server/iptvStorage.js';
import { createUpstreamCircuitBreaker } from './server/upstreamCircuitBreaker.js';
import { allowGuessRate, cleanupGuessPosterGame, createGuessPosterGame, getPublicGuessPosterGame, classifyGuess, nextGuessPosterRound, createMovieTriviaGame, getPublicMovieTriviaGame, scoreTriviaAnswer, cleanupPartyGame, createPartyGame, getPublicPartyGame, nextPartyGameRound, scorePartyGameGuess } from './server/watchPartyGame.js';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory registry for staff/actors metadata populated from movie details
const staffMap = new Map();

// Pre-load default SLFLIX logo for OG canvas generation
let slflixLogoDataUri = '';
try {
    const logoPath = path.resolve(__dirname, 'public/icons/slflix.png');
    if (fs.existsSync(logoPath)) {
        slflixLogoDataUri = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }
} catch (e) {
    console.warn('[Server] Could not pre-load slflix logo:', e.message);
}

// In-memory cache for generated OG PNG cards
const ogImageCache = new Map();
const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 64 * 1024,
    perMessageDeflate: false
});
const visitorData = {
    totalVisitors: 0,
    todayVisitors: 0,
    lastReset: new Date().toDateString(),
    regions: {},
    ips: new Map(),
    onlineUsers: 0,
    pageViews: {}
};
const getRegionFromIP = (ip) => {
    ip = ip.split(':').pop() || ip;
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
        return 'Local Network';
    }
    if (ip.startsWith('41.') || ip.startsWith('197.') || ip.startsWith('154.') || ip.startsWith('196.')) {
        return 'Africa';
    }
    if (ip.startsWith('92.') || ip.startsWith('188.') || ip.startsWith('91.')) {
        return 'Europe';
    }
    if (ip.startsWith('1.') || ip.startsWith('204.')) {
        return 'North America';
    }
    if (ip.startsWith('103.') || ip.startsWith('175.') || ip.startsWith('14.')) {
        return 'Asia';
    }
    if (ip.startsWith('177.') || ip.startsWith('186.') || ip.startsWith('189.')) {
        return 'South America';
    }
    if (ip.startsWith('27.') || ip.startsWith('41.')) {
        return 'Sierra Leone';
    }
    return 'Unknown';
};
const trackVisitor = (ip, page = '/') => {
    const today = new Date().toDateString();
    const cleanIP = ip.split(':').pop() || ip;
    if (visitorData.lastReset !== today) {
        visitorData.todayVisitors = 0;
        visitorData.lastReset = today;
    }
    const visitorKey = cleanIP + today;
    if (!visitorData.ips.has(visitorKey)) {
        visitorData.totalVisitors++;
        visitorData.todayVisitors++;
        visitorData.ips.set(visitorKey, {
            ip: cleanIP,
            region: getRegionFromIP(cleanIP),
            timestamp: Date.now(),
            pages: [page]
        });
        const region = getRegionFromIP(cleanIP);
        visitorData.regions[region] = (visitorData.regions[region] || 0) + 1;
    } else {
        const visitor = visitorData.ips.get(visitorKey);
        if (!visitor.pages.includes(page)) {
            visitor.pages.push(page);
        }
    }
    visitorData.pageViews[page] = (visitorData.pageViews[page] || 0) + 1;
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    for (const [key, value] of visitorData.ips) {
        if (value.timestamp < oneDayAgo) {
            visitorData.ips.delete(key);
        }
    }
};
const watchRooms = new Map();
const ROOM_WAIT_MS = 30 * 60 * 1000;        // how long a room waits for its first guest
const ROOM_EMPTY_GRACE_MS = 10 * 60 * 1000; // how long an empty room survives (host reconnect window)
const MAX_WATCH_ROOMS = 100;
const ROOM_CREATION_LIMIT = 3;
const ROOM_CREATION_WINDOW_MS = 10 * 60 * 1000;
const GUESS_POSTER_MAX_CANDIDATES = 30;
const GUESS_POSTER_MAX_PLAYERS = 8;
const GUESS_POSTER_ROUND_MS = 20 * 1000;
const GUESS_POSTER_REVEAL_MS = 3 * 1000;
const GUESS_POSTER_MAX_GUESS_LENGTH = 80;
const MOVIE_TRIVIA_MAX_QUESTIONS = 20;
const MOVIE_TRIVIA_MAX_PLAYERS = 12;
const MOVIE_TRIVIA_ROUND_MS = 20 * 1000;
const MOVIE_TRIVIA_REVEAL_MS = 3 * 1000;
const PARTY_GAME_MAX_PLAYERS = 20;
const PARTY_GAME_ROUND_MS = 20 * 1000;
const PARTY_GAME_REVEAL_MS = 3 * 1000;
const PARTY_GAME_MAX_GUESS_LENGTH = 80;

function clearGuessPosterGame(room) {
    if (room?.guessPosterGame?.timer) clearTimeout(room.guessPosterGame.timer);
    cleanupGuessPosterGame(room);
}

function clearMovieTriviaGame(room) {
    if (room?.movieTriviaGame?.timer) clearTimeout(room.movieTriviaGame.timer);
    if (room && Object.prototype.hasOwnProperty.call(room, 'movieTriviaGame')) delete room.movieTriviaGame;
}

function clearPartyGame(room) {
    if (room?.partyGame?.timer) clearTimeout(room.partyGame.timer);
    cleanupPartyGame(room);
}

function recordGuessAttempt(game, attempt) {
    game.attempts = Array.isArray(game.attempts) ? game.attempts : [];
    game.attempts.push(attempt);
    if (game.attempts.length > 250) game.attempts.shift();
}

function publicRoomWithGame(room) {
    const { guessPosterGame, movieTriviaGame, partyGame, reconnectGrace, hostToken, pendingRequests, ...publicRoom } = room;
    const safeRoom = {
        ...publicRoom,
        privacy: room.privacy === 'private' ? 'private' : 'public',
        isPrivate: room.privacy === 'private',
        isPublic: room.privacy !== 'private',
        visibility: room.privacy === 'private' ? 'private' : 'public'
    };
    if (guessPosterGame) safeRoom.guessPosterGame = getPublicGuessPosterGame(guessPosterGame);
    if (movieTriviaGame) {
        const publicTrivia = getPublicMovieTriviaGame(movieTriviaGame);
        safeRoom.movieTriviaGame = publicTrivia;
        safeRoom.triviaGame = publicTrivia;
    }
    if (partyGame) safeRoom.partyGame = getPublicPartyGame(partyGame);
    return safeRoom;
}

function getRoomCurrentTime(room) {
    if (!room) return 0;
    if (room.paused) return room.currentTime || 0;
    const elapsed = (Date.now() - (room.updatedAt || Date.now())) / 1000;
    return Math.max(0, (room.currentTime || 0) + elapsed);
}

function getActiveRoomsList() {
    const now = Date.now();
    return Array.from(watchRooms.values())
        // Keep empty rooms visible during the host reconnect grace period so a host
        // can still find their own room after a refresh or transient disconnect.
        .filter(r => r.privacy !== 'private')
        .filter(r => (r.users && r.users.length > 0) || (now - (r.updatedAt || now) < ROOM_EMPTY_GRACE_MS))
        .map(r => {
            return { ...publicRoomWithGame(r), currentTime: getRoomCurrentTime(r) };
        });
}

function broadcastActiveRooms() {
    const rooms = getActiveRoomsList();
    io.emit('active_rooms_list', rooms);
    // Additive discovery event for clients that distinguish browse from legacy
    // active-room updates. Both payloads intentionally contain public metadata only.
    io.emit('public_rooms_list', rooms);
}

// Clean up stale or empty rooms every 30 seconds to prevent room spam
setInterval(() => {
    const now = Date.now();
    let hasChanges = false;
    for (const [roomId, room] of watchRooms.entries()) {
        room.reconnectGrace = (room.reconnectGrace || []).filter(entry => now < entry.expiresAt);
        if (room.waitExpiresAt && (room.users || []).some(u => !u.isCreator)) room.waitExpiresAt = null; // a guest joined
        if (room.waitExpiresAt && now > room.waitExpiresAt) {
            io.to(roomId).emit('room_ended', { roomId, message: 'Nobody joined "' + room.roomName + '" within 30 minutes, so the room was closed.', endedBy: 'System' });
            io.in(roomId).socketsLeave(roomId);
            clearGuessPosterGame(room);
            clearMovieTriviaGame(room);
            clearPartyGame(room);
            watchRooms.delete(roomId);
            hasChanges = true;
            continue;
        }
        const isEmpty = !room.users || room.users.length === 0;
        // Delete empty rooms older than 3 minutes, or any room older than 12 hours
        if ((isEmpty && now - (room.updatedAt || now) > ROOM_EMPTY_GRACE_MS) || (now - (room.updatedAt || now) > 12 * 60 * 60 * 1000)) {
            clearGuessPosterGame(room);
            clearMovieTriviaGame(room);
            clearPartyGame(room);
            watchRooms.delete(roomId);
            hasChanges = true;
        }
    }
    if (hasChanges) {
        broadcastActiveRooms();
    }
}, 30 * 1000);

const SOCKET_EVENT_LIMIT = 60;
const SOCKET_EVENT_WINDOW_MS = 60 * 1000;
const ROOM_ID_PATTERN = /^[A-Z0-9_-]{1,64}$/;
const USERNAME_MAX_LENGTH = 40;
const ROOM_NAME_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 1000;
const MAX_PENDING_ROOM_REQUESTS = 50;
const ROOM_ENTRY_MODES = new Set(['manual', 'auto']);
const ROOM_PRIVACY_MODES = new Set(['public', 'private']);
const CLIENT_REQUEST_ID_MAX_LENGTH = 120;

function cleanText(value, maxLength, fallback = '') {
    if (typeof value !== 'string') return fallback;
    return value.trim().slice(0, maxLength);
}

function cleanRoomIdValue(value) {
    const roomId = cleanText(value, 64).toUpperCase();
    return ROOM_ID_PATTERN.test(roomId) ? roomId : '';
}

function cleanRoomEntryMode(value) {
    return ROOM_ENTRY_MODES.has(value) ? value : 'manual';
}

function cleanRoomPrivacy(payload) {
    const requested = payload?.privacy
        ?? payload?.roomPrivacy
        ?? payload?.visibility
        ?? (payload?.isPrivate === true || payload?.isPublic === false || payload?.public === false ? 'private' : 'public');
    return ROOM_PRIVACY_MODES.has(requested) ? requested : 'public';
}

function normalizeDisplayName(value) {
    return cleanText(value, USERNAME_MAX_LENGTH).toLocaleLowerCase();
}

function validRoomPayload(payload) {
    return payload !== null && typeof payload === 'object' && !Array.isArray(payload);
}

function isRoomMember(room, socket) {
    return room?.users?.find(user => user.id === socket.data.identity?.id) || null;
}

function roomNameIsReserved(room, username, options = {}) {
    const normalized = normalizeDisplayName(username);
    if (!normalized) return false;
    const ignoredSocketId = options.socketId || '';
    const active = (room?.users || []).some(user => (
        normalizeDisplayName(user.name) === normalized && user.id !== ignoredSocketId
    ));
    const pending = (room?.pendingRequests || []).some(request => (
        normalizeDisplayName(request.username) === normalized && request.socketId !== ignoredSocketId
    ));
    const reconnecting = (room?.reconnectGrace || []).some(entry => (
        normalizeDisplayName(entry.username) === normalized && entry.socketId !== ignoredSocketId
    ));
    return active || pending || reconnecting;
}

function roomHasHostName(room, username) {
    return normalizeDisplayName(room?.creator) === normalizeDisplayName(username);
}

function getRoomStateForSocket(room, socket) {
    const { hostToken, pendingRequests, ...roomWithoutPrivateFields } = room;
    const member = isRoomMember(room, socket);
    const publicRoom = publicRoomWithGame(roomWithoutPrivateFields);
    return member?.isCreator ? { ...publicRoom, hostToken, pendingRequests: pendingRequests || [] } : publicRoom;
}

function isSocketRateLimited(socket) {
    const now = Date.now();
    const timestamps = (socket.data.eventTimestamps || []).filter(time => now - time < SOCKET_EVENT_WINDOW_MS);
    timestamps.push(now);
    socket.data.eventTimestamps = timestamps;
    return timestamps.length > SOCKET_EVENT_LIMIT;
}

function isRoomCreationRateLimited(socket) {
    const now = Date.now();
    const timestamps = (socket.data.roomCreationTimestamps || [])
        .filter(time => now - time < ROOM_CREATION_WINDOW_MS);
    if (timestamps.length >= ROOM_CREATION_LIMIT) {
        socket.data.roomCreationTimestamps = timestamps;
        return true;
    }
    timestamps.push(now);
    socket.data.roomCreationTimestamps = timestamps;
    return false;
}

function cleanGuessPosterCandidates(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > GUESS_POSTER_MAX_CANDIDATES) return null;
    const candidates = value.map(candidate => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
        const id = cleanText(candidate.id, 100);
        const title = cleanText(candidate.title, 160);
        const posterUrl = cleanText(candidate.posterUrl, 1000);
        const canonicalTitle = cleanText(candidate.canonicalTitle, 160);
        const aliases = Array.isArray(candidate.aliases)
            ? candidate.aliases.map(alias => cleanText(alias, 160)).filter(Boolean).slice(0, 10)
            : [];
        const contentType = cleanText(candidate.contentType || candidate.type, 32);
        const category = cleanText(candidate.category, 64);
        return id && title ? {
            id,
            title,
            posterUrl,
            ...(canonicalTitle ? { canonicalTitle } : {}),
            ...(aliases.length ? { aliases } : {}),
            ...(contentType ? { contentType } : {}),
            ...(category ? { category } : {})
        } : null;
    });
    return candidates.every(Boolean) ? candidates : null;
}

function buildMovieTriviaQuestions(payload) {
    if (Array.isArray(payload?.questions) && payload.questions.length) {
        return payload.questions.slice(0, MOVIE_TRIVIA_MAX_QUESTIONS);
    }
    // Older clients send the poster candidate set instead of question objects.
    // Turn that set into safe title-choice rounds without trusting client answers.
    const candidates = cleanGuessPosterCandidates(payload?.candidates) || [];
    if (!candidates.length) return [];
    const requestedRounds = Number.isInteger(Number(payload?.maxRounds))
        ? Math.min(5, Math.max(1, Number(payload.maxRounds)))
        : Math.min(5, candidates.length);
    return Array.from({ length: requestedRounds }, (_, index) => {
        const answer = candidates[index % candidates.length];
        const distractors = candidates
            .filter(candidate => candidate.id !== answer.id)
            .slice(0, 3)
            .map(candidate => candidate.title);
        const baseOptions = [answer.title, ...distractors];
        const shift = baseOptions.length ? index % baseOptions.length : 0;
        const options = [...baseOptions.slice(shift), ...baseOptions.slice(0, shift)];
        return {
            id: `movie-trivia-${index + 1}`,
            question: `Which title belongs to this watch-party challenge?`,
            options,
            answerIndex: options.indexOf(answer.title),
            category: answer.category || answer.contentType || ''
        };
    });
}

function scheduleGuessPosterRound(roomId) {
    const room = watchRooms.get(roomId);
    const game = room?.guessPosterGame;
    if (!room || !game) return;
    if (game.timer) clearTimeout(game.timer);
    game.timer = setTimeout(() => revealGuessPosterRound(roomId), Math.max(0, game.endsAt - Date.now()));
}

function startNextGuessPosterRound(roomId) {
    const room = watchRooms.get(roomId);
    const previous = room?.guessPosterGame;
    if (!room || !previous || previous.round >= previous.maxRounds) return;
    const next = nextGuessPosterRound(previous, Date.now(), GUESS_POSTER_ROUND_MS);
    if (!next) return;
    room.guessPosterGame = { ...next, scores: { ...previous.scores } };
    io.to(roomId).emit('guess_poster_started', { game: getPublicGuessPosterGame(room.guessPosterGame) });
    scheduleGuessPosterRound(roomId);
}

function revealGuessPosterRound(roomId) {
    const room = watchRooms.get(roomId);
    const game = room?.guessPosterGame;
    if (!room || !game || game.status !== 'active') return;
    game.status = 'reveal';
    game.revealed = true;
    game.timer = null;
    io.to(roomId).emit('guess_poster_round_revealed', { game: getPublicGuessPosterGame(game) });
    if (game.round >= game.maxRounds) {
        game.status = 'finished';
        io.to(roomId).emit('guess_poster_finished', { game: getPublicGuessPosterGame(game) });
        return;
    }
    game.timer = setTimeout(() => startNextGuessPosterRound(roomId), GUESS_POSTER_REVEAL_MS);
}

function scheduleMovieTriviaRound(roomId) {
    const room = watchRooms.get(roomId);
    const game = room?.movieTriviaGame;
    if (!room || !game || game.status !== 'active') return;
    if (game.timer) clearTimeout(game.timer);
    game.timer = setTimeout(() => revealMovieTriviaRound(roomId), Math.max(0, game.endsAt - Date.now()));
}

function startNextMovieTriviaRound(roomId) {
    const room = watchRooms.get(roomId);
    const game = room?.movieTriviaGame;
    if (!room || !game || game.round >= game.maxRounds) return;
    game.round += 1;
    game.currentQuestion += 1;
    game.startedAt = Date.now();
    game.endsAt = game.startedAt + game.roundMs;
    game.status = 'active';
    game.answeredPlayers = [];
    game.answered = {};
    game.attempts = [];
    game.failedAnswers = [];
    const event = { game: getPublicMovieTriviaGame(game) };
    io.to(roomId).emit('movie_trivia_round_started', event);
    scheduleMovieTriviaRound(roomId);
}

function revealMovieTriviaRound(roomId) {
    const room = watchRooms.get(roomId);
    const game = room?.movieTriviaGame;
    if (!room || !game || game.status !== 'active') return;
    game.status = 'reveal';
    game.timer = null;
    const event = { game: getPublicMovieTriviaGame(game) };
    io.to(roomId).emit('movie_trivia_round_revealed', event);
    if (game.round >= game.maxRounds) {
        game.status = 'finished';
        const finished = { game: getPublicMovieTriviaGame(game) };
        io.to(roomId).emit('movie_trivia_finished', finished);
        return;
    }
    game.timer = setTimeout(() => startNextMovieTriviaRound(roomId), MOVIE_TRIVIA_REVEAL_MS);
}

function schedulePartyGameRound(roomId) {
    const room = watchRooms.get(roomId);
    const game = room?.partyGame;
    if (!room || !game || game.status !== 'active') return;
    if (game.timer) clearTimeout(game.timer);
    game.timer = setTimeout(() => revealPartyGameRound(roomId), Math.max(0, game.endsAt - Date.now()));
}

function startNextPartyGameRound(roomId) {
    const room = watchRooms.get(roomId);
    const previous = room?.partyGame;
    if (!room || !previous || previous.round >= previous.maxRounds) return;
    const next = nextPartyGameRound(previous, Date.now());
    if (!next) return;
    room.partyGame = { ...next, scores: { ...previous.scores } };
    io.to(roomId).emit('party_game_round_started', { game: getPublicPartyGame(room.partyGame) });
    broadcastActiveRooms();
    schedulePartyGameRound(roomId);
}

function revealPartyGameRound(roomId) {
    const room = watchRooms.get(roomId);
    const game = room?.partyGame;
    if (!room || !game || game.status !== 'active') return;
    game.status = 'reveal';
    game.revealed = true;
    game.timer = null;
    io.to(roomId).emit('party_game_round_revealed', { game: getPublicPartyGame(game) });
    broadcastActiveRooms();
    if (game.round >= game.maxRounds) {
        game.status = 'finished';
        io.to(roomId).emit('party_game_finished', { game: getPublicPartyGame(game) });
        return;
    }
    game.timer = setTimeout(() => startNextPartyGameRound(roomId), PARTY_GAME_REVEAL_MS);
}

io.on('connection', (socket) => {
    socket.data.identity = Object.freeze({ id: socket.id });
    socket.data.eventTimestamps = [];
    socket.data.roomCreationTimestamps = [];
    socket.data.roomCreationRequests = new Map();
    socket.use((packet, next) => {
        if (isSocketRateLimited(socket)) return next(new Error('Too many watch-party requests'));
        next();
    });
    visitorData.onlineUsers++;
    io.emit('visitorUpdate', {
        onlineUsers: visitorData.onlineUsers,
        todayVisitors: visitorData.todayVisitors,
        totalVisitors: visitorData.totalVisitors
    });

    socket.on('get_active_rooms', () => {
        const rooms = getActiveRoomsList();
        socket.emit('active_rooms_list', rooms);
        socket.emit('public_rooms_list', rooms);
    });

    socket.on('network_quality_ping', (sentAt, acknowledge) => {
        if (typeof acknowledge === 'function') acknowledge(Number.isFinite(Number(sentAt)) ? Number(sentAt) : Date.now());
    });

    socket.on('create_room', (payload) => {
        if (!validRoomPayload(payload)) return socket.emit('error_message', { message: 'Invalid room request.' });
        const { roomId, roomName, username, movie, season, episode } = payload;
        const clientRequestId = cleanText(payload.clientRequestId, CLIENT_REQUEST_ID_MAX_LENGTH);
        if (clientRequestId) {
            const previousRequest = socket.data.roomCreationRequests.get(clientRequestId);
            const previousRoom = previousRequest ? watchRooms.get(previousRequest.roomId) : null;
            if (previousRoom && previousRequest.socketId === socket.id) {
                return socket.emit('room_state', getRoomStateForSocket(previousRoom, socket));
            }
            if (previousRequest) socket.data.roomCreationRequests.delete(clientRequestId);
        }
        const cleanRoomId = cleanRoomIdValue(roomId);
        const cleanUsername = cleanText(username, USERNAME_MAX_LENGTH);
        if (!cleanRoomId || !cleanUsername || watchRooms.has(cleanRoomId)) {
            return socket.emit('error_message', { message: 'Invalid or unavailable room.' });
        }
        if (watchRooms.size >= MAX_WATCH_ROOMS) {
            return socket.emit('error_message', { message: 'Watch party capacity has been reached. Try again later.' });
        }
        if (isRoomCreationRateLimited(socket)) {
            return socket.emit('error_message', { message: 'Room creation is temporarily rate-limited. Please try again later.' });
        }
        socket.join(cleanRoomId);
        const now = Date.now();
        const room = {
            roomId: cleanRoomId,
            roomName: cleanText(roomName, ROOM_NAME_MAX_LENGTH, `Room ${cleanRoomId}`),
            creator: cleanUsername,
            entryMode: cleanRoomEntryMode(payload.entryMode),
            privacy: cleanRoomPrivacy(payload),
            hostToken: randomUUID(),
            movie: movie && typeof movie === 'object' ? movie : null,
            currentSeason: Number.isInteger(Number(season)) && Number(season) >= 1 ? Number(season) : 1,
            currentEpisode: Number.isInteger(Number(episode)) && Number(episode) >= 1 ? Number(episode) : 1,
            users: [{ id: socket.id, name: cleanUsername, isCreator: true, buffering: false }],
            messages: [],
            kickedUsers: [],
            pendingRequests: [],
            currentTime: 0,
            paused: false, // Starts playing continuous real-time movie stream
            guessPosterGame: null,
            movieTriviaGame: null,
            partyGame: null,
            reconnectGrace: [],
            waitExpiresAt: now + ROOM_WAIT_MS,
            updatedAt: now
        };
        watchRooms.set(cleanRoomId, room);
        if (clientRequestId) {
            socket.data.roomCreationRequests.set(clientRequestId, { roomId: cleanRoomId, socketId: socket.id });
        }
        broadcastActiveRooms();
        socket.emit('room_state', getRoomStateForSocket(room, socket));
    });

    socket.on('join_room', (payload) => {
        if (!validRoomPayload(payload)) return socket.emit('error_message', { message: 'Invalid join request.' });
        const { roomId, username } = payload;
        const cleanRoomId = cleanRoomIdValue(roomId);
        const cleanUsername = cleanText(username, USERNAME_MAX_LENGTH);
        if (!cleanRoomId || !cleanUsername) return socket.emit('error_message', { message: 'Invalid room or username.' });
        const room = watchRooms.get(cleanRoomId);
        if (room) {
            // Check if user is in the kicked/banned list for this room session
            if (room.kickedUsers && room.kickedUsers.some(k => k.toLowerCase() === cleanUsername.toLowerCase())) {
                socket.emit('room_kicked', { 
                    roomId: cleanRoomId, 
                    message: 'You were kicked from this Watch Party and cannot rejoin.' 
                });
                return;
            }

            const isHostReconnect = typeof payload.hostToken === 'string' && payload.hostToken === room.hostToken;
            const isCreatorUser = isHostReconnect;
            const normalizedUsername = normalizeDisplayName(cleanUsername);
            const nameOwner = room.users.find(user => normalizeDisplayName(user.name) === normalizedUsername);
            const pendingNameOwner = (room.pendingRequests || []).find(request => normalizeDisplayName(request.username) === normalizedUsername);
            const reconnectReservation = (room.reconnectGrace || []).find(entry => normalizeDisplayName(entry.username) === normalizedUsername);
            const isRoomHostName = room.creator.toLowerCase() === cleanUsername.toLowerCase();
            const activeNameConflict = Boolean(nameOwner && nameOwner.id !== socket.id && !(isHostReconnect && nameOwner.isCreator));
            const pendingNameConflict = Boolean(pendingNameOwner && pendingNameOwner.socketId !== socket.id);
            const reconnectNameConflict = Boolean(reconnectReservation && !payload.reconnect && !(isHostReconnect && reconnectReservation.isCreator));
            const ownsReconnectReservation = Boolean(isHostReconnect || (payload.reconnect && reconnectReservation && !reconnectReservation.isCreator));
            const reservedByAnotherSocket = roomNameIsReserved(room, cleanUsername, { socketId: socket.id })
                && !ownsReconnectReservation
                && !(isHostReconnect && (nameOwner?.isCreator || reconnectReservation?.isCreator));
            if (activeNameConflict || pendingNameConflict || reconnectNameConflict || reservedByAnotherSocket || (isRoomHostName && !isHostReconnect && !reconnectReservation)) {
                socket.emit('error_message', { message: 'That display name is already in use in this room. Pick another name.' });
                return;
            }
            if (isHostReconnect) {
                const creator = room.users.find(user => user.isCreator);
                if (creator) {
                    const previousName = creator.name;
                    creator.id = socket.id;
                    creator.name = cleanUsername;
                    for (const game of [room.guessPosterGame, room.movieTriviaGame, room.partyGame]) {
                        if (game?.scores && Object.prototype.hasOwnProperty.call(game.scores, previousName)) {
                            game.scores[cleanUsername] = game.scores[previousName];
                            if (previousName !== cleanUsername) delete game.scores[previousName];
                        }
                    }
                }
                room.creator = cleanUsername;
            }
            const isGraceReconnect = Boolean(payload.reconnect && reconnectReservation && (!reconnectReservation.isCreator || isHostReconnect));
            const requiresApproval = room.entryMode === 'manual' && !isCreatorUser && !isGraceReconnect;
            if (requiresApproval) {
                if (isRoomMember(room, socket)) {
                    return socket.emit('room_state', getRoomStateForSocket(room, socket));
                }
                room.pendingRequests = Array.isArray(room.pendingRequests) ? room.pendingRequests : [];
                // A retry from the same socket and display name is the same request,
                // not a new item in the host's approval queue.
                const existingRequest = room.pendingRequests.find(request => (
                    request.socketId === socket.id
                    || request.username.toLowerCase() === cleanUsername.toLowerCase()
                ));
                if (existingRequest) {
                    return socket.emit('room_request_pending', {
                        roomId: cleanRoomId,
                        requestId: existingRequest.requestId,
                        username: existingRequest.username,
                        requestedAt: existingRequest.requestedAt,
                        status: 'pending',
                        existing: true,
                        message: 'Your request is already waiting for the room host.'
                    });
                }
                if (!existingRequest && room.pendingRequests.length < MAX_PENDING_ROOM_REQUESTS) {
                    const request = {
                        requestId: `${socket.id}:${Date.now()}`,
                        socketId: socket.id,
                        username: cleanUsername,
                        requestedAt: Date.now()
                    };
                    room.pendingRequests.push(request);
                    room.updatedAt = Date.now();
                    const hostSocketId = room.users.find(user => user.isCreator)?.id;
                    if (hostSocketId) io.to(hostSocketId).emit('room_join_request', {
                        roomId: cleanRoomId,
                        requestId: request.requestId,
                        username: request.username,
                        requestedAt: request.requestedAt
                    });
                    return socket.emit('room_request_pending', {
                        roomId: cleanRoomId,
                        requestId: request.requestId,
                        username: request.username,
                        requestedAt: request.requestedAt,
                        status: 'pending',
                        existing: false,
                        message: 'Your request was sent to the room host.'
                    });
                }
                return socket.emit('room_request_pending', {
                    roomId: cleanRoomId,
                    message: 'The room is at its pending-request limit. Please try again later.',
                    status: 'full'
                });
            }

            // Auto-Enter is enforced here rather than trusting the request flag. A direct
            // link, reconnect, or client that asks for approval must still enter immediately.
            room.pendingRequests = (room.pendingRequests || []).filter(request => request.socketId !== socket.id);
            room.reconnectGrace = (room.reconnectGrace || []).filter(entry => entry.username.toLowerCase() !== cleanUsername.toLowerCase());
            socket.join(cleanRoomId);
            const currentComputedTime = getRoomCurrentTime(room);
            const existingUserIndex = isHostReconnect
                ? room.users.findIndex(u => u.isCreator)
                : room.users.findIndex(u => u.name.toLowerCase() === cleanUsername.toLowerCase());
            if (existingUserIndex >= 0) {
                const existing = room.users[existingUserIndex];
                if (existing.isCreator && !isHostReconnect && existing.id !== socket.id && io.sockets.sockets.has(existing.id)) {
                    socket.leave(cleanRoomId);
                    return socket.emit('error_message', { message: 'That name belongs to the host. Pick another name.' });
                }
                room.users[existingUserIndex].id = socket.id;
                room.users[existingUserIndex].name = cleanUsername;
                room.users[existingUserIndex].buffering = false;
            } else {
                room.users.push({ id: socket.id, name: cleanUsername, isCreator: isCreatorUser, buffering: false });
            }
            if (!isCreatorUser) room.waitExpiresAt = null;
            room.updatedAt = Date.now();

            const syncPayload = {
                ...getRoomStateForSocket(room, socket),
                currentTime: currentComputedTime,
                messages: room.messages || []
            };
            socket.emit('room_state', syncPayload);
            io.to(cleanRoomId).emit('room_user_joined', { username: cleanUsername, usersCount: room.users.length, users: room.users });
            broadcastActiveRooms();
        } else {
            socket.emit('error_message', { message: 'Watch party not found or was ended by the host.' });
        }
    });

    socket.on('set_room_entry_mode', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const host = isRoomMember(room, socket);
        if (!room || !host?.isCreator) {
            return socket.emit('error_message', { message: 'Only the room host can change the entry mode.' });
        }
        if (!ROOM_ENTRY_MODES.has(payload.entryMode)) {
            return socket.emit('error_message', { message: 'Invalid watch-party entry mode.' });
        }

        const entryMode = cleanRoomEntryMode(payload.entryMode);
        room.entryMode = entryMode;
        room.updatedAt = Date.now();

        // Guests waiting for approval should enter as soon as the host switches to Auto-Enter.
        if (entryMode === 'auto') {
            const pendingRequests = Array.isArray(room.pendingRequests) ? room.pendingRequests : [];
            room.pendingRequests = [];
            for (const request of pendingRequests) {
                const targetSocket = io.sockets.sockets.get(request.socketId);
                if (!targetSocket || roomNameIsReserved(room, request.username, { socketId: targetSocket.id })) {
                    targetSocket?.emit('room_request_denied', { roomId, message: 'That display name is no longer available in this room.' });
                    continue;
                }
                targetSocket.join(roomId);
                room.users.push({ id: targetSocket.id, name: request.username, isCreator: false, buffering: false });
                room.reconnectGrace = (room.reconnectGrace || []).filter(entry => normalizeDisplayName(entry.username) !== normalizeDisplayName(request.username));
                room.waitExpiresAt = null;
                targetSocket.emit('room_state', { ...getRoomStateForSocket(room, targetSocket), currentTime: getRoomCurrentTime(room), messages: room.messages || [] });
                io.to(roomId).emit('room_user_joined', { username: request.username, usersCount: room.users.length, users: room.users });
            }
        }

        io.to(roomId).emit('room_entry_mode_changed', { entryMode, users: room.users });
        broadcastActiveRooms();
    });

    socket.on('room_join_request_decision', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const host = isRoomMember(room, socket);
        if (!room || !host?.isCreator) return socket.emit('error_message', { message: 'Only the room host can approve entry.' });
        room.pendingRequests = Array.isArray(room.pendingRequests) ? room.pendingRequests : [];
        const requestIndex = room.pendingRequests.findIndex(request => request.requestId === payload.requestId);
        if (requestIndex < 0) return;
        const [request] = room.pendingRequests.splice(requestIndex, 1);
        const targetSocket = io.sockets.sockets.get(request.socketId);
        const approved = payload.decision === 'approve';
        if (!approved) {
            targetSocket?.emit('room_request_denied', { roomId, message: 'The host did not approve your request.' });
            return;
        }
        if (!targetSocket) return;
        if (roomNameIsReserved(room, request.username, { socketId: targetSocket.id })) {
            targetSocket.emit('room_request_denied', { roomId, message: 'That display name is no longer available in this room.' });
            return;
        }
        targetSocket.join(roomId);
        room.users.push({ id: targetSocket.id, name: request.username, isCreator: false, buffering: false });
        room.reconnectGrace = (room.reconnectGrace || []).filter(entry => normalizeDisplayName(entry.username) !== normalizeDisplayName(request.username));
        room.waitExpiresAt = null;
        room.updatedAt = Date.now();
         targetSocket.emit('room_state', { ...getRoomStateForSocket(room, targetSocket), currentTime: getRoomCurrentTime(room), messages: room.messages || [] });
        io.to(roomId).emit('room_user_joined', { username: request.username, usersCount: room.users.length, users: room.users });
        broadcastActiveRooms();
    });

    // Creator / Host can remove a participant from the room; once kicked, the user cannot rejoin the session
    socket.on('kick_user', (payload) => {
        if (!validRoomPayload(payload)) return;
        const { roomId, targetUsername } = payload;
        const cleanRoomId = cleanRoomIdValue(roomId);
        const room = watchRooms.get(cleanRoomId);
        if (!room) return;

        const isHost = Boolean(isRoomMember(room, socket)?.isCreator);
        if (!isHost) {
            socket.emit('error_message', { message: 'Only the Watch Party host can remove participants.' });
            return;
        }

        const normTarget = cleanText(targetUsername, USERNAME_MAX_LENGTH);
        if (normTarget.toLowerCase() === room.creator.toLowerCase()) {
            socket.emit('error_message', { message: 'The party host cannot be removed.' });
            return;
        }

        if (!room.kickedUsers) room.kickedUsers = [];
        if (!room.kickedUsers.some(k => k.toLowerCase() === normTarget.toLowerCase())) {
            room.kickedUsers.push(normTarget);
        }

        // Find sockets belonging to the target participant
        const targetSockets = [];
        room.users = room.users.filter(u => {
            if (u.name.toLowerCase() === normTarget.toLowerCase()) {
                targetSockets.push(u.id);
                return false;
            }
            return true;
        });

        // Notify and disconnect all target user sockets from this room
        for (const sockId of targetSockets) {
            const targetSocket = io.sockets.sockets.get(sockId);
            if (targetSocket) {
                targetSocket.emit('room_kicked', {
                    roomId: cleanRoomId,
                    message: `You were removed from "${room.roomName}" by the host and cannot rejoin.`
                });
                targetSocket.leave(cleanRoomId);
            }
        }

        const kickSysMsg = {
            id: 'sys_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            username: 'System',
            message: `${normTarget} was removed from the party by the host.`,
            timestamp: Date.now(),
            isSystem: true
        };
        if (!room.messages) room.messages = [];
        room.messages.push(kickSysMsg);
        if (room.messages.length > 200) room.messages.shift();
        room.updatedAt = Date.now();

        // Broadcast to remaining room members
        io.to(cleanRoomId).emit('room_chat_message', kickSysMsg);
        io.to(cleanRoomId).emit('room_user_kicked', {
            username: normTarget,
            usersCount: room.users.length,
            users: room.users,
            kickedUsers: room.kickedUsers
        });
        broadcastActiveRooms();
    });

    // Creator / Host can permanently kill the party so it never shows again
    socket.on('kill_room', (payload) => {
        if (!validRoomPayload(payload)) return;
        const { roomId } = payload;
        const cleanRoomId = cleanRoomIdValue(roomId);
        const room = watchRooms.get(cleanRoomId);
        if (room) {
            const member = isRoomMember(room, socket);
            const isHost = Boolean(member?.isCreator);
            if (isHost) {
                io.to(cleanRoomId).emit('room_ended', { 
                    roomId: cleanRoomId,
                    message: `Watch party "${room.roomName}" was closed by the host (${member.name}).`,
                    endedBy: member.name
                });
                io.in(cleanRoomId).socketsLeave(cleanRoomId);
                clearGuessPosterGame(room);
                clearMovieTriviaGame(room);
                clearPartyGame(room);
                watchRooms.delete(cleanRoomId);
                broadcastActiveRooms();
            } else {
                socket.emit('error_message', { message: 'Only the party host can end this room.' });
            }
        }
    });

    socket.on('extend_room_wait', (payload) => {

        if (!validRoomPayload(payload)) return;

        const roomId = cleanRoomIdValue(payload.roomId);

        const room = watchRooms.get(roomId);

        if (!room || !room.waitExpiresAt || !isRoomMember(room, socket)?.isCreator) return;

        room.waitExpiresAt = Date.now() + ROOM_WAIT_MS;

        io.to(roomId).emit('room_wait_updated', { roomId, waitExpiresAt: room.waitExpiresAt });

    });

    socket.on('leave_room', (payload) => {
        if (!validRoomPayload(payload)) return;
        const { roomId } = payload;
        const cleanRoomId = cleanRoomIdValue(roomId);
        socket.leave(cleanRoomId);
        const room = watchRooms.get(cleanRoomId);
        if (room) {
            const member = isRoomMember(room, socket);
            if (!member) return;
            room.users = room.users.filter(u => u.id !== socket.data.identity?.id);
            room.updatedAt = Date.now();
            // Keep an empty room for the reconnect grace window so the host can come back
            if (room.users.length > 0) {
                io.to(cleanRoomId).emit('room_user_left', { username: member.name, usersCount: room.users.length, users: room.users });
            }
            broadcastActiveRooms();
        }
    });

    socket.on('room_buffering_status', (payload) => {
        if (!validRoomPayload(payload) || typeof payload.buffering !== 'boolean') return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const member = isRoomMember(room, socket);
        if (!room || !member) return;

        member.buffering = payload.buffering;
        io.to(roomId).emit('room_buffering_status', {
            username: member.name,
            buffering: member.buffering,
            users: room.users
        });
    });

    socket.on('room_action', (payload) => {
        if (!validRoomPayload(payload)) return;
        const { roomId, action, currentTime, paused, movie, season, episode } = payload;
        const cleanRoomId = cleanRoomIdValue(roomId);
        const room = watchRooms.get(cleanRoomId);
        const member = isRoomMember(room, socket);
        if (room && member?.isCreator) {
            const now = Date.now();
            if (currentTime !== undefined && Number.isFinite(Number(currentTime)) && Number(currentTime) >= 0 && Number(currentTime) <= 86400) {
                room.currentTime = Number(currentTime);
            } else if (!room.paused) {
                room.currentTime = getRoomCurrentTime(room);
            }
            if (paused !== undefined && typeof paused === 'boolean') {
                room.paused = paused;
            }
            if (typeof movie === 'string') room.movie = movie.slice(0, 500);
            if (season !== undefined && Number.isInteger(Number(season)) && Number(season) >= 1 && Number(season) <= 1000) room.currentSeason = Number(season);
            if (episode !== undefined && Number.isInteger(Number(episode)) && Number(episode) >= 1 && Number(episode) <= 10000) room.currentEpisode = Number(episode);
            room.updatedAt = now;

            io.to(cleanRoomId).emit('room_sync', { 
                action: cleanText(action, 32, 'sync'),
                currentTime: room.currentTime, 
                paused: room.paused, 
                movie: room.movie, 
                season: room.currentSeason,
                episode: room.currentEpisode,
                username: member.name,
                users: room.users
            });
            broadcastActiveRooms();
        }
    });

    socket.on('guess_poster_start', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const member = isRoomMember(room, socket);
        if (!room || !member?.isCreator) return socket.emit('error_message', { message: 'Only the host can start a game.' });
        if (room.users.length < 2) return socket.emit('error_message', { message: 'Guess the Poster needs at least two room members.' });
        if (room.guessPosterGame?.status === 'active' || room.guessPosterGame?.status === 'reveal') {
            return socket.emit('error_message', { message: 'A Guess the Poster game is already running.' });
        }
        const candidates = cleanGuessPosterCandidates(payload.candidates);
        if (!candidates) return socket.emit('error_message', { message: 'Send between 1 and 30 valid poster candidates.' });

        clearGuessPosterGame(room);
        const game = createGuessPosterGame(candidates, Date.now(), GUESS_POSTER_ROUND_MS);
        game.scores = Object.fromEntries(room.users.slice(0, GUESS_POSTER_MAX_PLAYERS).map(user => [user.name, 0]));
        room.guessPosterGame = game;
        io.to(roomId).emit('guess_poster_started', { game: getPublicGuessPosterGame(game) });
        scheduleGuessPosterRound(roomId);
    });

    socket.on('guess_poster_submit', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const member = isRoomMember(room, socket);
        const game = room?.guessPosterGame;
        const guess = cleanText(payload.guess, GUESS_POSTER_MAX_GUESS_LENGTH);
        if (!room || !member || !game || game.status !== 'active') return;
        if (!Object.prototype.hasOwnProperty.call(game.scores, member.name)) return;
        const attemptId = `${socket.id}:${Date.now()}:${game.roundGuessCount || 0}`;
        if (!guess) {
            recordGuessAttempt(game, { attemptId, username: member.name, guess: '', points: 0, reason: 'invalid_guess', at: Date.now() });
            const failure = {
                attemptId,
                guess: '',
                points: 0,
                reason: 'invalid_guess',
                message: 'Your guess was empty. Enter a title or its initials.'
            };
            socket.emit('guess_poster_failed', failure);
            return socket.emit('error_message', { message: failure.message });
        }
        const now = Date.now();
        const rate = allowGuessRate((game.guessTimestamps || []).filter(entry => entry.socketId === socket.id).map(entry => entry.at), now);
        game.guessTimestamps = (game.guessTimestamps || []).filter(entry => entry.socketId !== socket.id || now - entry.at < 1000);
        if (!rate.allowed) return socket.emit('error_message', { message: 'Too many guesses. Slow down.' });
        game.guessTimestamps.push({ socketId: socket.id, at: now });
        if (game.correctGuesses.some(entry => normalizeDisplayName(entry.username) === normalizeDisplayName(member.name))) {
            recordGuessAttempt(game, { attemptId, username: member.name, guess, points: 0, reason: 'already_scored', at: now });
            const failure = {
                attemptId,
                guess,
                points: 0,
                reason: 'already_scored',
                message: 'You already scored this round.'
            };
            socket.emit('guess_poster_failed', failure);
            return socket.emit('error_message', { message: failure.message });
        }
        game.roundGuessCount = Number(game.roundGuessCount || 0) + 1;
        const result = classifyGuess(guess, {
            title: game.answerTitle,
            canonicalTitle: game.answerCanonicalTitle,
            aliases: game.answerAliases
        });
        recordGuessAttempt(game, { attemptId, username: member.name, guess, points: result.points, reason: result.reason, at: now });
        if (result.points <= 0) {
            io.to(roomId).emit('guess_poster_attempt', { username: member.name, points: 0, tier: result.tier, reason: result.reason });
            const failure = {
                attemptId,
                guess,
                points: 0,
                reason: result.reason,
                message: 'That answer was not accepted. Try the full title, a near match, or initials.'
            };
            socket.emit('guess_poster_failed', failure);
            return socket.emit('error_message', { message: failure.message });
        }
        game.correctGuesses.push({ username: member.name, points: result.points, reason: result.reason });
        game.scores[member.name] = Number(game.scores[member.name] || 0) + result.points;
        io.to(roomId).emit('guess_poster_correct', {
            username: member.name,
            points: result.points,
            tier: result.tier,
            reason: result.reason,
            attemptId,
            scores: { ...game.scores }
        });
    });

    socket.on('guess_poster_end', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        if (!room || !isRoomMember(room, socket)?.isCreator) return;
        clearGuessPosterGame(room);
        io.to(roomId).emit('guess_poster_ended', { roomId });
    });

    socket.on('movie_trivia_start', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const member = isRoomMember(room, socket);
        if (!room || !member?.isCreator) return socket.emit('error_message', { message: 'Only the host can start a game.' });
        if (room.users.length < 2) return socket.emit('error_message', { message: 'Movie Trivia needs at least two room members.' });
        if (room.movieTriviaGame?.status === 'active' || room.movieTriviaGame?.status === 'reveal') {
            return socket.emit('error_message', { message: 'A Movie Trivia game is already running.' });
        }
        const questions = buildMovieTriviaQuestions(payload);
        const game = createMovieTriviaGame(questions, Date.now(), MOVIE_TRIVIA_ROUND_MS);
        if (!game.questions.length) return socket.emit('error_message', { message: 'Send at least one valid trivia question.' });
        game.scores = Object.fromEntries(room.users.slice(0, MOVIE_TRIVIA_MAX_PLAYERS).map(user => [user.name, 0]));
        room.movieTriviaGame = game;
        const event = { game: getPublicMovieTriviaGame(game) };
        io.to(roomId).emit('movie_trivia_started', event);
        scheduleMovieTriviaRound(roomId);
    });

    socket.on('movie_trivia_submit', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const member = isRoomMember(room, socket);
        const game = room?.movieTriviaGame;
        const answerIndex = Number(payload.answerIndex);
        if (!room || !member || !game || game.status !== 'active') return;
        if (!Object.prototype.hasOwnProperty.call(game.scores, member.name)) return;
        if (!Number.isInteger(answerIndex)) {
            const failure = { points: 0, accepted: false, reason: 'invalid_answer', message: 'That trivia answer was invalid.' };
            socket.emit('movie_trivia_failed', failure);
            return socket.emit('error_message', { message: failure.message });
        }
        const result = scoreTriviaAnswer(game, member.name, answerIndex);
        if (!result.accepted) {
            const failure = {
                points: 0,
                accepted: false,
                reason: result.reason || 'already_answered',
                message: result.reason === 'already_answered' ? 'You already answered this round.' : 'That trivia answer was not accepted.'
            };
            socket.emit('movie_trivia_failed', failure);
            return socket.emit('error_message', { message: failure.message });
        }
        const scoreEvent = {
            username: member.name,
            points: result.points,
            correct: result.correct,
            reason: result.reason,
            scores: { ...game.scores },
            // Do not send answerIndex/correct-answer data while the round is live.
            accepted: true
        };
        io.to(roomId).emit('movie_trivia_score', scoreEvent);
        io.to(roomId).emit('movie_trivia_answered', scoreEvent);
        if (!result.correct) {
            const failure = {
                attemptId: `${socket.id}:${Date.now()}`,
                answerIndex,
                points: 0,
                reason: 'incorrect',
                message: 'Incorrect answer. The correct answer will be shown when the round is revealed.'
            };
            socket.emit('movie_trivia_failed', failure);
            socket.emit('error_message', { message: failure.message });
        }
    });

    socket.on('movie_trivia_end', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        if (!room || !isRoomMember(room, socket)?.isCreator) return;
        clearMovieTriviaGame(room);
        io.to(roomId).emit('movie_trivia_ended', { roomId });
    });

    socket.on('party_game_start', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const member = isRoomMember(room, socket);
        if (!room || !member?.isCreator) return socket.emit('error_message', { message: 'Only the host can start a game.' });
        if (room.users.length < 2) return socket.emit('error_message', { message: 'Party games need at least two room members.' });
        if (room.partyGame?.status === 'active' || room.partyGame?.status === 'reveal') {
            return socket.emit('error_message', { message: 'A party game is already running.' });
        }
        const gameType = ['emoji', 'quote', 'character', 'scramble', 'mixed'].includes(payload.gameType) ? payload.gameType : 'mixed';
        const candidates = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 50) : [];
        const characters = Array.isArray(payload.characters) ? payload.characters.slice(0, 100) : [];
        const game = createPartyGame({
            gameType,
            rounds: payload.rounds,
            customRounds: payload.customRounds ?? payload.maxRounds,
            roundMs: payload.roundMs || PARTY_GAME_ROUND_MS,
            candidates,
            characters,
            movie: payload.movie && typeof payload.movie === 'object' ? payload.movie : null
        }, Date.now());
        if (!game.maxRounds) return socket.emit('error_message', { message: 'Send at least one valid movie candidate or character.' });
        game.scores = Object.fromEntries(room.users.slice(0, PARTY_GAME_MAX_PLAYERS).map(user => [user.name, 0]));
        room.partyGame = game;
        const event = { game: getPublicPartyGame(game) };
        io.to(roomId).emit('party_game_started', event);
        io.to(roomId).emit('party_game_round_started', event);
        broadcastActiveRooms();
        schedulePartyGameRound(roomId);
    });

    socket.on('party_game_submit', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        const member = isRoomMember(room, socket);
        const game = room?.partyGame;
        const guess = cleanText(payload.guess, PARTY_GAME_MAX_GUESS_LENGTH);
        if (!room || !member || !game || game.status !== 'active') return;
        if (!Object.prototype.hasOwnProperty.call(game.scores, member.name)) return;
        const now = Date.now();
        game.guessTimestamps = Array.isArray(game.guessTimestamps) ? game.guessTimestamps : [];
        const recent = game.guessTimestamps.filter(entry => entry.socketId === socket.id).map(entry => entry.at);
        const rate = allowGuessRate(recent, now);
        game.guessTimestamps = game.guessTimestamps.filter(entry => entry.socketId !== socket.id || now - entry.at < 1000);
        if (!rate.allowed) return socket.emit('error_message', { message: 'Too many guesses. Slow down.' });
        game.guessTimestamps.push({ socketId: socket.id, at: now });
        const result = scorePartyGameGuess(game, member.name, guess, now);
        if (!result.accepted && result.duplicate) return socket.emit('error_message', { message: 'You already submitted this round.' });
        if (!result.accepted) return socket.emit('error_message', { message: 'That answer was not accepted.' });
        io.to(roomId).emit('party_game_score', {
            username: member.name,
            points: result.points,
            tier: result.tier,
            scores: { ...game.scores }
        });
    });

    socket.on('party_game_end', (payload) => {
        if (!validRoomPayload(payload)) return;
        const roomId = cleanRoomIdValue(payload.roomId);
        const room = watchRooms.get(roomId);
        if (!room || !isRoomMember(room, socket)?.isCreator) return;
        clearPartyGame(room);
        io.to(roomId).emit('party_game_ended', { roomId });
        broadcastActiveRooms();
    });

    socket.on('room_chat', (payload) => {
        if (!validRoomPayload(payload)) return;
        const { roomId, message } = payload;
        const cleanRoomId = cleanRoomIdValue(roomId);
        const text = cleanText(message, MESSAGE_MAX_LENGTH);
        const room = watchRooms.get(cleanRoomId);
        const member = isRoomMember(room, socket);
        if (!text || !member) return;
        const cleanUsername = member.name;
        socket.join(cleanRoomId);

        if (room && room.kickedUsers && room.kickedUsers.some(k => k.toLowerCase() === cleanUsername.toLowerCase())) {
            socket.emit('room_kicked', { 
                roomId: cleanRoomId, 
                message: 'You were removed from this Watch Party and cannot participate.' 
            });
            socket.leave(cleanRoomId);
            return;
        }

        const chatMsg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            username: cleanUsername,
            message: text,
            timestamp: Date.now()
        };

        if (room) {
            if (!room.messages) room.messages = [];
            room.messages.push(chatMsg);
            if (room.messages.length > 200) room.messages.shift();
            room.updatedAt = Date.now();
        }

        io.to(cleanRoomId).emit('room_chat_message', chatMsg);
    });

    socket.on('disconnect', () => {
        visitorData.onlineUsers = Math.max(0, visitorData.onlineUsers - 1);
        const now = Date.now();
        let changed = false;
        for (const [roomId, room] of watchRooms.entries()) {
            room.pendingRequests = (room.pendingRequests || []).filter(request => request.socketId !== socket.id);
            const disconnectedMember = room.users.find(user => user.id === socket.data.identity?.id);
            if (disconnectedMember) {
                room.reconnectGrace = (room.reconnectGrace || []).filter(entry => entry.username.toLowerCase() !== disconnectedMember.name.toLowerCase());
                room.reconnectGrace.push({ username: disconnectedMember.name, isCreator: disconnectedMember.isCreator, expiresAt: now + 30_000 });
            }
            const beforeCount = room.users.length;
            room.users = room.users.filter(u => u.id !== socket.data.identity?.id);
            if (room.users.length !== beforeCount) {
                changed = true;
                room.updatedAt = now;
                if (room.users.length > 0) {
                    io.to(roomId).emit('room_sync', {
                        action: 'user_disconnect',
                        currentTime: getRoomCurrentTime(room),
                        paused: room.paused,
                        movie: room.movie,
                        season: room.currentSeason,
                        episode: room.currentEpisode,
                        usersCount: room.users.length,
                        users: room.users
                    });
                }
            }
        }
        if (changed) {
            broadcastActiveRooms();
        }
        io.emit('visitorUpdate', {
            onlineUsers: visitorData.onlineUsers,
            todayVisitors: visitorData.todayVisitors,
            totalVisitors: visitorData.totalVisitors
        });
    });
});
app.use((req, res, next) => {
    const clientIP = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    trackVisitor(clientIP, req.path);
    next();
});
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'sl-flix-pro' });
});
app.get('/readyz', (req, res) => {
    res.status(200).json({ status: 'ready' });
});
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req) => {
        if (req.headers['x-no-compression']) return false;
        return true;
    }
}));
app.use((req, res, next) => {
    if (req.url.startsWith('/assets/') || req.path === '/index.html') {
        return next();
    }
    if (/\.(ts|tsx|map)$/.test(req.url)) {
        if (process.env.NODE_ENV !== 'production') return next();
        console.warn(`[SECURITY] Blocked source file: ${req.url}`);
        return res.status(403).send('Forbidden');
    }
    next();
});
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https:",
        "font-src 'self' data: https:",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: data: https:",
        "connect-src 'self' blob: https: wss: ws:",
        "frame-src 'self' https:"
    ].join('; '));
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});
const FIXED_PROXY_HOSTS = [
    'api.omegatech.app',
    'h5-api.aoneroom.com',
    '123movienow.cc',
    'moviebox.ph',
    'cineverse.name.ng',
    'movieapi.giftedtech.co.ke',
    'omegatech-api.dixonomega.tech'
];
const MAX_PROXY_REDIRECTS = 3;
const PROXY_DNS_TIMEOUT_MS = 3000;
const PROXY_TIMEOUT_MS = 15000;
const PROXY_RESPONSE_IDLE_TIMEOUT_MS = 30000;
const MAX_PROXY_RESPONSE_BYTES = 4 * 1024 * 1024;
const proxyCircuit = createUpstreamCircuitBreaker();

function isAllowedProxyHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return FIXED_PROXY_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function isPrivateAddress(address) {
    if (net.isIPv4(address)) {
        const octets = address.split('.').map(Number);
        return octets[0] === 10 || octets[0] === 127 ||
            (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
            (octets[0] === 192 && octets[1] === 168) ||
            (octets[0] === 169 && octets[1] === 254) || octets[0] === 0;
    }
    if (net.isIPv6(address)) {
        const normalized = address.toLowerCase();
        return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
            normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
            normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('::ffff:127.') ||
            normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.') ||
            normalized.startsWith('::ffff:172.');
    }
    return true;
}

async function resolveFixedProxyHost(hostname) {
    const lookup = dns.lookup(hostname, { all: true, verbatim: true });
    const records = await Promise.race([
        lookup,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Proxy DNS timeout')), PROXY_DNS_TIMEOUT_MS))
    ]);
    const publicRecord = records.find((record) => !isPrivateAddress(record.address));
    if (!publicRecord) throw new Error('Proxy destination resolved to a private address');
    return publicRecord;
}

async function proxyRequest(req, res, targetHost, targetPath, extraHeaders = {}, redirectHop = 0) {
    if (res.headersSent) return;
    const gate = proxyCircuit.beforeRequest(targetHost, `${targetHost}${targetPath}`);
    if (!gate.allowed) return res.status(503).json(gate.response);
    if (!isAllowedProxyHost(targetHost)) {
        return res.status(502).json({ code: -1, message: 'Proxy destination is not allowlisted' });
    }
    let address;
    try {
        address = await resolveFixedProxyHost(targetHost);
    } catch (error) {
        return res.status(502).json({ code: -1, message: 'Proxy destination could not be validated' });
    }
    const targetUrl = `https://${targetHost}${targetPath}`;
    console.log(`[PROXY] ${req.method} ${req.url} -> ${targetUrl}`);
    const options = {
        hostname: targetHost,
        path: targetPath,
        method: req.method,
        headers: {
            ...req.headers,
            host: targetHost,
            ...extraHeaders
        },
        timeout: PROXY_TIMEOUT_MS,
        lookup: (_hostname, options, callback) => { const cb = typeof options === 'function' ? options : callback; const opts = typeof options === 'function' ? {} : (options || {}); if (opts.all) return cb(null, [{ address: address.address, family: address.family }]); return cb(null, address.address, address.family); },
        servername: targetHost
    };
    const proxyReq = https.request(options, (proxyRes) => {
        if (res.headersSent) return;
        if (proxyRes.statusCode >= 500) {
            proxyRes.resume();
            return res.status(503).json(proxyCircuit.recordFailure(targetHost, `${targetHost}${targetPath}`));
        }
        proxyCircuit.recordSuccess(targetHost);
        if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            if (redirectHop >= MAX_PROXY_REDIRECTS) {
                proxyRes.resume();
                return res.status(502).json({ code: -1, message: 'Proxy redirect limit exceeded' });
            }
            let redirectUrl;
            try {
                redirectUrl = new URL(proxyRes.headers.location, targetUrl);
                if (redirectUrl.protocol !== 'https:' || !isAllowedProxyHost(redirectUrl.hostname)) {
                    proxyRes.resume();
                    return res.status(502).json({ code: -1, message: 'Proxy redirect destination is not allowlisted' });
                }
            } catch (error) {
                proxyRes.resume();
                return res.status(502).json({ code: -1, message: 'Proxy returned an invalid redirect' });
            }
            proxyRes.resume();
            return proxyRequest(req, res, redirectUrl.hostname, redirectUrl.pathname + redirectUrl.search, extraHeaders, redirectHop + 1);
        }
        const declaredLength = Number(proxyRes.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_RESPONSE_BYTES) {
            proxyRes.resume();
            return res.status(413).json({ code: -1, message: 'Proxy response exceeded size limit' });
        }
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        let responseBytes = 0;
        proxyRes.on('data', (chunk) => {
            responseBytes += chunk.length;
            if (responseBytes > MAX_PROXY_RESPONSE_BYTES) {
                proxyRes.destroy(new Error('Proxy response exceeded size limit'));
                if (!res.destroyed) res.destroy();
            }
        });
        proxyRes.setTimeout(PROXY_RESPONSE_IDLE_TIMEOUT_MS, () => proxyRes.destroy(new Error('Proxy response idle timeout')));
        proxyRes.pipe(res, { end: true });
    });
    proxyReq.on('error', (err) => {
        if (res.headersSent) return;
        console.error(`[PROXY ERROR] ${targetHost}:`, err.message);
        res.status(503).json(proxyCircuit.recordFailure(targetHost, `${targetHost}${targetPath}`));
    });
    proxyReq.on('timeout', () => {
        if (res.headersSent) return;
        proxyReq.destroy();
        res.status(503).json(proxyCircuit.recordFailure(targetHost, `${targetHost}${targetPath}`));
    });
    if (req.body) {
        req.pipe(proxyReq, { end: true });
    } else {
        proxyReq.end();
    }
}
const omegatechLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 60,
    message: { error: "Rate limit exceeded" },
    keyGenerator: (req) => {
        const forwardedHeader = req.headers['forwarded'];
        if (forwardedHeader) {
            const match = forwardedHeader.match(/for="?([^;"]+)"?/);
            if (match && match[1]) return match[1].trim();
        }
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (xForwardedFor) {
            return xForwardedFor.split(',')[0].trim();
        }
        return req.ip;
    },
    validate: { xForwardedForHeader: false, default: false }
});
const metadataProxyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 120,
    message: { error: 'Metadata proxy rate limit exceeded' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false }
});
const playerProxyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 60,
    message: { error: 'Player proxy rate limit exceeded' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false }
});
app.use('/api-omegatech', omegatechLimiter, (req, res) => {
    const pathWithoutPrefix = req.url.startsWith('/') ? req.url : '/' + req.url;
    proxyRequest(
        req, res, 
        'api.omegatech.app', 
        pathWithoutPrefix,
        {}
    );
});
app.use('/api-metadata', metadataProxyLimiter, (req, res) => {
    const pathWithoutPrefix = req.url.startsWith('/') ? req.url : '/' + req.url;
    proxyRequest(
        req, res, 
        'h5-api.aoneroom.com', 
        '/wefeed-h5api-bff' + pathWithoutPrefix,
        { 'Origin': 'https://moviebox.ph', 'Referer': 'https://moviebox.ph/' }
    );
});
app.use('/api-player', playerProxyLimiter, (req, res) => {
    const pathWithoutPrefix = req.url.startsWith('/') ? req.url : '/' + req.url;
    proxyRequest(
        req, res, 
        '123movienow.cc', 
        '/wefeed-h5api-bff' + pathWithoutPrefix,
        { 'Origin': 'https://123movienow.cc', 'Referer': 'https://123movienow.cc/' }
    );
});
console.log('[PROXY] API proxies ready: metadata/player/stream');
app.use('/api', apiRouter);
// Helper to dynamically extract the host and protocol regardless of proxy / Cloud Run
function getBaseUrl(req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.headers['host'] || req.get('host') || 'localhost:3000').split(',')[0].trim();
    return `${proto}://${host}`;
}

// Robust fallback movie detail fetcher
async function fetchSubjectDetails(subjectId) {
    if (!subjectId) return null;
    const cleanId = String(subjectId).trim().replace(/\.png$/i, '');

    // 1. Try Omegatech API if numeric
    if (/^\d+$/.test(cleanId)) {
        try {
            const omRes = await fetch(`https://api.omegatech.app/api/movie/MovieBox-pro?action=detail&subjectId=${encodeURIComponent(cleanId)}`, {
                headers: { 'Origin': 'https://moviebox.ph', 'Referer': 'https://moviebox.ph/' },
                signal: AbortSignal.timeout(4000)
            });
            if (omRes.ok) {
                const data = await omRes.json();
                const s = data?.data?.subject || data?.data?.subjectDetail || data?.data?.detail || data?.data;
                if (s && (s.title || s.name)) return s;
            }
        } catch (e) {}
    }

    // 2. Try aoneroom BFF (both subjectId and detailPath)
    try {
        const queryParam = /^\d+$/.test(cleanId) ? `subjectId=${encodeURIComponent(cleanId)}` : `detailPath=${encodeURIComponent(cleanId)}`;
        const h5Res = await fetch(`https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?${queryParam}`, {
            headers: { 'Origin': 'https://moviebox.ph', 'Referer': 'https://moviebox.ph/' },
            signal: AbortSignal.timeout(4000)
        });
        if (h5Res.ok) {
            const data = await h5Res.json();
            const s = data?.data?.subject || data?.data?.subjectDetail || data?.data?.detail || data?.data;
            if (s && (s.title || s.name)) return s;
        }
    } catch (e) {}

    // 3. Try 123movienow BFF
    try {
        const queryParam = /^\d+$/.test(cleanId) ? `subjectId=${encodeURIComponent(cleanId)}` : `detailPath=${encodeURIComponent(cleanId)}`;
        const mRes = await fetch(`https://123movienow.cc/wefeed-h5api-bff/detail?${queryParam}`, {
            headers: { 'Origin': 'https://123movienow.cc', 'Referer': 'https://123movienow.cc/' },
            signal: AbortSignal.timeout(4000)
        });
        if (mRes.ok) {
            const data = await mRes.json();
            const s = data?.data?.subject || data?.data?.subjectDetail || data?.data?.detail || data?.data;
            if (s && (s.title || s.name)) return s;
        }
    } catch (e) {}

    // 4. Try Search fallback if cleanId has non-numeric characters (e.g. slug/title)
    try {
        const searchKeyword = cleanId.replace(/[-_]+/g, ' ').replace(/\b(s\d+|e\d+)\b/gi, '').trim();
        if (searchKeyword.length >= 2) {
            const sRes = await fetch(`https://api.omegatech.app/api/movie/MovieBox-pro?action=search&keyword=${encodeURIComponent(searchKeyword)}&page=1`, {
                signal: AbortSignal.timeout(4000)
            });
            if (sRes.ok) {
                const sData = await sRes.json();
                const list = sData?.data?.list || sData?.data?.items || sData?.data || [];
                if (Array.isArray(list) && list.length > 0) {
                    const first = list[0].subject || list[0];
                    if (first?.subjectId && /^\d+$/.test(String(first.subjectId))) {
                        const deep = await fetchSubjectDetails(first.subjectId);
                        if (deep) return deep;
                    }
                    if (first?.title || first?.name) return first;
                }
            }
        }
    } catch (e) {}

    return null;
}

// Default fallback poster for when none is found
const DEFAULT_OG_POSTER = '/icons/slflix.png';

// Helper for Movie / TV / Anime OG Generation
async function handleMovieOrTvOg(req, res, subjectId, forcedTheme = null) {
    if (!subjectId || subjectId.length < 2) return res.status(400).send('Invalid ID');
    const cleanId = String(subjectId).trim().replace(/\.png$/i, '');
    const cacheKey = `og_${forcedTheme || 'auto'}_${cleanId}`;

    try {
        const movie = await fetchSubjectDetails(cleanId);

        // Cache staff members from this movie so staff pages can look them up instantly!
        if (movie && (movie.staffList || movie.staffs || movie.actors)) {
            const list = movie.staffList || movie.staffs || movie.actors || [];
            list.forEach(s => {
                const id = String(s.staffId || s.id || '');
                if (id) {
                    staffMap.set(id, {
                        name: s.name || s.enName || '',
                        avatar: s.avatar?.url || (typeof s.avatar === 'string' ? s.avatar : '') || s.photo || '',
                        role: s.role || 'Actor'
                    });
                }
            });
        }

        const isTvSeries = movie?.subjectType === 2 || movie?.type === 'TV Series' || movie?.category === 'Series';
        const theme = forcedTheme || (isTvSeries ? 'tv' : 'movie');

        const title = req.query.title || movie?.title || movie?.name || (theme === 'tv' ? 'Featured TV Series' : 'Featured Movie');
        const posterUrl = req.query.poster || req.query.img || movie?.cover?.url || (typeof movie?.cover === 'string' ? movie?.cover : '') || movie?.thumbnail || movie?.poster?.url || movie?.image?.url || movie?.pic?.normal || movie?.horizontal_cover?.url || DEFAULT_OG_POSTER;
        const rating = req.query.rating || movie?.imdbRatingValue || movie?.imdbRating || movie?.rating || '8.5';
        const year = (movie?.releaseDate || '').split('-')[0] || req.query.year || '2026';
        const genre = movie?.genre || movie?.category || req.query.genre || (isTvSeries ? 'TV Series' : 'Movie');
        const description = (req.query.synopsis || req.query.desc || movie?.synopsis || movie?.description || movie?.introduction || movie?.summary || movie?.desc || movie?.content || movie?.postTitle || `Watch ${title} online free in ultra-high definition with multi-subtitles and zero ads on SLFLIX.`).trim();
        const duration = movie?.duration ? `${movie.duration}m` : (isTvSeries ? 'ALL SEASONS' : '4K HDR');

        const pngBuffer = await renderOgPng({
            theme: theme,
            title: title,
            description: description,
            posterUrl: posterUrl,
            rating: rating,
            year: year,
            duration: duration,
            genre: genre,
            quality: '4K ULTRA HD',
            audio: 'DOLBY AUDIO'
        }, cacheKey);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.send(pngBuffer);
    } catch (e) {
        console.error('[OG] Error generating image:', e.message);
        res.status(500).send('Error generating OG image');
    }
}

// Staff / Celebrity OG endpoint
app.get(['/api/og/staff/:staffId', '/api/og/staff/:staffId.png'], async (req, res) => {
    let staffId = (req.params.staffId || '').replace(/\.png$/, '');
    let name = req.query.name || '';
    let avatar = req.query.avatar || '';
    let role = req.query.role || '';

    if (!name && staffMap.has(staffId)) {
        const cached = staffMap.get(staffId);
        name = cached.name;
        avatar = avatar || cached.avatar;
        role = role || cached.role;
    }

    if (!name && staffId) {
        try {
            const staffApiUrl = `https://api.omegatech.app/api/movie/MovieBox-pro?action=staff&staffId=${encodeURIComponent(staffId)}&page=1`;
            const r = await fetch(staffApiUrl, { signal: AbortSignal.timeout(3000) });
            if (r.ok) {
                const d = await r.json();
                if (d.data?.staffName || d.data?.name) {
                    name = d.data.staffName || d.data.name;
                }
            }
        } catch (e) {}
    }

    if (!name) name = 'Featured Celebrity';
    if (!role) role = 'Actor / Filmmaker';

    const cacheKey = `staff_${staffId}_${name}`;

    try {
        const pngBuffer = await renderOgPng({
            theme: 'staff',
            title: name,
            description: `Explore the complete filmography, movies, and TV series starring ${name} on SLFLIX. Stream online free in ultra-high definition.`,
            posterUrl: avatar,
            role: role,
            rating: '9.2',
            genre: role
        }, cacheKey);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.send(pngBuffer);
    } catch (err) {
        console.error('[OG Staff] Error:', err);
        res.status(500).send('Error generating staff OG image');
    }
});

// TV Series OG endpoint
app.get(['/api/og/tv/:subjectId', '/api/og/tv/:subjectId.png', '/api/og/series/:subjectId', '/api/og/series/:subjectId.png'], async (req, res) => {
    let subjectId = (req.params.subjectId || '').replace(/\.png$/, '');
    await handleMovieOrTvOg(req, res, subjectId, 'tv');
});

// Movie OG endpoint
app.get(['/api/og/movie/:subjectId', '/api/og/movie/:subjectId.png'], async (req, res) => {
    let subjectId = (req.params.subjectId || '').replace(/\.png$/, '');
    await handleMovieOrTvOg(req, res, subjectId, 'movie');
});

// Live TV OG endpoint
app.get(['/api/og/live/:channelId', '/api/og/live/:channelId.png', '/api/og/live', '/api/og/live.png'], async (req, res) => {
    let channelId = (req.params.channelId || '').replace(/\.png$/, '');
    const cacheKey = `live_${channelId || 'global'}`;

    let channelName = req.query.name || 'Live TV & Sports';
    let channelLogo = req.query.logo || '';
    let category = req.query.category || 'Live Broadcast';
    let country = req.query.country || 'GLOBAL';

    if (channelId) {
        try {
            const found = getNormalizedChannels({ query: channelId, limit: 1 });
            if (found.data && found.data[0]) {
                const ch = found.data[0];
                channelName = ch.name || channelName;
                channelLogo = ch.logo || channelLogo;
                category = (ch.categories || []).join(', ') || category;
                country = ch.country || country;
            }
        } catch (e) {}
    }

    try {
        const pngBuffer = await renderOgPng({
            theme: 'live',
            title: channelName,
            description: `Watch ${channelName} live broadcast around the clock with zero buffering, multi-language commentary, and crystal clear 60FPS streaming on SLFLIX.`,
            posterUrl: channelLogo,
            year: country,
            genre: category,
            quality: '60 FPS',
            audio: 'LIVE STEREO'
        }, cacheKey);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.send(pngBuffer);
    } catch (err) {
        console.error('[OG Live] Error:', err);
        res.status(500).send('Error generating live OG image');
    }
});

// Anime OG endpoint
app.get(['/api/og/anime/:subjectId', '/api/og/anime/:subjectId.png', '/api/og/anime', '/api/og/anime.png'], async (req, res) => {
    let subjectId = (req.params.subjectId || '').replace(/\.png$/, '');
    if (subjectId) {
        await handleMovieOrTvOg(req, res, subjectId, 'anime');
    } else {
        const pngBuffer = await renderOgPng({
            theme: 'anime',
            title: 'Anime Simulcast HD',
            description: 'Stream latest anime series, movies, and OVA episodes with English subtitles and dub in 1080p full HD on SLFLIX.',
            genre: 'Anime, Action, Fantasy'
        }, 'anime_global');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.send(pngBuffer);
    }
});

// Novel OG endpoint
app.get(['/api/og/novel/:novelId', '/api/og/novel/:novelId.png', '/api/og/novel', '/api/og/novel.png', '/api/og/novels.png'], async (req, res) => {
    try {
        let novelId = (req.params.novelId || '').replace(/\.png$/, '');
        let title = req.query.title || 'SLFLIX Novel Hub';
        let author = req.query.author || 'Popular Author';
        let cover = req.query.cover || '';
        let score = req.query.score || '8.5';
        let views = req.query.views || '12K';

        if (novelId && (!req.query.title || !cover)) {
            try {
                const nRes = await fetch(`https://api.omegatech.app/api/Novel/novel?action=detail&novelId=${encodeURIComponent(novelId)}`, {
                    signal: AbortSignal.timeout(3000)
                });
                if (nRes.ok) {
                    const nData = await nRes.json();
                    if (nData.data || nData.result || nData.novel) {
                        const info = nData.data || nData.result || nData.novel;
                        title = info.title || title;
                        author = info.author || author;
                        cover = info.cover || cover;
                        score = info.score || score;
                        views = info.totalViews || views;
                    }
                }
            } catch (e) {}
        }

        const pngBuffer = await renderOgPng({
            theme: 'novel',
            title: title,
            description: `Read "${title}" by ${author} on SLFLIX Novel Hub. Immersive reading, auto-scroll and full chapters online.`,
            posterUrl: cover || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800',
            rating: score,
            year: `${views} Views`,
            genre: 'Romance, Fantasy, Action',
            quality: 'FULL CHAPTERS'
        }, `novel_${novelId || 'global'}`);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.send(pngBuffer);
    } catch (err) {
        console.error('[OG Novel] Error:', err);
        res.status(500).send('Error generating novel OG image');
    }
});

// Home / Master OG endpoint - directly serve the official high-res app icon image
app.get(['/api/og/home', '/api/og/home.png', '/api/og', '/api/og.png'], (req, res) => {
    const iconPath = path.resolve(__dirname, 'public/icons/slflix.png');
    if (fs.existsSync(iconPath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, immutable');
        return res.sendFile(iconPath);
    }
    res.redirect('/icons/slflix.png');
});

// Generic / Backward-compatible endpoint: /api/og/:subjectId
app.get(['/api/og/:subjectId', '/api/og/:subjectId.png'], async (req, res) => {
    let subjectId = (req.params.subjectId || '').replace(/\.png$/, '');
    if (!subjectId || subjectId.length < 2) return res.status(400).send('Invalid ID');

    if (subjectId.startsWith('staff-') || subjectId.startsWith('staff_')) {
        req.params.staffId = subjectId.replace(/^staff[-_]/, '');
        const fakeReq = { ...req, params: { staffId: req.params.staffId } };
        return app._router.handle(fakeReq, res, () => {});
    }

    await handleMovieOrTvOg(req, res, subjectId);
});

// Robots.txt dynamic handler with host auto-detection
app.get('/robots.txt', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`);
});

// Sitemap in-memory cache
const sitemapCache = new Map();

// Dynamic Sitemap generator with host auto-detection
app.get('/sitemap.xml', async (req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600');
    const baseUrl = getBaseUrl(req);

    const cached = sitemapCache.get(baseUrl);
    if (cached && Date.now() < cached.expiresAt) {
        return res.send(cached.xml);
    }

    const today = new Date().toISOString().split('T')[0];
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${baseUrl}/</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${baseUrl}/trending</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>${baseUrl}/toplist</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>
    <url>
        <loc>${baseUrl}/live-tv</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>
    <url>
        <loc>${baseUrl}/news</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.7</priority>
    </url>
    <url>
        <loc>${baseUrl}/sports</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.7</priority>
    </url>
    <url>
        <loc>${baseUrl}/webtoon</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.7</priority>
    </url>
    <url>
        <loc>${baseUrl}/staff</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
    </url>
    <url>
        <loc>${baseUrl}/api-docs</loc>
        <lastmod>${today}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
    </url>`;

    try {
        const categories = [
            { id: 'trending', url: 'https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/trending?page=0&perPage=50' },
            { id: 'movies', url: 'https://h5-api.aoneroom.com/wefeed-h5api-bff/ranking-list/content?id=997144265920760504&page=1&perPage=50' },
            { id: 'anime', url: 'https://h5-api.aoneroom.com/wefeed-h5api-bff/ranking-list/content?id=62133389738001440&page=1&perPage=50' }
        ];

        const seenIds = new Set();

        for (const cat of categories) {
            try {
                const response = await fetch(cat.url, {
                    headers: { 'Origin': 'https://moviebox.ph', 'Referer': 'https://moviebox.ph/' },
                    signal: AbortSignal.timeout(3000)
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.code === 0 && data.data?.subjectList) {
                        data.data.subjectList.forEach(movie => {
                            const prefix = movie.type?.toLowerCase().includes('series') ? '/tv/' : '/movie/';
                            const id = movie.subjectId || movie.detailPath;
                            if (id && !seenIds.has(id)) {
                                seenIds.add(id);
                                sitemap += `
    <url>
        <loc>${baseUrl}${prefix}${id}</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>`;
                            }
                        });
                    }
                }
            } catch (err) {}
        }

        // Also query Omegatech popular releases if possible
        try {
            const omRes = await fetch('https://api.omegatech.app/api/movie/MovieBox-pro?action=search&keyword=a&page=1', {
                signal: AbortSignal.timeout(3000)
            });
            if (omRes.ok) {
                const omData = await omRes.json();
                const results = omData.data?.results || omData.data?.items || [];
                results.forEach(m => {
                    const id = m.subjectId || m.detailPath;
                    if (id && !seenIds.has(id)) {
                        seenIds.add(id);
                        const isSeries = m.subjectType === 2 || (m.type && m.type.toLowerCase().includes('series'));
                        sitemap += `
    <url>
        <loc>${baseUrl}${isSeries ? '/tv/' : '/movie/'}${id}</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>`;
                    }
                });
            }
        } catch (omErr) {}
    } catch (e) {
        console.error('[SITEMAP] Error fetching sitemap items:', e.message);
    }

    sitemap += '\n</urlset>';
    sitemapCache.set(baseUrl, { xml: sitemap, expiresAt: Date.now() + 15 * 60 * 1000 });
    res.send(sitemap);
});
app.get('/_i18n/:lang/messages.json', (req, res) => {
    const lang = req.params.lang || 'en';
    const messagesPath = path.join(__dirname, 'public', '_i18n', lang, 'messages.json');
    if (fs.existsSync(messagesPath)) {
        res.json(JSON.parse(fs.readFileSync(messagesPath, 'utf8')));
    } else {
        res.json({});
    }
});
app.get('/manifest.webmanifest', (req, res) => {
    const manifestPath = path.join(__dirname, 'public', 'manifest.webmanifest');
    if (fs.existsSync(manifestPath)) {
        res.json(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    } else {
        res.json({ name: 'SLFLIX' });
    }
});
app.get('/api/domain', (req, res) => {
    res.json({ domain: req.get('host') || 'localhost:3001' });
});
app.get(/^\/admin/, (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
app.use(async (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.includes('.')) {
        return next();
    }
    const isSeoRoute = req.path.startsWith('/movie') || 
                       req.path.startsWith('/tv') || 
                       req.path.startsWith('/series') || 
                       req.path.startsWith('/staff') || 
                       req.path.startsWith('/live') || 
                       req.path.startsWith('/anime') || 
                       req.path.startsWith('/novel') || 
                       req.path.startsWith('/search') || 
                       req.path.startsWith('/trending') || 
                       req.path.startsWith('/toplist') || 
                       req.path.startsWith('/watch-party') || 
                       req.path === '/';
    if (process.env.NODE_ENV === 'production' || isSeoRoute) {
        await getDynamicHtml(req, res);
    } else {
        next();
    }
});
if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
        root: path.resolve(__dirname),
        configFile: path.resolve(__dirname, 'vite.config.ts'),
        server: { 
            middlewareMode: true,
            hmr: process.env.DISABLE_HMR === 'true' ? false : {
                port: 24678
            }
        },
        appType: 'spa',
    });
    global.viteServer = vite;
    app.use(vite.middlewares);
} else {
    app.use(express.static(path.join(__dirname, 'dist'), {
        maxAge: '1y',
        etag: true,
        setHeaders: (res, path) => {
            if (path.endsWith('.js')) res.set('Content-Type', 'application/javascript');
            if (path.endsWith('.css')) res.set('Content-Type', 'text/css');
        }
    }));
}

function injectSeoTags(html, { title, description, image, icon, url, type = 'video.movie' }) {
    if (title) {
        html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
        html = html.replace(/<meta property="og:title" content=".*?"\s*\/?>/, `<meta property="og:title" content="${title}">`);
        html = html.replace(/<meta name="twitter:title" content=".*?"\s*\/?>/, `<meta name="twitter:title" content="${title}">`);
    }
    if (description) {
        html = html.replace(/<meta name="description" content=".*?"\s*\/?>/, `<meta name="description" content="${description}">`);
        html = html.replace(/<meta property="og:description" content=".*?"\s*\/?>/, `<meta property="og:description" content="${description}">`);
        html = html.replace(/<meta name="twitter:description" content=".*?"\s*\/?>/, `<meta name="twitter:description" content="${description}">`);
    }
    if (image) {
        html = html.replace(/<meta property="og:image" content=".*?"\s*\/?>/, `<meta property="og:image" content="${image}">\n    <meta property="og:image:type" content="image/png">\n    <meta property="og:image:width" content="1200">\n    <meta property="og:image:height" content="630">`);
        html = html.replace(/<meta name="twitter:image" content=".*?"\s*\/?>/, `<meta name="twitter:image" content="${image}">`);
    }
    if (type) {
        html = html.replace(/<meta property="og:type" content=".*?"\s*\/?>/, `<meta property="og:type" content="${type}">`);
    }
    if (url) {
        html = html.replace(/<meta property="og:url" content=".*?"\s*\/?>/, `<meta property="og:url" content="${url}">`);
        if (html.includes('rel="canonical"')) {
            html = html.replace(/rel="canonical" href=".*?"/, `rel="canonical" href="${url}"`);
        } else {
            html = html.replace('</head>', `<link rel="canonical" href="${url}" />\n</head>`);
        }
    }
    if (icon) {
        html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/jpeg" href="${icon}">`);
        html = html.replace(/<link rel="shortcut icon"[^>]*>/, `<link rel="shortcut icon" type="image/jpeg" href="${icon}">`);
        html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${icon}">`);
    }
    return html;
}

async function getDynamicHtml(req, res) {
    const pathParts = req.path.split('/').filter(Boolean);
    const section = pathParts[0] || '';
    const subjectId = pathParts[1] || '';

    const isMovie = section === 'movie';
    const isTv = section === 'tv' || section === 'series';
    const isStaff = section === 'staff';
    const isLive = section === 'live' || section === 'live-tv';
    const isAnime = section === 'anime';
    const isNovel = section === 'novel' || section === 'novels';
    const isSearch = section === 'search';
    const isTrending = section === 'trending';
    const isToplist = section === 'toplist';
    const isWatchParty = section === 'watch-party';
    const isHome = pathParts.length === 0;

    let htmlPath = process.env.NODE_ENV === 'production' 
        ? path.join(__dirname, 'dist', 'index.html')
        : path.join(__dirname, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
    }
    let html = fs.readFileSync(htmlPath, 'utf8');
    const hostUrl = getBaseUrl(req);
    const fullUrl = `${hostUrl}${req.originalUrl}`;

    try {
        if ((isMovie || isTv) && subjectId && subjectId.length > 2) {
            const movie = await fetchSubjectDetails(subjectId);
            const isTvSeries = isTv || movie?.subjectType === 2 || movie?.type === 'TV Series' || movie?.category === 'Series';
            const movieTitle = movie?.title || movie?.name || req.query.title || (isTvSeries ? 'Featured TV Series' : 'Featured Movie');
            const rawTitle = isTvSeries 
                ? `${movieTitle} | Stream TV Series Online Free - SLFLIX`
                : `${movieTitle} | Watch Online Free - SLFLIX`;
            const movieOwnDesc = (movie?.synopsis || movie?.description || movie?.introduction || movie?.summary || movie?.desc || movie?.content || movie?.postTitle || req.query.desc || req.query.synopsis || '').trim();
            const rawDescription = movieOwnDesc || `Watch ${movieTitle} online free in HD. ${movie?.genre || movie?.category || 'Stream now on SLFLIX with zero ads'}.`;
            const title = rawTitle.replace(/"/g, '&quot;');
            const description = rawDescription.replace(/"/g, '&quot;').replace(/[\r\n]+/g, ' ');
            const image = `${hostUrl}/api/og/${isTvSeries ? 'tv' : 'movie'}/${subjectId}.png`;
            const movieCoverUrl = movie?.cover?.url || (typeof movie?.cover === 'string' ? movie?.cover : '') || movie?.thumbnail || movie?.poster?.url || movie?.image?.url || `${hostUrl}/icons/slflix.png`;

            // Cache staff members for future staff page requests
            if (movie && (movie.staffList || movie.staffs || movie.actors)) {
                const list = movie.staffList || movie.staffs || movie.actors || [];
                list.forEach(s => {
                    const sId = String(s.staffId || s.id || '');
                    if (sId) {
                        staffMap.set(sId, {
                            name: s.name || s.enName || '',
                            avatar: s.avatar?.url || s.avatar || s.photo || '',
                            role: s.role || 'Actor'
                        });
                    }
                });
            }

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: movieCoverUrl,
                url: fullUrl,
                type: isTvSeries ? 'video.tv_show' : 'video.movie'
            });
        } else if (isStaff && subjectId) {
            let staffInfo = staffMap.get(subjectId);
            if (!staffInfo) {
                try {
                    const sRes = await fetch(`https://api.omegatech.app/api/movie/MovieBox-pro?action=staff&staffId=${encodeURIComponent(subjectId)}&page=1`, {
                        signal: AbortSignal.timeout(3000)
                    });
                    if (sRes.ok) {
                        const sData = await sRes.json();
                        if (sData.data?.staffName || sData.data?.name) {
                            staffInfo = {
                                name: sData.data.staffName || sData.data.name,
                                avatar: sData.data.avatar || sData.data.photo || '',
                                role: 'Actor'
                            };
                            staffMap.set(subjectId, staffInfo);
                        }
                    }
                } catch (e) {}
            }

            const staffName = staffInfo?.name || 'Celebrity Talent';
            const title = `${staffName} | Filmography & Works - SLFLIX`.replace(/"/g, '&quot;');
            const description = `Explore all movies, series, and releases starring ${staffName} on SLFLIX. Watch online free in ultra-high definition.`.replace(/"/g, '&quot;');
            const image = `${hostUrl}/api/og/staff/${subjectId}.png?name=${encodeURIComponent(staffName)}`;
            const iconUrl = staffInfo?.avatar || `${hostUrl}/icons/slflix.png`;

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: iconUrl,
                url: fullUrl,
                type: 'profile'
            });
        } else if (isLive) {
            const title = 'Live TV Online Free | 24/7 Global Channels & Sports - SLFLIX';
            const description = 'Stream over 1,500+ premium live television channels, sports, and global news free in HD with zero delay on SLFLIX.';
            const image = `${hostUrl}/api/og/live.png`;

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: `${hostUrl}/icons/slflix.png`,
                url: fullUrl,
                type: 'video.other'
            });
        } else if (isAnime) {
            const title = 'Watch Anime Online Free in HD | Sub & Dub - SLFLIX';
            const description = 'Stream popular anime series, movies, and simulcasts with English sub and dub in 1080p HD on SLFLIX.';
            const image = `${hostUrl}/api/og/anime.png`;

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: `${hostUrl}/icons/slflix.png`,
                url: fullUrl,
                type: 'video.tv_show'
            });
        } else if (isNovel) {
            let novelTitle = 'SLFLIX Novel Hub | Read Romance, Fantasy & Mystery Web Novels';
            let novelDesc = 'Immersive e-reader with auto-scroll, chapter bookmarks, and thousands of top-rated web novels online for free on SLFLIX.';
            let novelCover = `${hostUrl}/icons/slflix.png`;
            let novelId = subjectId;

            if (novelId) {
                try {
                    const nRes = await fetch(`https://api.omegatech.app/api/Novel/novel?action=detail&novelId=${encodeURIComponent(novelId)}`, {
                        signal: AbortSignal.timeout(3000)
                    });
                    if (nRes.ok) {
                        const nData = await nRes.json();
                        const nInfo = nData.data || nData.result || nData.novel;
                        if (nInfo?.title) {
                            novelTitle = `${nInfo.title} | Read Free Online - SLFLIX Novel Hub`;
                            novelDesc = (nInfo.summary || `Read ${nInfo.title} by ${nInfo.author || 'Author'} online free on SLFLIX Novel Hub.`).trim();
                            novelCover = nInfo.cover || novelCover;
                        }
                    }
                } catch (e) {}
            }

            const image = novelId ? `${hostUrl}/api/og/novel/${novelId}.png` : `${hostUrl}/api/og/novels.png`;
            html = injectSeoTags(html, {
                title: novelTitle.replace(/"/g, '&quot;'),
                description: novelDesc.replace(/"/g, '&quot;').replace(/[\r\n]+/g, ' '),
                image,
                icon: novelCover,
                url: fullUrl,
                type: 'book'
            });
        } else if (isSearch) {
            const q = (req.query.q || req.query.query || '').trim();
            const title = q ? `Search Results for "${q}" | SLFLIX` : 'Search Movies & TV Series | SLFLIX';
            const description = q ? `Browse top movies, TV series, and anime matches for "${q}" on SLFLIX.` : 'Search and stream thousands of free HD movies, anime, and TV series online with zero ads on SLFLIX.';
            const image = `${hostUrl}/api/og/home.png`;

            html = injectSeoTags(html, {
                title: title.replace(/"/g, '&quot;'),
                description: description.replace(/"/g, '&quot;'),
                image,
                icon: `${hostUrl}/icons/slflix.png`,
                url: fullUrl,
                type: 'website'
            });
        } else if (isTrending) {
            const title = 'Trending Movies & Series Right Now | SLFLIX';
            const description = 'Discover the hottest trending movies, popular television series, and viral releases today on SLFLIX.';
            const image = `${hostUrl}/api/og/home.png`;

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: `${hostUrl}/icons/slflix.png`,
                url: fullUrl,
                type: 'website'
            });
        } else if (isToplist) {
            const title = 'Top Rated Movies & Shows of All Time | SLFLIX';
            const description = 'Explore the highest-rated cinema classics, award winners, and critically acclaimed television series streaming free on SLFLIX.';
            const image = `${hostUrl}/api/og/home.png`;

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: `${hostUrl}/icons/slflix.png`,
                url: fullUrl,
                type: 'website'
            });
        } else if (isWatchParty) {
            const title = 'Watch Party Live | Synchronized Movie Streaming with Friends - SLFLIX';
            const description = 'Join and host synchronized live movie watch parties with real-time chat, synchronized playback, and instant room sharing on SLFLIX.';
            const image = `${hostUrl}/api/og/home.png`;

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: `${hostUrl}/icons/slflix.png`,
                url: fullUrl,
                type: 'website'
            });
        } else if (isHome) {
            const title = 'SLFLIX | Watch Free Movies, TV Series & Live Streams Online in 4K';
            const description = 'Stream over 10,000+ blockbuster movies, binge-worthy TV series, anime, and live channels with zero ads and no registration.';
            const image = `${hostUrl}/icons/slflix.png`;

            html = injectSeoTags(html, {
                title,
                description,
                image,
                icon: `${hostUrl}/icons/slflix.png`,
                url: fullUrl,
                type: 'website'
            });
        }
    } catch (e) {
        console.error('[SEO] Error fetching dynamic details:', e.message);
    }

    if (process.env.NODE_ENV !== 'production' && global.viteServer) {
        try {
            html = await global.viteServer.transformIndexHtml(req.originalUrl, html);
        } catch (e) {
            console.error('[Vite] Transform error:', e);
        }
    }
    res.send(html);
}
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SLFLIX Server running on http://localhost:${PORT}`);
    console.log(`📊 Full production app ready!`);
});
export default app;
