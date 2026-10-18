import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io as socketIoClient } from 'socket.io-client';
import { ApiService } from '../services/api';
import { MovieResult, VideoSource, Subtitle, Season } from '../types';
import VideoPlayer from './VideoPlayer';
import { getOptimizedImageUrl } from '../utils/image';
import { useNetworkQuality } from '../hooks/useNetworkQuality';

type RoomEntryMode = 'manual' | 'auto';

const getEntryModeLabel = (entryMode: RoomEntryMode = 'manual') => (
    entryMode === 'auto' ? 'Auto-Enter' : 'Manual Approval'
);
const WATCH_PARTY_FALLBACK = '/icons/slflix.png';
const normalizeRoomId = (value: unknown) => {
    const roomId = String(value || '').trim().toUpperCase();
    return /^[A-Z0-9_-]{1,64}$/.test(roomId) ? roomId : '';
};
const getPosterSrc = (movie: any, width: number) => {
    const poster = typeof movie?.cover === 'string' && movie.cover
        ? movie.cover
        : typeof movie?.thumbnail === 'string' && movie.thumbnail
            ? movie.thumbnail
            : typeof movie?.posterUrl === 'string' && movie.posterUrl
                ? movie.posterUrl
                : '';
    return getOptimizedImageUrl(poster, width) || WATCH_PARTY_FALLBACK;
};

const WATCH_PARTY_CATEGORIES = [
    { id: 'trending', label: 'Trending' },
    { id: 'movies', label: 'Movies' },
    { id: 'anime', label: 'Anime' },
    { id: 'nollywood', label: 'Nollywood' },
    { id: 'k_drama', label: 'K-Drama' },
    { id: 'c_drama', label: 'C-Drama' },
];

const getSocketInstance = () => {
    try {
        return socketIoClient();
    } catch (e) {
        return null;
    }
};

interface WatchRoom {
    roomId: string;
    roomName: string;
    creator: string;
    movie: any;
    currentSeason?: number;
    currentEpisode?: number;
    users: { id: string; name: string; isCreator: boolean; buffering?: boolean }[];
    currentTime: number;
    paused: boolean;
    entryMode: RoomEntryMode;
    /** Optional fields keep the UI compatible with older watch-party servers. */
    isPublic?: boolean;
    public?: boolean;
    visibility?: 'public' | 'private';
    hostToken?: string;
    waitExpiresAt?: number | null;
    messages?: { id?: string; username: string; message: string; timestamp: number }[];
    kickedUsers?: string[];
    pendingRequests?: { requestId: string; username: string; requestedAt: number }[];
    guessPosterGame?: GuessPosterGame | null;
    triviaGame?: MovieTriviaGame | null;
    partyGame?: PartyGame | null;
}

interface GuessPosterGame {
    status: 'active' | 'reveal' | 'finished';
    round: number;
    maxRounds: number;
    startedAt: number;
    endsAt: number;
    posterUrl: string;
    scores: Record<string, number>;
    revealed: boolean;
    answerTitle?: string;
    label?: string;
    category?: string;
    mediaType?: string;
    contentType?: string;
    posterUrls?: string[];
}

interface MovieTriviaGame {
    status: 'active' | 'reveal' | 'finished';
    round: number;
    maxRounds: number;
    startedAt: number;
    endsAt: number;
    prompt: string;
    choices: string[];
    scores: Record<string, number>;
    revealed?: boolean;
    answerIndex?: number;
    correctChoice?: string;
    category?: string;
}

type PartyGameType = 'emoji' | 'quote' | 'character' | 'scramble' | 'mixed';
type PartyGameStatus = 'active' | 'reveal' | 'finished';

interface PartyGame {
    status: PartyGameStatus;
    gameType: PartyGameType;
    round: number;
    maxRounds: number;
    startedAt: number;
    endsAt: number;
    prompt?: string;
    clue?: string;
    imageUrl?: string;
    category?: string;
    contentType?: string;
    roundType?: Exclude<PartyGameType, 'mixed'>;
    scores: Record<string, number>;
    revealed: boolean;
    answer?: string;
}

const PARTY_GAME_OPTIONS: { value: PartyGameType; label: string; description: string; icon: string }[] = [
    { value: 'emoji', label: 'Emoji Movie Titles', description: 'Decode a title from a trail of symbols.', icon: 'fa-face-grin-wink' },
    { value: 'quote', label: 'Who Said It', description: 'Name the movie behind the quote.', icon: 'fa-quote-left' },
    { value: 'character', label: 'Guess the Character', description: 'Identify the movie from its character.', icon: 'fa-masks-theater' },
    { value: 'scramble', label: 'Title Scramble', description: 'Put the title back in the right order.', icon: 'fa-shuffle' },
    { value: 'mixed', label: 'Mixed Party Mode', description: 'Rotate through every game type.', icon: 'fa-wand-magic-sparkles' },
];

export const WatchPartyView: React.FC<{
    onBack: () => void;
    onSelectMovieToWatch?: (movie: MovieResult) => void;
}> = ({ onBack }) => {
    const [socket, setSocket] = useState<any>(null);
    useNetworkQuality(socket || undefined);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [activeRooms, setActiveRooms] = useState<WatchRoom[]>([]);
    const [currentRoom, setCurrentRoom] = useState<WatchRoom | null>(null);
    const [targetRoomId, setTargetRoomId] = useState<string | null>(() => {
        try {
            const roomId = normalizeRoomId(new URLSearchParams(window.location.search).get('room'));
            return roomId || null;
        } catch {
            return null;
        }
    });
    const [joinCodeInput, setJoinCodeInput] = useState(() => targetRoomId || '');
    const [entryTab, setEntryTab] = useState<'create' | 'discover' | 'join'>(() => targetRoomId ? 'join' : 'discover');
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);
    const [joinRequestRoomId, setJoinRequestRoomId] = useState<string | null>(null);
    const [username, setUsername] = useState<string>(() => localStorage.getItem('slflix_username') || `Viewer_${Math.floor(Math.random() * 10000)}`);
    const [roomNameInput, setRoomNameInput] = useState('');
    const [createEntryMode, setCreateEntryMode] = useState<RoomEntryMode>('manual');
    const [createVisibility, setCreateVisibility] = useState<'public' | 'private'>('public');
    const [chatMessages, setChatMessages] = useState<{ id?: string; username: string; message: string; timestamp: number }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants'>('chat');
    const [roomView, setRoomView] = useState<'watch' | 'games'>('watch');
    const [inStreamLatestChat, setInStreamLatestChat] = useState<{ username: string; message: string } | null>(null);
    const [pauseNotice, setPauseNotice] = useState<string | null>(null);
    const [inviteCopied, setInviteCopied] = useState(false);
    const [waitExpiresAt, setWaitExpiresAt] = useState<number | null>(null);
    const [waitNow, setWaitNow] = useState(() => Date.now());
    useEffect(() => {
        if (!waitExpiresAt) return;
        const timer = window.setInterval(() => setWaitNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [waitExpiresAt]);
    const waitRemainingMs = waitExpiresAt ? Math.max(0, waitExpiresAt - waitNow) : 0;
    const [joinRequestState, setJoinRequestState] = useState<'idle' | 'submitting' | 'pending' | 'denied'>('idle');
    const [joinRequests, setJoinRequests] = useState<{ requestId: string; username: string; requestedAt: number }[]>([]);
    const [roomSyncTimestamp, setRoomSyncTimestamp] = useState<number>(Date.now());
    const chatBottomRef = useRef<HTMLDivElement>(null);
    
    // Stable refs to prevent stale closure in socket listeners
    const currentRoomRef = useRef<WatchRoom | null>(null);
    const usernameRef = useRef<string>(username);
    const createRequestIdRef = useRef<string | null>(null);
    const createInFlightRef = useRef(false);

    useEffect(() => {
        currentRoomRef.current = currentRoom;
    }, [currentRoom]);

    useEffect(() => {
        usernameRef.current = username;
    }, [username]);

    // Main Search Engine Integration for Room Creation / Movie Switch
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<MovieResult[]>([]);
    const [posterCandidatePool, setPosterCandidatePool] = useState<MovieResult[]>([]);
    const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [isLoadingCategory, setIsLoadingCategory] = useState(false);
    
    // TV Series & Episode Management
    const [movieDetails, setMovieDetails] = useState<any | null>(null);
    const [selectedSeason, setSelectedSeason] = useState<number>(1);
    const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
    const [autoPlayNext, setAutoPlayNext] = useState<boolean>(true);
    const [showEpisodeSelector, setShowEpisodeSelector] = useState<boolean>(false);
    
    // Timer Features
    const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
    const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number | null>(null);
    const [showTimerMenu, setShowTimerMenu] = useState<boolean>(false);

    // Stream & Video Player State
    const [sources, setSources] = useState<VideoSource[]>([]);
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [loadingStream, setLoadingStream] = useState<boolean>(false);
    const [streamError, setStreamError] = useState<string | null>(null);
    const [guessPosterGame, setGuessPosterGame] = useState<GuessPosterGame | null>(null);
    const [guessPosterHistory, setGuessPosterHistory] = useState<GuessPosterGame[]>([]);
    const [guessInput, setGuessInput] = useState('');
    const [gameNow, setGameNow] = useState(() => Date.now());
    const [gameNotice, setGameNotice] = useState<string | null>(null);
    const [triviaGame, setTriviaGame] = useState<MovieTriviaGame | null>(null);
    const [triviaChoice, setTriviaChoice] = useState<number | null>(null);
    const [triviaNotice, setTriviaNotice] = useState<string | null>(null);
    const [triviaError, setTriviaError] = useState<string | null>(null);
    const [isStartingTrivia, setIsStartingTrivia] = useState(false);
    const triviaStartingRef = useRef(false);
    const [partyGame, setPartyGame] = useState<PartyGame | null>(null);
    const [partyGameType, setPartyGameType] = useState<PartyGameType>('mixed');
    const [partyRounds, setPartyRounds] = useState<'5' | '10' | 'custom'>('5');
    const [partyCustomRounds, setPartyCustomRounds] = useState('8');
    const [partyRoundMs, setPartyRoundMs] = useState(20000);
    const [partyGuessInput, setPartyGuessInput] = useState('');
    const [partyGameSubmitted, setPartyGameSubmitted] = useState(false);
    const [partyGameNotice, setPartyGameNotice] = useState<string | null>(null);
    const [partyGameError, setPartyGameError] = useState<string | null>(null);
    const [isStartingPartyGame, setIsStartingPartyGame] = useState(false);
    const partyGameStartingRef = useRef(false);
    const offlineChatQueueRef = useRef<{ message: string; queuedAt: number }[]>([]);
    useEffect(() => {
        const posterActive = guessPosterGame?.status === 'active';
        const triviaActive = triviaGame?.status === 'active';
        const partyActive = partyGame?.status === 'active';
        if (!posterActive && !triviaActive && !partyActive) return;
        const timer = window.setInterval(() => setGameNow(Date.now()), 250);
        return () => window.clearInterval(timer);
    }, [guessPosterGame?.status, guessPosterGame?.endsAt, triviaGame?.status, triviaGame?.endsAt, partyGame?.status, partyGame?.endsAt]);

    // Initialize Socket
    useEffect(() => {
        const s = getSocketInstance();
        if (!s) return;
        setSocket(s);

        // Reconnect handler: immediately re-join room if connection drops and recovers
        s.on('connect', () => {
            setIsReconnecting(false);
            const activeRoom = currentRoomRef.current;
            if (activeRoom) {
                s.emit('join_room', {
                    roomId: activeRoom.roomId,
                    username: usernameRef.current,
                    reconnect: true,
                    hostToken: activeRoom.hostToken || localStorage.getItem(`slflix_host_token_${activeRoom.roomId}`) || undefined
                });
            } else {
                s.emit('get_active_rooms');
            }
        });

        s.emit('get_active_rooms');

        s.on('active_rooms_list', (rooms: WatchRoom[]) => {
            setActiveRooms(rooms);
        });

         s.on('room_state', (room: WatchRoom) => {
             setIsCreatingRoom(false);
             createInFlightRef.current = false;
             setJoinRequestRoomId(null);
             setWaitExpiresAt(room.waitExpiresAt ?? null);
             setCurrentRoom(room);
             setGuessPosterGame(room.guessPosterGame || null);
             setGuessPosterHistory(room.guessPosterGame ? [room.guessPosterGame] : []);
             setTriviaGame(room.triviaGame || null);
             setPartyGame(room.partyGame || null);
             setPartyGameSubmitted(false);
             setIsStartingPartyGame(false);
             partyGameStartingRef.current = false;
             setPartyGameError(null);
            if (room.hostToken) {
                try {
                    localStorage.setItem(`slflix_host_token_${room.roomId}`, room.hostToken);
                } catch (e) {}
            }
            setJoinRequestState('idle');
            if (room.pendingRequests) setJoinRequests(room.pendingRequests);
            setRoomSyncTimestamp(Date.now());
            
            // Restore persistent messages merged with server state
            const storageKey = `slflix_chat_${room.roomId}`;
            let cachedMsgs: any[] = [];
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored) cachedMsgs = JSON.parse(stored);
            } catch (e) {}

            const serverMsgs = Array.isArray(room.messages) ? room.messages : [];
            const mergedMap = new Map<string, any>();
            
            [...cachedMsgs, ...serverMsgs].forEach(m => {
                const key = m.id || `${m.timestamp}_${m.username}_${m.message}`;
                mergedMap.set(key, m);
            });

            const mergedList = Array.from(mergedMap.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            setChatMessages(mergedList);

            try {
                localStorage.setItem(storageKey, JSON.stringify(mergedList.slice(-200)));
            } catch (e) {}

            if (room.movie) {
                setSelectedMovie(room.movie);
                if (room.currentSeason) setSelectedSeason(room.currentSeason);
                if (room.currentEpisode) setSelectedEpisode(room.currentEpisode);
            }
            const queued = offlineChatQueueRef.current.splice(0, 20);
            queued.forEach(item => s.emit('room_chat', { roomId: room.roomId, username: usernameRef.current, message: item.message }));
        });

        s.on('disconnect', () => {
            setIsReconnecting(true);
            setPauseNotice('Reconnecting...');
            setCurrentRoom(prev => prev ? { ...prev, paused: true } : null);
        });
        s.on('connect_error', () => setIsReconnecting(true));

         s.on('room_request_pending', (data: { roomId?: string; requestId?: string; username?: string; requestedAt?: number; status?: string; existing?: boolean; message?: string }) => {
             const roomId = normalizeRoomId(data?.roomId) || targetRoomId;
             if (roomId) {
                 setTargetRoomId(roomId);
                 setJoinCodeInput(roomId);
                 setJoinRequestRoomId(roomId);
             }
             if (data?.status === 'full') {
                 setJoinRequestState('denied');
                 setPauseNotice(data.message || 'This room cannot accept more pending requests right now.');
                 return;
             }
             setJoinRequestState('pending');
         });
         s.on('room_request_denied', (data: { roomId?: string; message?: string }) => {
             setJoinRequestState('denied');
             setJoinRequestRoomId(normalizeRoomId(data?.roomId) || targetRoomId);
             setPauseNotice(data.message || 'The host did not approve your request.');
        });
        s.on('room_join_request', (request: { requestId: string; username: string; requestedAt: number }) => {
            setJoinRequests(prev => prev.some(item => item.requestId === request.requestId) ? prev : [...prev, request]);
            setPauseNotice(`${request.username} wants to join your room`);
        });
        s.on('room_entry_mode_changed', (data: { entryMode: RoomEntryMode; users?: WatchRoom['users'] }) => {
            setCurrentRoom(prev => prev ? {
                ...prev,
                entryMode: data.entryMode,
                users: data.users || prev.users
            } : null);
            if (data.entryMode === 'auto') setJoinRequests([]);
            setPauseNotice(`Entry mode: ${getEntryModeLabel(data.entryMode)}`);
            setTimeout(() => setPauseNotice(null), 2500);
        });

        s.on('room_user_joined', (data: { username: string; usersCount: number; users?: any[] }) => {
            if (data.usersCount > 1) setWaitExpiresAt(null);
            if (data.users) {
                setCurrentRoom(prev => prev ? { ...prev, users: data.users || prev.users } : null);
            }
            setPauseNotice(`${data.username} joined the room`);
            setTimeout(() => setPauseNotice(null), 3000);
        });

        s.on('room_user_left', (data: { username: string; usersCount: number; users?: any[] }) => {
            if (data.users) {
                setCurrentRoom(prev => prev ? { ...prev, users: data.users || prev.users } : null);
            }
        });

        s.on('room_buffering_status', (data: { username: string; buffering: boolean; users?: WatchRoom['users'] }) => {
            if (data.users) {
                setCurrentRoom(prev => prev ? { ...prev, users: data.users || prev.users } : null);
            } else {
                setCurrentRoom(prev => prev ? {
                    ...prev,
                    users: prev.users.map(user => user.name.toLowerCase() === data.username.toLowerCase()
                        ? { ...user, buffering: data.buffering }
                        : user)
                } : null);
            }
        });

        // User kicked from room by creator
        s.on('room_kicked', (data: { roomId: string; message: string }) => {
             alert(data.message || 'You were removed from this Watch Party session and cannot rejoin.');
             setCurrentRoom(null);
             setRoomView('watch');
             setSelectedMovie(null);
            setSources([]);
            setSubtitles([]);
            setChatMessages([]);
            setPauseNotice(data.message || 'Removed from party');
            window.history.pushState({}, '', '/watch-party');
            s.emit('get_active_rooms');
        });

        // Participant was kicked notification
        s.on('room_user_kicked', (data: { username: string; usersCount: number; users?: any[]; kickedUsers?: string[] }) => {
            if (data.users) {
                setCurrentRoom(prev => prev ? { 
                    ...prev, 
                    users: data.users || prev.users,
                    kickedUsers: data.kickedUsers || prev.kickedUsers
                } : null);
            }
            setPauseNotice(`${data.username} was removed by host`);
            setTimeout(() => setPauseNotice(null), 3500);
        });

        s.on('room_wait_updated', (data: { roomId: string; waitExpiresAt: number }) => {

            setWaitExpiresAt(data.waitExpiresAt);

        });

        s.on('room_ended', (data: { roomId: string; message: string; endedBy: string }) => {
            setPauseNotice(data.message || 'This watch party has been ended by the host.');
            setTimeout(() => {
                     setCurrentRoom(null);
                     setRoomView('watch');
                     setSelectedMovie(null);
                setSources([]);
                 setSubtitles([]);
                 setChatMessages([]);
                 setGuessPosterGame(null);
                  setGuessPosterHistory([]);
                  setTriviaGame(null);
                  setTriviaNotice(null);
                  setPartyGame(null);
                  setPartyGameSubmitted(false);
                  setPartyGameNotice(null);
                  setPartyGameError(null);
                  setPauseNotice(null);
                window.history.pushState({}, '', '/watch-party');
                s.emit('get_active_rooms');
            }, 1200);
        });

         s.on('error_message', (data: { message: string }) => {
             setIsCreatingRoom(false);
             createInFlightRef.current = false;
                 setJoinRequestRoomId(null);
                 setJoinRequestState(prev => prev === 'submitting' ? 'idle' : prev);
              if (triviaStartingRef.current) {
                  setTriviaError(data.message || 'Movie Trivia could not start. Try again.');
                  setIsStartingTrivia(false);
                  triviaStartingRef.current = false;
              }
              if (partyGameStartingRef.current) {
                  setPartyGameError(data.message || 'Party game could not start. Try again.');
                  setIsStartingPartyGame(false);
                  partyGameStartingRef.current = false;
              }
              setPauseNotice(data.message || 'Error occurred');
            setTimeout(() => setPauseNotice(null), 3500);
        });

        s.on('room_sync', (data: { action: string; currentTime: number; paused: boolean; movie: any; season?: number; episode?: number; username: string; users?: WatchRoom['users'] }) => {
            setCurrentRoom(prev => prev ? {
                ...prev,
                currentTime: data.currentTime !== undefined ? data.currentTime : prev.currentTime,
                paused: data.paused !== undefined ? data.paused : prev.paused,
                movie: data.movie || prev.movie,
                currentSeason: data.season || prev.currentSeason,
                currentEpisode: data.episode || prev.currentEpisode,
                users: data.users || prev.users
            } : null);
            setRoomSyncTimestamp(Date.now());

            if (data.movie) {
                setSelectedMovie(prev => {
                    if (!prev || (data.movie.subjectId && prev.subjectId !== data.movie.subjectId) || (!data.movie.subjectId && prev.title !== data.movie.title)) {
                        return data.movie;
                    }
                    return prev;
                });
            }
            if (data.season !== undefined) setSelectedSeason(data.season);
            if (data.episode !== undefined) setSelectedEpisode(data.episode);

            if (data.action === 'pause' && data.username) {
                setPauseNotice(`Paused by ${data.username}`);
                setTimeout(() => setPauseNotice(null), 3500);
            } else if (data.action === 'play' && data.username) {
                setPauseNotice(`Resumed by ${data.username}`);
                setTimeout(() => setPauseNotice(null), 2500);
            }
        });

         s.on('guess_poster_started', (data: { game: GuessPosterGame }) => {
             setGuessPosterGame(data.game);
             setGuessPosterHistory(prev => [...prev.filter(item => item.round !== data.game.round), data.game].slice(-6));
             setGuessInput('');
             setGameNotice(null);
        });
        s.on('guess_poster_correct', (data: { username: string; points: number; scores: Record<string, number> }) => {
            setGuessPosterGame(prev => prev ? { ...prev, scores: data.scores } : prev);
            setGameNotice(`${data.username} scored ${data.points} point${data.points === 1 ? '' : 's'}`);
            window.setTimeout(() => setGameNotice(null), 2500);
        });
         s.on('guess_poster_round_revealed', (data: { game: GuessPosterGame }) => {
             setGuessPosterGame(data.game);
             setGuessPosterHistory(prev => [...prev.filter(item => item.round !== data.game.round), data.game].slice(-6));
             setGameNotice(`Answer: ${data.game.answerTitle || 'revealed'}`);
        });
         s.on('guess_poster_finished', (data: { game: GuessPosterGame }) => {
             setGuessPosterGame(data.game);
             setGuessPosterHistory(prev => [...prev.filter(item => item.round !== data.game.round), data.game].slice(-6));
             setGameNotice('Game complete — final leaderboard');
        });
         s.on('guess_poster_ended', () => {
             setGuessPosterGame(null);
             setGuessPosterHistory([]);
             setGameNotice(null);
         });

         // Movie Trivia is intentionally event-compatible with both the descriptive
         // movie_trivia_* names and the shorter trivia_* names used by older servers.
         const applyTriviaGame = (game: MovieTriviaGame | undefined, notice?: string) => {
             if (!game) return;
             setTriviaGame(game);
             setTriviaChoice(null);
             setIsStartingTrivia(false);
             triviaStartingRef.current = false;
             setTriviaError(null);
             if (notice) {
                 setTriviaNotice(notice);
                 window.setTimeout(() => setTriviaNotice(null), 2500);
             }
         };
         const triviaStarted = (data: { game?: MovieTriviaGame }) => applyTriviaGame(data?.game);
         const triviaReveal = (data: { game?: MovieTriviaGame }) => applyTriviaGame(data?.game, 'Round revealed — check the scoreboard.');
         const triviaFinished = (data: { game?: MovieTriviaGame }) => applyTriviaGame(data?.game, 'Trivia complete — final leaderboard.');
         s.on('movie_trivia_started', triviaStarted);
         s.on('trivia_started', triviaStarted);
         s.on('movie_trivia_round_started', triviaStarted);
         s.on('movie_trivia_round_revealed', triviaReveal);
         s.on('trivia_round_revealed', triviaReveal);
         s.on('movie_trivia_finished', triviaFinished);
         s.on('trivia_finished', triviaFinished);
         const triviaAnswered = (data: { username?: string; points?: number; scores?: Record<string, number> }) => {
             if (data?.scores) setTriviaGame(prev => prev ? { ...prev, scores: data.scores! } : prev);
             if (data?.username) {
                 setTriviaNotice(`${data.username} answered${typeof data.points === 'number' ? ` for ${data.points} point${data.points === 1 ? '' : 's'}` : ''}.`);
                 window.setTimeout(() => setTriviaNotice(null), 2200);
             }
         };
         s.on('movie_trivia_answered', triviaAnswered);
         s.on('trivia_answered', triviaAnswered);
         const triviaEnded = () => { setTriviaGame(null); setTriviaNotice(null); };
         s.on('movie_trivia_ended', triviaEnded);
         s.on('trivia_ended', triviaEnded);

         // Generic party games share one public payload for every round. The
         // server deliberately omits `answer` until a reveal event arrives.
         const applyPartyGame = (game: PartyGame | undefined, notice?: string) => {
             if (!game) return;
             setPartyGame(game);
             setPartyGameSubmitted(false);
             setIsStartingPartyGame(false);
             partyGameStartingRef.current = false;
             setPartyGameError(null);
             if (notice) {
                 setPartyGameNotice(notice);
                 window.setTimeout(() => setPartyGameNotice(null), 2800);
             }
         };
         const partyStarted = (data: { game?: PartyGame }) => applyPartyGame(data?.game);
         const partyReveal = (data: { game?: PartyGame }) => applyPartyGame(data?.game, 'Round revealed — next clue is loading.');
         const partyFinished = (data: { game?: PartyGame }) => applyPartyGame(data?.game, 'Party complete — final leaderboard.');
         s.on('party_game_started', partyStarted);
         s.on('party_game_round_started', partyStarted);
         s.on('party_game_round_revealed', partyReveal);
         s.on('party_game_finished', partyFinished);
         s.on('party_game_score', (data: { username?: string; points?: number; tier?: string; scores?: Record<string, number> }) => {
             if (data?.scores) setPartyGame(prev => prev ? { ...prev, scores: data.scores! } : prev);
             if (data?.username) {
                 if (data.username.toLowerCase() === usernameRef.current.toLowerCase()) setPartyGameSubmitted(true);
                 const points = typeof data.points === 'number' ? data.points : 0;
                 const tierLabel = data.tier === 'exact' ? 'Exact title' : data.tier === 'close' ? 'Close match' : data.tier === 'initial' ? 'Initials' : 'Wrong answer';
                 setPartyGameNotice(`${data.username} · ${tierLabel} · +${points}`);
                 window.setTimeout(() => setPartyGameNotice(null), 2400);
             }
         });
         s.on('party_game_ended', () => {
             setPartyGame(null);
             setPartyGameSubmitted(false);
             setPartyGameNotice(null);
             setPartyGameError(null);
         });

         s.on('room_chat_message', (msg: { id?: string; username: string; message: string; timestamp: number }) => {
            setChatMessages(prev => {
                // Deduplicate message
                const exists = prev.some(m => (m.id && msg.id && m.id === msg.id) || (m.timestamp === msg.timestamp && m.username === msg.username && m.message === msg.message));
                if (exists) return prev;
                const updated = [...prev, msg];
                if (currentRoomRef.current) {
                    try {
                        localStorage.setItem(`slflix_chat_${currentRoomRef.current.roomId}`, JSON.stringify(updated.slice(-200)));
                    } catch (e) {}
                }
                return updated;
            });
            setInStreamLatestChat({ username: msg.username, message: msg.message });
            setTimeout(() => setInStreamLatestChat(null), 5000);
        });

        const params = new URLSearchParams(window.location.search);
         const roomParam = params.get('room');
         const requestParam = params.get('request') === '1';
         if (roomParam) {
             setTimeout(() => {
                 const storedName = localStorage.getItem('slflix_username') || username;
                 const cleanParam = normalizeRoomId(roomParam);
                 if (!cleanParam) return;
                 setTargetRoomId(cleanParam);
                 setJoinCodeInput(cleanParam);
                 setEntryTab('join');
                 setJoinRequestRoomId(cleanParam);
                 setJoinRequestState('submitting');
                 s.emit('join_room', {
                    roomId: cleanParam,
                    username: storedName,
                    reconnect: true,
                    request: requestParam,
                    hostToken: localStorage.getItem(`slflix_host_token_${cleanParam}`) || undefined
                });
            }, 600);
        }

        return () => {
            s.disconnect();
        };
    }, []);

    // Auto-scroll chat to latest message
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const isCreator = Boolean(currentRoom && socket?.id && currentRoom.users.find(u => u.id === socket.id)?.isCreator);
    const isRoomPublic = (room: WatchRoom) => room.isPublic ?? room.public ?? room.visibility !== 'private';

    // Load sources when selected movie / episode changes
    useEffect(() => {
        if (!selectedMovie) return;
        let isMounted = true;
        const loadMovieStreams = async () => {
            setLoadingStream(true);
            setStreamError(null);
            setSources([]);
            setSubtitles([]);
            try {
                // Fetch full details if series
                const details = await ApiService.getDetails(selectedMovie);
                if (isMounted) setMovieDetails(details);

                const sourceRes = await ApiService.getSources(
                    selectedMovie.subjectId || (selectedMovie as any).id || 'search',
                    selectedMovie.type || 'Movie',
                    selectedSeason,
                    selectedEpisode,
                    selectedMovie.detailPath,
                    selectedMovie.title
                );
                if (isMounted && sourceRes && sourceRes.videos && sourceRes.videos.length > 0) {
                    setSources(sourceRes.videos);
                    setSubtitles(sourceRes.subs || []);
                }
            } catch (err) {
                console.error('Failed to fetch room video sources:', err);
                if (isMounted) setStreamError('Unable to load the stream right now. Check your connection and try again.');
            } finally {
                if (isMounted) setLoadingStream(false);
            }
        };
        loadMovieStreams();
        return () => { isMounted = false; };
    }, [selectedMovie, selectedSeason, selectedEpisode]);

    // Timer Countdown logic
    useEffect(() => {
        if (!timerRemainingSeconds) return;
        const interval = setInterval(() => {
            setTimerRemainingSeconds(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(interval);
                    if (socket && currentRoom) {
                        socket.emit('room_action', { 
                            roomId: currentRoom.roomId, 
                            action: 'pause', 
                            currentTime: currentRoom.currentTime || 0, 
                            paused: true,
                            username 
                        });
                    }
                    setPauseNotice('Playback stopped by Sleep Timer');
                    setTimeout(() => setPauseNotice(null), 4000);
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [timerRemainingSeconds, currentRoom, socket, username]);

    // Search Engine Execution
    const executeSearch = async (q: string) => {
        setSearchQuery(q);
        setSelectedCategory('');
        if (q.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await ApiService.search(q.trim(), 1);
            const results = res.results || [];
            setSearchResults(results);
            setPosterCandidatePool(prev => {
                const byId = new Map(prev.map((movie: MovieResult) => [movie.subjectId || movie.detailPath || movie.title, movie]));
                results.forEach((movie: MovieResult) => byId.set(movie.subjectId || movie.detailPath || movie.title, movie));
                return Array.from(byId.values()).slice(-30);
            });
        } catch (e) {
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Master Host / Viewer Action Handler
    const handleHostAction = useCallback((action: 'play' | 'pause' | 'seek', time: number) => {
        if (!socket || !currentRoom) return;
        const isPaused = action === 'pause';
        socket.emit('room_action', {
            roomId: currentRoom.roomId,
            action: action,
            currentTime: time,
            paused: isPaused,
            username
        });
    }, [socket, currentRoom, username]);

    const handleBufferingChange = useCallback((buffering: boolean) => {
        if (!socket || !currentRoom) return;
        socket.emit('room_buffering_status', { roomId: currentRoom.roomId, buffering });
    }, [socket, currentRoom]);

    const handlePlayNextEpisode = useCallback(() => {
        if (!autoPlayNext) return;
        const currentSeasonData = movieDetails?.seasons?.find((s: any) => (s.seasonNumber || s.season) === selectedSeason);
        const epCount = currentSeasonData?.episodes?.length || currentSeasonData?.episodeCount || 12;
        
        if (selectedEpisode < epCount) {
            const nextEp = selectedEpisode + 1;
            setSelectedEpisode(nextEp);
            if (socket && currentRoom) {
                socket.emit('room_action', {
                    roomId: currentRoom.roomId,
                    action: 'change_episode',
                    season: selectedSeason,
                    episode: nextEp,
                    currentTime: 0,
                    username
                });
            }
        }
    }, [autoPlayNext, movieDetails, selectedSeason, selectedEpisode, socket, currentRoom, username]);

    const handleSelectEpisode = useCallback((seasonNum: number, epNum: number) => {
        setSelectedSeason(seasonNum);
        setSelectedEpisode(epNum);
        setShowEpisodeSelector(false);
        if (socket && currentRoom) {
            socket.emit('room_action', {
                roomId: currentRoom.roomId,
                action: 'change_episode',
                season: seasonNum,
                episode: epNum,
                currentTime: 0,
                username
            });
        }
    }, [socket, currentRoom, username]);

    const handleCreateRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomNameInput.trim() || !socket || isCreatingRoom || createInFlightRef.current) return;
        createInFlightRef.current = true;
        setIsCreatingRoom(true);
        localStorage.setItem('slflix_username', username);
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const requestId = createRequestIdRef.current || (typeof globalThis.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        createRequestIdRef.current = requestId;
        socket.emit('create_room', {
            roomId,
            clientRequestId: requestId,
            roomName: roomNameInput.trim(),
            username,
            entryMode: createEntryMode,
            isPublic: createVisibility === 'public',
            public: createVisibility === 'public',
            visibility: createVisibility,
            movie: selectedMovie || { title: 'Choose a title to begin', cover: WATCH_PARTY_FALLBACK, thumbnail: WATCH_PARTY_FALLBACK, subjectId: 'demo' },
            season: selectedSeason,
            episode: selectedEpisode
        });
        window.history.pushState({}, '', `/watch-party?room=${roomId}`);
    };

    const handleJoinRequestDecision = (requestId: string, decision: 'approve' | 'deny') => {
        if (!socket || !currentRoom) return;
        socket.emit('room_join_request_decision', { roomId: currentRoom.roomId, requestId, decision });
        setJoinRequests(prev => prev.filter(request => request.requestId !== requestId));
    };

    const handleShareInvite = async () => {
        if (!currentRoom) return;
        const isAutoEntry = (currentRoom.entryMode || 'manual') === 'auto';
        const inviteUrl = `${window.location.origin}/watch-party?room=${currentRoom.roomId}${isAutoEntry ? '' : '&request=1'}`;
        const shareData = {
            title: `Join ${currentRoom.roomName} on SLFLIX`,
            text: `${isAutoEntry ? 'Join' : 'Request to join'} my watch room with code ${currentRoom.roomId}.`,
            url: inviteUrl
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(`${shareData.text}\n${inviteUrl}`);
            }
            setInviteCopied(true);
            window.setTimeout(() => setInviteCopied(false), 2000);
        } catch {
            // Sharing can be cancelled by the user; do not show an error for that.
        }
    };

    const handleCopyInviteLink = async () => {
        if (!currentRoom) return;
        const requestSuffix = (currentRoom.entryMode || 'manual') === 'auto' ? '' : '&request=1';
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/watch-party?room=${currentRoom.roomId}${requestSuffix}`);
            setInviteCopied(true);
            window.setTimeout(() => setInviteCopied(false), 2000);
        } catch {
            setPauseNotice('Could not copy the invite link.');
            window.setTimeout(() => setPauseNotice(null), 2500);
        }
    };

    const handleCopyRoomCode = async () => {
        if (!currentRoom) return;
        try {
            await navigator.clipboard.writeText(currentRoom.roomId);
            setInviteCopied(true);
            window.setTimeout(() => setInviteCopied(false), 2000);
        } catch {
            setPauseNotice('Could not copy the room code.');
            window.setTimeout(() => setPauseNotice(null), 2500);
        }
    };

    const loadCategory = async (category: string) => {
        setSelectedCategory(category);
        setSearchQuery('');
        setSearchResults([]);
        if (!category) return;
        setIsLoadingCategory(true);
        try {
            const result = await ApiService.getRankingList(category, 1, 12);
            const results = result.results || [];
            setSearchResults(results);
            setPosterCandidatePool(prev => {
                const byId = new Map(prev.map((movie: MovieResult) => [movie.subjectId || movie.detailPath || movie.title, movie]));
                results.forEach((movie: MovieResult) => byId.set(movie.subjectId || movie.detailPath || movie.title, movie));
                return Array.from(byId.values()).slice(-30);
            });
        } catch (e) {
            setSearchResults([]);
        } finally {
            setIsLoadingCategory(false);
        }
    };

    const handleJoinRoom = (roomId: string) => {
        if (!socket) return;
        if (!socket.connected) {
            socket.connect();
        }
        const cleanId = normalizeRoomId(roomId);
        if (!cleanId) return;
        localStorage.setItem('slflix_username', username);
        setTargetRoomId(cleanId);
        setJoinCodeInput(cleanId);
        setEntryTab('join');
        setJoinRequestRoomId(cleanId);
        setJoinRequestState('submitting');
        socket.emit('join_room', { roomId: cleanId, username });
        window.history.pushState({}, '', `/watch-party?room=${cleanId}`);
    };

    const handleRequestRoom = (roomId: string) => {
        if (!socket) return;
        const cleanId = normalizeRoomId(roomId);
        if (!cleanId || (joinRequestRoomId === cleanId && (joinRequestState === 'pending' || joinRequestState === 'submitting'))) return;
        localStorage.setItem('slflix_username', username);
        setTargetRoomId(cleanId);
        setJoinCodeInput(cleanId);
        setEntryTab('join');
        setJoinRequestRoomId(cleanId);
        setJoinRequestState('pending');
        socket.emit('join_room', { roomId: cleanId, username, request: true });
        window.history.pushState({}, '', `/watch-party?room=${cleanId}&request=1`);
    };

    const handleJoinByCode = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanId = normalizeRoomId(joinCodeInput);
        if (!cleanId) {
            setPauseNotice('Enter a valid watch-party code.');
            return;
        }
        handleJoinRoom(cleanId);
    };

    const handleEntryModeChange = (entryMode: RoomEntryMode) => {
        if (!socket || !currentRoom || !isCreator) return;
        socket.emit('set_room_entry_mode', { roomId: currentRoom.roomId, entryMode });
    };

    const handleKickUser = (targetUsername: string) => {
        if (!socket || !currentRoom) return;
        const normTarget = String(targetUsername || '').trim();
        if (!normTarget) return;
        if (normTarget.toLowerCase() === currentRoom.creator.toLowerCase()) {
            alert("The party host cannot be removed.");
            return;
        }
        const confirmed = window.confirm(
            `Remove "${normTarget}" from this Watch Party?\n\nOnce removed, they will be disconnected immediately and blocked from rejoining this room session.`
        );
        if (!confirmed) return;

        socket.emit('kick_user', {
            roomId: currentRoom.roomId,
            targetUsername: normTarget,
            creatorUsername: username
        });
    };

    const handleLeaveRoom = () => {
        if (socket && currentRoom) {
            socket.emit('leave_room', { roomId: currentRoom.roomId, username });
            // keep the host token on Leave so the host can reclaim the room (End Party still clears it)
        }
        setCurrentRoom(null);
        setRoomView('watch');
        setSelectedMovie(null);
        setSources([]);
        setSubtitles([]);
        createRequestIdRef.current = null;
        window.history.pushState({}, '', '/watch-party');
        if (socket) {
            socket.emit('get_active_rooms');
        }
    };

    const handleKillRoom = (targetRoomId?: string) => {
        const rId = targetRoomId || currentRoom?.roomId;
        if (!rId || !socket) return;
        const confirmDelete = window.confirm("Are you sure you want to end this Watch Party? The room will be permanently closed and removed for all viewers.");
        if (!confirmDelete) return;

        socket.emit('kill_room', { roomId: rId, username });
        if (currentRoom && currentRoom.roomId === rId) {
            setCurrentRoom(null);
            setRoomView('watch');
            setSelectedMovie(null);
            setSources([]);
            setSubtitles([]);
            createRequestIdRef.current = null;
            setChatMessages([]);
            window.history.pushState({}, '', '/watch-party');
            localStorage.removeItem(`slflix_host_token_${rId}`);
        }
        socket.emit('get_active_rooms');
    };

    const handleSendChat = (e: React.FormEvent) => {
        e.preventDefault();
        const text = chatInput.trim();
        if (!text || !currentRoom) return;

        const optimisticMsg = {
            id: 'msg_local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            username,
            message: text,
            timestamp: Date.now()
        };

        setChatMessages(prev => {
            const updated = [...prev, optimisticMsg];
            try {
                localStorage.setItem(`slflix_chat_${currentRoom.roomId}`, JSON.stringify(updated.slice(-200)));
            } catch (err) {}
            return updated;
        });

        if (socket?.connected) {
            socket.emit('room_chat', { roomId: currentRoom.roomId, username, message: text });
        } else {
            offlineChatQueueRef.current = [...offlineChatQueueRef.current, { message: text, queuedAt: Date.now() }].slice(-20);
        }
        setChatInput('');
    };

    const getGuessPosterCandidates = () => {
        const byId = new Map<string, { id: string; title: string; posterUrl: string; contentType?: string; category?: string }>();
        const selectedType = String(selectedMovie?.type || currentRoom?.movie?.type || '').toLowerCase();
        const canUseCharacterCandidates = selectedCategory === 'movies'
            || selectedCategory === 'anime'
            || selectedType.includes('movie')
            || selectedType.includes('anime');
        const characterCandidates = canUseCharacterCandidates
            ? (movieDetails?.cast || []).map((cast: any) => ({
                id: `character:${cast?.id || cast?.character || cast?.name || ''}`,
                title: String(cast?.character || cast?.name || '').trim(),
                posterUrl: String(cast?.avatar || '').trim(),
                contentType: 'character',
                category: selectedCategory || (selectedType.includes('anime') ? 'anime' : 'movie')
            }))
            : [];
        [currentRoom?.movie, selectedMovie, ...posterCandidatePool, ...searchResults, ...characterCandidates].forEach((movie: any) => {
            const id = String(movie?.subjectId || movie?.id || movie?.detailPath || '');
            const title = String(movie?.title || movie?.name || '').trim();
            const posterUrl = String(movie?.cover || movie?.thumbnail || movie?.posterUrl || '');
            const rawType = String(movie?.contentType || movie?.mediaType || movie?.type || '').trim();
            const contentType = rawType || (selectedCategory === 'anime' ? 'anime' : selectedCategory === 'movies' ? 'movie' : '');
            const category = String(movie?.category || selectedCategory || '').trim();
            if (id && title) byId.set(id, { id, title, posterUrl, ...(contentType ? { contentType } : {}), ...(category ? { category } : {}) });
        });
        return Array.from(byId.values()).slice(0, 30);
    };

    const handleStartGuessPoster = () => {
        if (!socket || !currentRoom || !isCreator) return;
        socket.emit('guess_poster_start', { roomId: currentRoom.roomId, candidates: getGuessPosterCandidates() });
    };

    const handleStartTrivia = () => {
        if (!socket || !currentRoom || !isCreator || isStartingTrivia) return;
        setIsStartingTrivia(true);
        triviaStartingRef.current = true;
        setTriviaError(null);
        socket.emit('movie_trivia_start', {
            roomId: currentRoom.roomId,
            movie: selectedMovie || currentRoom.movie,
            candidates: getGuessPosterCandidates(),
            maxRounds: 5
        });
    };

    const handleTriviaSubmit = (choice: number) => {
        if (!socket || !currentRoom || !triviaGame || triviaGame.status !== 'active') return;
        setTriviaChoice(choice);
        socket.emit('movie_trivia_submit', { roomId: currentRoom.roomId, choice, answerIndex: choice });
    };

    const handleEndTrivia = () => {
        if (!socket || !currentRoom || !isCreator) return;
        socket.emit('movie_trivia_end', { roomId: currentRoom.roomId });
    };

    const handleGuessSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const guess = guessInput.trim().slice(0, 80);
        if (!guess || !socket || !currentRoom || guessPosterGame?.status !== 'active') return;
        socket.emit('guess_poster_submit', { roomId: currentRoom.roomId, guess });
        setGuessInput('');
    };

    const getPartyGameCandidates = () => {
        const byId = new Map<string, {
            id: string;
            title: string;
            posterUrl?: string;
            imageUrl?: string;
            category?: string;
            contentType?: string;
            quote?: string;
            emoji?: string;
            aliases?: string[];
        }>();
        [currentRoom?.movie, selectedMovie, ...posterCandidatePool, ...searchResults].forEach((movie: any, index) => {
            const title = String(movie?.title || movie?.name || '').trim();
            if (!title) return;
            const id = String(movie?.subjectId || movie?.id || movie?.detailPath || `party-movie-${index}-${title}`).trim();
            const imageUrl = String(movie?.cover || movie?.thumbnail || movie?.posterUrl || '').trim();
            const contentType = String(movie?.contentType || movie?.mediaType || movie?.type || '').trim();
            const category = String(movie?.category || selectedCategory || '').trim();
            const aliases = Array.isArray(movie?.aliases) ? movie.aliases.map((alias: unknown) => String(alias).trim()).filter(Boolean) : undefined;
            byId.set(id, {
                id,
                title,
                ...(imageUrl ? { posterUrl: imageUrl, imageUrl } : {}),
                ...(contentType ? { contentType } : {}),
                ...(category ? { category } : {}),
                ...(movie?.quote || movie?.tagline ? { quote: String(movie.quote || movie.tagline) } : {}),
                ...(movie?.emoji || movie?.emojis ? { emoji: String(movie.emoji || movie.emojis) } : {}),
                ...(aliases?.length ? { aliases } : {})
            });
        });
        return Array.from(byId.values()).slice(0, 50);
    };

    const getPartyGameCharacters = () => {
        const movieTitle = String(selectedMovie?.title || currentRoom?.movie?.title || '').trim();
        const castSources = [movieDetails?.cast, selectedMovie?.cast, currentRoom?.movie?.cast].filter(Array.isArray) as any[][];
        const byId = new Map<string, { id: string; name: string; title: string; imageUrl?: string; category?: string; contentType?: string }>();
        castSources.flat().forEach((cast: any, index: number) => {
            const name = String(cast?.character || cast?.characterName || cast?.name || cast?.role || '').trim();
            const title = String(cast?.movieTitle || cast?.movie?.title || cast?.title || movieTitle).trim();
            if (!name || !title) return;
            const id = String(cast?.id || `party-character-${index}-${name}`).trim();
            const imageUrl = String(cast?.avatar || cast?.imageUrl || cast?.profileUrl || cast?.profile_path || cast?.posterUrl || '').trim();
            byId.set(id, {
                id,
                name,
                title,
                ...(imageUrl ? { imageUrl } : {}),
                ...(selectedCategory ? { category: selectedCategory } : {}),
                contentType: 'character'
            });
        });
        return Array.from(byId.values()).slice(0, 100);
    };

    const handleStartPartyGame = () => {
        if (!socket || !currentRoom || !isCreator || currentRoom.users.length < 2 || isStartingPartyGame) return;
        const candidates = getPartyGameCandidates();
        const characters = getPartyGameCharacters();
        if (!candidates.length && !characters.length) {
            setPartyGameError('Choose a movie or search the catalog before starting a party game.');
            return;
        }
        partyGameStartingRef.current = true;
        setIsStartingPartyGame(true);
        setPartyGameError(null);
        setPartyGameNotice(null);
        setPartyGameSubmitted(false);
        socket.emit('party_game_start', {
            roomId: currentRoom.roomId,
            gameType: partyGameType,
            rounds: partyRounds === 'custom' ? 'custom' : Number(partyRounds),
            customRounds: partyRounds === 'custom' ? Number(partyCustomRounds) : undefined,
            roundMs: partyRoundMs,
            candidates,
            characters,
            movie: selectedMovie || currentRoom.movie
        });
    };

    const handlePartyGameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const guess = partyGuessInput.trim().slice(0, 80);
        if (!guess || !socket || !currentRoom || !partyGame || partyGame.status !== 'active' || partyGameSubmitted) return;
        setPartyGameSubmitted(true);
        setPartyGuessInput('');
        socket.emit('party_game_submit', { roomId: currentRoom.roomId, guess });
    };

    const handleEndPartyGame = () => {
        if (!socket || !currentRoom || !isCreator) return;
        socket.emit('party_game_end', { roomId: currentRoom.roomId });
    };

    const gameRemainingSeconds = guessPosterGame?.status === 'active'
        ? Math.max(0, Math.ceil((guessPosterGame.endsAt - gameNow) / 1000))
        : 0;
    const gameLeaderboard = guessPosterGame
        ? Object.entries(guessPosterGame.scores).sort(([, left], [, right]) => right - left)
        : [];
    const triviaRemainingSeconds = triviaGame?.status === 'active'
        ? Math.max(0, Math.ceil((triviaGame.endsAt - gameNow) / 1000))
        : 0;
    const triviaLeaderboard = triviaGame
        ? Object.entries(triviaGame.scores || {}).sort(([, left], [, right]) => right - left)
        : [];
    const partyGameRemainingSeconds = partyGame?.status === 'active'
        ? Math.max(0, Math.ceil((partyGame.endsAt - gameNow) / 1000))
        : 0;
    const partyGameLeaderboard = partyGame
        ? Object.entries(partyGame.scores || {}).sort(([, left], [, right]) => right - left)
        : [];
    const activePartyRoundType = partyGame?.roundType || partyGame?.gameType;
    const activePartyMode = PARTY_GAME_OPTIONS.find(option => option.value === activePartyRoundType);

    const formatSeconds = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };
    const isDiscoverTab = entryTab === 'discover';

    return (
        <div className="min-h-screen bg-[#07080d] text-white pt-6 pb-20 px-4 sm:px-8 mobile-content-safe">
                 <div className="max-w-7xl mx-auto">
                {/* Header Navigation */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                    <div>
                        <button onClick={onBack} className="text-gray-400 hover:text-cyan-400 text-xs font-bold flex items-center gap-2 mb-2 transition-colors">
                            <i className="fa-solid fa-arrow-left"></i> Back to Main Catalog
                        </button>
                         <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 bg-clip-text text-transparent flex items-center gap-3">
                            <i className="fa-solid fa-users-viewfinder text-cyan-400"></i> Watch Party Cinema
                        </h1>
                         <p className="text-gray-400 text-xs mt-0.5">Real-time synchronized video streaming, host master controls, live chat, and viewer metrics.</p>
                         {isReconnecting && (
                             <div role="status" aria-live="polite" className="mt-2 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
                                 <i className="fa-solid fa-rotate animate-spin"></i>
                                 <span>Reconnecting...</span>
                             </div>
                             )}
                           </div>
                      </div>

                  {joinRequestState !== 'idle' && !currentRoom && (
                      <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm flex items-center gap-3 ${joinRequestState === 'denied' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'}`} role="status" aria-live="polite">
                          <i className={`fa-solid ${joinRequestState === 'pending' ? 'fa-hourglass-half' : joinRequestState === 'submitting' ? 'fa-rotate animate-spin' : 'fa-circle-exclamation'}`}></i>
                          <span>
                              {joinRequestState === 'submitting'
                                  ? `Connecting to watch party${joinRequestRoomId ? ` #${joinRequestRoomId}` : ''}…`
                                  : joinRequestState === 'pending'
                                      ? 'Join request sent. Keep this page open while the host approves you.'
                                      : 'Your request was not approved. You can try another room.'}
                          </span>
                      </div>
                  )}

                 {/* ROOM NOT JOINED YET: CREATE OR JOIN ACTIVE ROOM */}
                 {!currentRoom ? (
                     <>
                     <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#121322] p-3 sm:flex-row sm:items-center sm:justify-between">
                         <div className="flex items-center gap-1 rounded-xl bg-black/30 p-1" role="tablist" aria-label="Watch party entry">
                             <button
                                 type="button"
                                 role="tab"
                                 aria-selected={entryTab === 'create'}
                                 onClick={() => { setEntryTab('create'); setTargetRoomId(null); setJoinRequestRoomId(null); setJoinRequestState('idle'); window.history.pushState({}, '', '/watch-party'); }}
                                 className={`min-h-10 rounded-lg px-3 text-xs font-black transition-colors ${entryTab === 'create' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                             >
                                 <i className="fa-solid fa-circle-plus mr-1.5"></i>Create party
                             </button>
                              <button
                                  type="button"
                                  role="tab"
                                  aria-selected={entryTab === 'discover'}
                                  onClick={() => { setEntryTab('discover'); setTargetRoomId(null); setJoinRequestRoomId(null); setJoinRequestState('idle'); window.history.pushState({}, '', '/watch-party'); }}
                                  className={`min-h-10 rounded-lg px-3 text-xs font-black transition-colors ${entryTab === 'discover' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                              >
                                  <i className="fa-solid fa-compass mr-1.5"></i>Discover
                              </button>
                              <button
                                  type="button"
                                  role="tab"
                                  aria-selected={entryTab === 'join'}
                                  onClick={() => setEntryTab('join')}
                                 className={`min-h-10 rounded-lg px-3 text-xs font-black transition-colors ${entryTab === 'join' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                             >
                                 <i className="fa-solid fa-ticket mr-1.5"></i>Join by code
                             </button>
                         </div>
                         {entryTab === 'join' && !targetRoomId && (
                             <form onSubmit={handleJoinByCode} className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
                                 <label htmlFor="watch-party-code" className="sr-only">Join watch party by code</label>
                                     <input
                                     id="watch-party-code"
                                     value={joinCodeInput}
                                     onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                                     placeholder="Enter room code"
                                     maxLength={64}
                                     autoCapitalize="characters"
                                     className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-xs font-mono font-bold uppercase text-white outline-none focus:border-cyan-400"
                                 />
                                 <button type="submit" className="min-h-10 rounded-lg bg-cyan-500 px-3 text-xs font-black text-black hover:bg-cyan-400">Join</button>
                             </form>
                         )}
                     </div>
                       {entryTab !== 'create' ? (
                         targetRoomId ? (
                             <div className="mx-auto max-w-2xl rounded-3xl border border-cyan-500/30 bg-[#121322] p-5 shadow-2xl sm:p-7">
                                 {(() => {
                                     const targetRoom = activeRooms.find(room => room.roomId === targetRoomId);
                                     const targetEntryMode = targetRoom?.entryMode || 'manual';
                                     const requestInFlight = joinRequestRoomId === targetRoomId && (joinRequestState === 'pending' || joinRequestState === 'submitting');
                                     return (
                                         <>
                                             <div className="flex flex-wrap items-start justify-between gap-3">
                                                 <div>
                                                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Selected watch party</p>
                                                     <h2 className="mt-1 text-xl font-black text-white">{targetRoom?.roomName || `Room #${targetRoomId}`}</h2>
                                                     <p className="mt-1 text-xs text-gray-400">Code <span className="font-mono font-bold text-cyan-300">#{targetRoomId}</span>{targetRoom ? ` · Host: ${targetRoom.creator}` : ''}</p>
                                                 </div>
                                                 {targetRoom && <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black text-emerald-300">{getEntryModeLabel(targetEntryMode)}</span>}
                                             </div>
                                             <form onSubmit={handleJoinByCode} className="mt-5 flex gap-2">
                                                 <label htmlFor="selected-watch-party-code" className="sr-only">Join watch party by code</label>
                                                 <input
                                                     id="selected-watch-party-code"
                                                     value={joinCodeInput}
                                                     onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                                                     maxLength={64}
                                                     className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-xs font-mono font-bold uppercase text-white outline-none focus:border-cyan-400"
                                                 />
                                                 <button type="submit" disabled={requestInFlight || !socket} className="min-h-11 rounded-xl bg-cyan-500 px-4 text-xs font-black text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">
                                                     {joinRequestState === 'pending' && joinRequestRoomId === targetRoomId ? 'Submitted' : joinRequestState === 'submitting' && joinRequestRoomId === targetRoomId ? 'Joining…' : targetEntryMode === 'manual' ? 'Request to join' : 'Join now'}
                                                 </button>
                                             </form>
                                             <p className="mt-3 text-[11px] text-gray-400">
                                                 {targetRoom ? (targetEntryMode === 'manual' ? 'This room uses manual approval. Your request will stay attached to this room.' : 'You will enter this room immediately.') : 'Looking up this room code…'}
                                             </p>
                                         </>
                                     );
                                 })()}
                             </div>
                       ) : isDiscoverTab ? (
                      <div className="grid grid-cols-1 gap-6">
                          <div className="rounded-3xl border border-cyan-500/20 bg-[#121322] p-5 shadow-2xl sm:p-6">
                              <div className="flex flex-wrap items-end justify-between gap-3">
                                  <div>
                                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Discover</p>
                                      <h2 className="mt-1 text-xl font-black text-white">Public watch parties</h2>
                                      <p className="mt-1 max-w-xl text-xs text-gray-400">Browse rooms that chose to be discoverable. Private rooms stay invite-only — use Join by code when a host shares one.</p>
                                  </div>
                                  <button type="button" onClick={() => setEntryTab('create')} className="min-h-10 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-black text-cyan-200 hover:bg-cyan-500 hover:text-black">Create a room</button>
                              </div>
                          </div>
                          {activeRooms.filter(isRoomPublic).length === 0 ? (
                              <div className="rounded-3xl border border-white/10 bg-[#121322] px-6 py-16 text-center shadow-2xl">
                                  <i className="fa-solid fa-satellite-dish text-4xl text-cyan-400/50"></i>
                                  <p className="mt-4 text-sm font-black text-gray-200">No public rooms are live yet.</p>
                                  <p className="mt-1 text-xs text-gray-500">Start a public room or ask a host for their private code.</p>
                              </div>
                          ) : (
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                  {activeRooms.filter(isRoomPublic).map(room => (
                                      <div key={room.roomId} className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-[#121322] p-4 shadow-xl transition-all hover:-translate-y-0.5 hover:border-cyan-500/50">
                                          <div>
                                              <div className="flex items-center justify-between gap-2">
                                                  <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300"><i className="fa-solid fa-globe mr-1"></i>Public</span>
                                                  <span className="text-[10px] font-bold text-gray-400">{room.users?.length || 0} watching</span>
                                              </div>
                                              <h3 className="mt-3 truncate text-sm font-black text-white group-hover:text-cyan-300">{room.roomName}</h3>
                                              <p className="mt-1 text-[11px] text-gray-400">Hosted by <span className="font-bold text-gray-200">{room.creator}</span></p>
                                              {room.movie && <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/5 bg-black/30 p-2">
                                                  <img src={getPosterSrc(room.movie, 80)} alt="" width={40} height={56} loading="lazy" className="h-14 w-10 rounded-lg object-cover" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = WATCH_PARTY_FALLBACK; }} />
                                                  <div className="min-w-0"><p className="truncate text-xs font-bold text-gray-200">{room.movie.title || 'Choosing a title'}</p><p className="mt-1 text-[10px] text-cyan-300">{room.paused ? 'Paused' : 'Playing now'}</p></div>
                                              </div>}
                                          </div>
                                          <button type="button" onClick={() => room.entryMode === 'auto' ? handleJoinRoom(room.roomId) : handleRequestRoom(room.roomId)} disabled={joinRequestRoomId === room.roomId && (joinRequestState === 'pending' || joinRequestState === 'submitting')} className="mt-4 min-h-11 w-full rounded-xl bg-cyan-500 px-3 text-xs font-black text-black hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">
                                              <i className={`fa-solid ${room.entryMode === 'auto' ? 'fa-right-to-bracket' : 'fa-paper-plane'} mr-1.5`}></i>{room.entryMode === 'auto' ? 'Join now' : 'Request to join'}
                                          </button>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                      ) : (
                             <form onSubmit={handleJoinByCode} className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-[#121322] p-6 text-center shadow-2xl">
                                 <i className="fa-solid fa-ticket text-3xl text-cyan-400"></i>
                                 <h2 className="mt-3 text-lg font-black">Join watch party by code</h2>
                                 <p className="mt-1 text-xs text-gray-400">Enter the six-character code shared by your host.</p>
                                 <div className="mt-5 flex gap-2">
                                     <label htmlFor="watch-party-code-card" className="sr-only">Join watch party by code</label>
                                     <input id="watch-party-code-card" value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())} maxLength={64} autoFocus className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-center font-mono text-sm font-black uppercase text-white outline-none focus:border-cyan-400" placeholder="ABC123" />
                                     <button type="submit" className="min-h-11 rounded-xl bg-cyan-500 px-4 text-xs font-black text-black hover:bg-cyan-400">Continue</button>
                                 </div>
                             </form>
                         )
                     ) : (
                      <div className="mx-auto max-w-4xl">
                         <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                             <div>
                                 <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Build your screening room</p>
                                 <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Create a watch party</h2>
                                 <p className="mt-2 max-w-2xl text-xs leading-relaxed text-gray-400">Set the room rules, choose what to watch, and invite your people when you are ready.</p>
                             </div>
                             <span className="hidden items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500 sm:flex"><i className="fa-solid fa-circle-1 text-cyan-300"></i> Room setup <i className="fa-solid fa-arrow-right text-gray-700"></i> Invite</span>
                         </div>
                         {/* Room Creation Card */}
                         <div className="bg-[#121322] border border-white/10 rounded-3xl p-5 shadow-2xl sm:p-7">
                             <div className="mb-6 flex items-start gap-3 border-b border-white/10 pb-5">
                                 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><i className="fa-solid fa-circle-plus"></i></span>
                                 <div><h2 className="text-lg font-black text-white">Room details</h2><p className="mt-1 text-[11px] text-gray-500">Guests will see this identity in the lobby and invite preview.</p></div>
                             </div>
                             <form onSubmit={handleCreateRoom} className="space-y-4">
                                <div>
                                     <label className="mb-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400"><i className="fa-solid fa-user text-cyan-300"></i>Your Display Name</label>
                                    <input 
                                        type="text" 
                                        value={username} 
                                        onChange={(e) => setUsername(e.target.value)} 
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-white text-xs outline-none focus:border-cyan-500 font-bold"
                                         placeholder="How guests see you"
                                        required 
                                    />
                                     <p className="mt-1.5 text-[10px] text-gray-600">This appears beside your messages and host badge.</p>
                                 </div>
                                 <div>
                                     <label className="mb-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400"><i className="fa-solid fa-heading text-cyan-300"></i>Room Name</label>
                                    <input 
                                        type="text" 
                                        value={roomNameInput} 
                                        onChange={(e) => setRoomNameInput(e.target.value)} 
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-white text-xs outline-none focus:border-cyan-500"
                                         placeholder="Friday night cinema"
                                         required
                                     />
                                     <p className="mt-1.5 text-[10px] text-gray-600">A memorable title helps friends find the right room.</p>
                                 </div>
                                  <div className="border-t border-white/10 pt-5">
                                      <div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-400/10 text-[11px] text-purple-300"><i className="fa-solid fa-shield-halved"></i></span><div><p className="text-[11px] font-black text-white">Access & privacy</p><p className="text-[10px] text-gray-600">Choose how guests enter and where the room appears.</p></div></div>
                                  </div>
                                  <div>
                                      <label htmlFor="watch-party-entry-mode" className="mb-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400"><i className="fa-solid fa-door-open text-purple-300"></i>Guest Entry Mode</label>
                                        <select
                                            id="watch-party-entry-mode"
                                            value={createEntryMode}
                                            onChange={(e) => setCreateEntryMode(e.target.value as RoomEntryMode)}
                                            className="w-full min-h-11 bg-[#0a0b14] border border-white/10 rounded-xl py-2 px-3 text-white text-xs outline-none focus:border-cyan-500"
                                    >
                                        <option value="manual">Manual Approval</option>
                                        <option value="auto">Auto-Enter</option>
                                     </select>
                                      <p className="mt-1.5 text-[10px] text-gray-600">{createEntryMode === 'manual' ? 'You approve each guest request.' : 'Anyone with the link can enter immediately.'}</p>
                                  </div>
                                  <div>
                                      <label htmlFor="watch-party-visibility" className="mb-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400"><i className={`fa-solid ${createVisibility === 'public' ? 'fa-globe' : 'fa-lock'} text-emerald-300`}></i>Room visibility</label>
                                     <select
                                         id="watch-party-visibility"
                                         value={createVisibility}
                                         onChange={(e) => setCreateVisibility(e.target.value as 'public' | 'private')}
                                         className="w-full min-h-11 bg-[#0a0b14] border border-white/10 rounded-xl py-2 px-3 text-white text-xs outline-none focus:border-cyan-500"
                                     >
                                         <option value="public">Public — show in Discover</option>
                                         <option value="private">Private — invite/code only</option>
                                     </select>
                                      <p className="mt-1.5 text-[10px] text-gray-600">{createVisibility === 'public' ? 'Anyone can browse this room in Discover.' : 'Private rooms stay out of the public directory.'}</p>
                                 </div>

                                 {/* Main Search Engine Picker */}
                                 <div className="border-t border-white/10 pt-5">
                                     <div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-400/10 text-[11px] text-pink-300"><i className="fa-solid fa-film"></i></span><div><p className="text-[11px] font-black text-white">Choose a title</p><p className="text-[10px] text-gray-600">Search the catalog or browse a category.</p></div></div>
                                 </div>
                                 <div>
                                     <label className="mb-1.5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                                         <span className="flex items-center gap-2"><i className="fa-solid fa-film text-pink-300"></i>Pick Movie or Series</span>
                                         <span className="font-normal text-cyan-400">Catalog search</span>
                                    </label>
                                     <div className="relative mb-2">
                                        <input 
                                            type="text" 
                                            value={searchQuery} 
                                            onChange={(e) => executeSearch(e.target.value)} 
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-8 pr-3 text-white text-xs outline-none focus:border-cyan-500"
                                            placeholder="Search catalog for movies, series, anime..."
                                        />
                                        <i className="fa-solid fa-search absolute left-2.5 top-2.5 text-gray-400 text-xs"></i>
                                         {isSearching && <div className="absolute right-2.5 top-2.5 w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>}
                                     </div>

                                     <label htmlFor="watch-party-category" className="sr-only">Browse a category</label>
                                     <select
                                         id="watch-party-category"
                                         value={selectedCategory}
                                         onChange={(e) => loadCategory(e.target.value)}
                                         className="w-full min-h-11 bg-[#0a0b14] border border-white/10 rounded-xl px-3 text-xs text-gray-200 outline-none focus:border-cyan-500 mb-2"
                                     >
                                         <option value="">Or browse a category</option>
                                         {WATCH_PARTY_CATEGORIES.map(category => (
                                             <option key={category.id} value={category.id}>{category.label}</option>
                                         ))}
                                     </select>
                                     {isLoadingCategory && <p className="text-[10px] text-cyan-300 mb-2" role="status">Loading category titles…</p>}

                                    {/* Selected Movie Preview */}
                                    {selectedMovie && (
                                        <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/30 p-2.5 rounded-xl mb-2">
                                             <img src={getPosterSrc(selectedMovie, 100)} alt="" width={80} height={120} loading="lazy" className="w-10 h-14 object-cover rounded-lg flex-shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = WATCH_PARTY_FALLBACK; }} />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-cyan-300 truncate">{selectedMovie.title}</div>
                                                <div className="text-[10px] text-gray-400">{selectedMovie.releaseDate || 'Ready to Stream'}</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Live Search Engine Results */}
                                    {searchResults.length > 0 && (
                                        <div className="max-h-48 overflow-y-auto bg-[#0a0b14] border border-white/10 rounded-xl p-2 space-y-1.5 shadow-xl">
                                             {searchResults.map((m, i) => (
                                                 <button
                                                     type="button"
                                                     key={i} 
                                                     onClick={() => { setSelectedMovie(m); setSearchResults([]); setSearchQuery(m.title); }} 
                                                     className="w-full min-h-11 flex items-center gap-2.5 p-1.5 hover:bg-white/10 rounded-lg cursor-pointer text-xs group transition-colors text-left"
                                                 >
                                                     <img src={getPosterSrc(m, 80)} alt="" width={64} height={96} loading="lazy" className="w-8 h-10 object-cover rounded flex-shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = WATCH_PARTY_FALLBACK; }} />
                                                     <div className="truncate">
                                                         <p className="font-bold text-white group-hover:text-cyan-400 truncate">{m.title}</p>
                                                         <p className="text-[10px] text-gray-400">{m.type || 'Movie'} • {m.releaseDate || '2024'}</p>
                                                     </div>
                                                 </button>
                                             ))}
                                        </div>
                                    )}
                                </div>

                                 <button type="submit" disabled={isCreatingRoom || !socket} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
                                     {isCreatingRoom ? 'Launching…' : 'Launch Watch Room'}
                                </button>
                            </form>
                        </div>

                        {/* Active Rooms Listing */}
                         {false && (
                         <div>
                            <h2 className="text-lg font-bold mb-4 flex items-center justify-between text-purple-400">
                                <span className="flex items-center gap-2">
                                    <i className="fa-solid fa-satellite-dish"></i> Live Watch Parties ({activeRooms.length})
                                </span>
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-mono font-bold">
                                    Active Now
                                </span>
                            </h2>
                            {activeRooms.length === 0 ? (
                                <div className="text-center py-20 text-gray-400">
                                    <i className="fa-solid fa-tv text-4xl mb-3 opacity-30 text-cyan-400"></i>
                                    <p className="text-xs font-bold text-gray-300">No active watch rooms right now.</p>
                                    <p className="text-[11px] text-gray-500 mt-1">Be the first to create one and share your invite link!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {activeRooms.map(room => (
                                        <div key={room.roomId} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-cyan-500/50 transition-all group">
                                            <div>
                                                 <div className="flex items-center justify-between mb-2">
                                                     <div className="flex flex-wrap items-center gap-1.5">
                                                         <span className="bg-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">ROOM #{room.roomId}</span>
                                                         <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isRoomPublic(room) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-500/15 text-gray-300'}`}>
                                                             <i className={`fa-solid ${isRoomPublic(room) ? 'fa-globe' : 'fa-lock'} mr-1`}></i>{isRoomPublic(room) ? 'Public' : 'Private'}
                                                         </span>
                                                     </div>
                                                    <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                                        {room.users.length} {room.users.length === 1 ? 'Viewer' : 'Viewers'}
                                                    </span>
                                                </div>
                                                <h3 className="text-sm font-black text-white mb-0.5 group-hover:text-cyan-400 transition-colors">{room.roomName}</h3>
                                                <p className="text-[11px] text-gray-400 mb-3">Host: <span className="text-gray-300 font-semibold">{room.creator}</span></p>
                                                <p className="text-[10px] text-cyan-300 font-semibold mb-3">Entry: {getEntryModeLabel(room.entryMode || 'manual')}</p>
                                                {room.movie && (
                                                    <div className="flex items-center gap-3 bg-black/50 p-2 rounded-xl mb-4 border border-white/5">
                                                         <img src={getPosterSrc(room.movie, 100)} alt="" width={80} height={120} loading="lazy" className="w-10 h-14 object-cover rounded-lg flex-shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = WATCH_PARTY_FALLBACK; }} />
                                                        <div className="truncate">
                                                            <div className="text-xs font-bold text-gray-200 truncate">{room.movie.title}</div>
                                                            <div className="text-[10px] text-cyan-400 font-mono mt-0.5 flex items-center gap-1.5">
                                                                {room.paused ? (
                                                                    <>
                                                                        <i className="fa-solid fa-pause text-amber-400"></i>
                                                                        <span>Paused</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <i className="fa-solid fa-play text-cyan-400"></i>
                                                                        <span>Streaming</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                  <button
                                                      onClick={() => room.entryMode === 'auto' ? handleJoinRoom(room.roomId) : handleRequestRoom(room.roomId)}
                                                      disabled={joinRequestRoomId === room.roomId && (joinRequestState === 'pending' || joinRequestState === 'submitting')}
                                                     className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                                                 >
                                                     <i className={`fa-solid ${joinRequestRoomId === room.roomId && joinRequestState === 'submitting' ? 'fa-rotate animate-spin' : room.entryMode === 'auto' ? 'fa-right-to-bracket' : 'fa-paper-plane'}`}></i> {joinRequestRoomId === room.roomId && joinRequestState === 'pending' ? 'Submitted' : joinRequestRoomId === room.roomId && joinRequestState === 'submitting' ? 'Joining…' : room.entryMode === 'auto' ? 'Join Now' : 'Request to Join'}
                                                 </button>
                                                {(room.creator === username || room.creator === localStorage.getItem('slflix_username')) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleKillRoom(room.roomId);
                                                        }}
                                                        className="px-3 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold text-xs rounded-xl transition-all flex items-center justify-center cursor-pointer"
                                                        title="Permanently End Party"
                                                    >
                                                        <i className="fa-solid fa-trash-can"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             )}
                          </div>)}
                      </div>
                      )}
                      </>
                 ) : (
                    /* INSIDE ACTIVE ROOM: UNIFIED GLOBAL STREAMING PLAYER & REAL-TIME PARTY CONTROLS */
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3 space-y-4">
                            {/* Unified VideoPlayer Component */}
                            {loadingStream ? (
                                <div className="w-full aspect-video bg-black/90 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center p-6 shadow-2xl">
                                    <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <p className="text-sm font-bold text-white">Connecting Global Stream...</p>
                                    <p className="text-xs text-gray-400 mt-1">Synchronizing room audio & video tracks</p>
                                </div>
                            ) : streamError ? (
                                <div role="alert" className="w-full aspect-video bg-[#121324] rounded-2xl border border-red-500/30 flex flex-col items-center justify-center p-6 text-center shadow-2xl">
                                    <i className="fa-solid fa-triangle-exclamation text-red-400 text-4xl mb-3"></i>
                                    <p className="text-sm font-bold text-white">Stream unavailable</p>
                                    <p className="text-xs text-gray-400 mt-1">{streamError}</p>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMovie(prev => prev ? { ...prev } : prev)}
                                        className="mt-4 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black text-black hover:bg-cyan-400 cursor-pointer"
                                    >
                                        Try again
                                    </button>
                                </div>
                            ) : sources.length > 0 ? (
                                <VideoPlayer
                                    title={selectedMovie?.title || currentRoom.movie?.title || 'Watch Party Stream'}
                                    subTitle={(() => {
                                        const rawType = String(selectedMovie?.type || movieDetails?.type || currentRoom.movie?.type || '').toLowerCase();
                                        const isMovie = rawType === 'movie' || rawType.includes('feature');
                                        const isSer = !isMovie && (rawType.includes('series') || rawType.includes('tv') || rawType.includes('anime') || (movieDetails?.seasons && movieDetails.seasons.length > 1));
                                        return isSer ? `Season ${selectedSeason} • Episode ${selectedEpisode}` : undefined;
                                    })()}
                                    sources={sources}
                                    subtitles={subtitles}
                                    onClose={handleLeaveRoom}
                                    embedded={true}
                                    movie={movieDetails || selectedMovie || currentRoom.movie}
                                    currentSeason={selectedSeason}
                                    currentEpisode={selectedEpisode}
                                    onSeasonChange={(s) => setSelectedSeason(s)}
                                    onEpisodeChange={handleSelectEpisode}
                                    onPlayNext={handlePlayNextEpisode}
                                    watchPartyProps={{
                                        isHost: isCreator,
                                        viewersCount: currentRoom.users?.length || 1,
                                        viewersList: currentRoom.users || [],
                                        inStreamChat: inStreamLatestChat,
                                        pauseNotice: pauseNotice,
                                        onHostAction: handleHostAction,
                                        onBufferingChange: handleBufferingChange,
                                        syncTime: currentRoom.currentTime,
                                        syncPaused: currentRoom.paused,
                                        syncTimestamp: roomSyncTimestamp
                                    }}
                                />
                            ) : (
                                <div className="w-full aspect-video bg-[#121324] rounded-2xl border border-white/10 flex flex-col items-center justify-center p-6 text-center shadow-2xl">
                                    <i className="fa-solid fa-circle-exclamation text-amber-400 text-4xl mb-3"></i>
                                    <p className="text-sm font-bold text-white">Stream Sources Loading...</p>
                                    <p className="text-xs text-gray-400 mt-1">Please select another title or wait a moment.</p>
                                </div>
                            )}

                            {/* SERIES EPISODES SELECTOR DRAWER */}
                            {(() => {
                                const rawType = String(selectedMovie?.type || movieDetails?.type || currentRoom.movie?.type || '').toLowerCase();
                                const isMovie = rawType === 'movie' || rawType.includes('feature');
                                const isSer = !isMovie && (rawType.includes('series') || rawType.includes('tv') || rawType.includes('anime') || (movieDetails?.seasons && movieDetails.seasons.length > 1));
                                if (!isSer || !showEpisodeSelector || !movieDetails?.seasons) return null;
                                return (
                                    <div className="bg-[#121324] border border-white/10 rounded-2xl p-4 animate-fade-in">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-xs font-bold uppercase text-cyan-400">Select Episode to Stream</h3>
                                            <button onClick={() => setShowEpisodeSelector(false)} className="text-gray-400 hover:text-white text-xs">
                                                <i className="fa-solid fa-xmark"></i>
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {movieDetails.seasons.map((season: Season) => {
                                                const seasonNum = season.seasonNumber || 1;
                                                const epList: number[] = season.episodes && season.episodes.length > 0 
                                                    ? season.episodes.map(e => e.episodeNumber)
                                                    : Array.from({ length: season.episodeCount || 1 }, (_, idx) => idx + 1);

                                                return (
                                                    <div key={seasonNum}>
                                                        <p className="text-[11px] font-bold text-gray-400 mb-1.5">Season {seasonNum}</p>
                                                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                                            {epList.map((epNum) => {
                                                                const isCurrent = selectedSeason === seasonNum && selectedEpisode === epNum;
                                                                return (
                                                                    <button
                                                                        key={epNum}
                                                                        onClick={() => handleSelectEpisode(seasonNum, epNum)}
                                                                        disabled={!isCreator}
                                                                        className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                                                                            isCurrent 
                                                                                ? 'bg-cyan-500 text-black border-cyan-400' 
                                                                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-300'
                                                                        } ${!isCreator ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                                    >
                                                                        EP {epNum}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ROOM CONTROLS & TIMERS BAR */}
                             <div className="rounded-3xl border border-white/10 bg-[#121322] p-4 shadow-xl sm:p-5">
                                 <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                 <div className="min-w-0">
                                     <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                         <span>Room: {currentRoom.roomName} (#{currentRoom.roomId})</span>
                                        {isCreator && (
                                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                <i className="fa-solid fa-crown text-[10px] text-amber-300"></i>
                                                <span>Creator</span>
                                            </span>
                                        )}
                                    </div>
                                     <div className="text-sm font-extrabold text-white mt-0.5">
                                         Now Watching: {selectedMovie?.title || currentRoom.movie?.title}
                                     </div>
                                     <div className="mt-3 flex w-fit items-center gap-1 rounded-xl border border-white/10 bg-black/25 p-1" role="tablist" aria-label="Room workspace">
                                         <button type="button" role="tab" aria-selected={roomView === 'watch'} onClick={() => setRoomView('watch')} className={`min-h-9 rounded-lg px-3 text-[11px] font-black transition-colors ${roomView === 'watch' ? 'bg-cyan-400 text-black' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}><i className="fa-solid fa-tv mr-1.5"></i>Watch</button>
                                         <button type="button" role="tab" aria-selected={roomView === 'games'} onClick={() => setRoomView('games')} className={`min-h-9 rounded-lg px-3 text-[11px] font-black transition-colors ${roomView === 'games' ? 'bg-fuchsia-300 text-[#170b20]' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}><i className="fa-solid fa-gamepad mr-1.5"></i>Games{(guessPosterGame || triviaGame || partyGame) && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-400/20 px-1 text-[9px]">●</span>}</button>
                                     </div>
                                 </div>
                                 <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
                                     <div className="flex flex-wrap items-center gap-2" aria-label="Playback and session controls">
                                    {isCreator ? (
                                        <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-200">
                                            <i className="fa-solid fa-door-open text-amber-300"></i>
                                            <span>Entry:</span>
                                            <select
                                                value={currentRoom.entryMode || 'manual'}
                                                onChange={(e) => handleEntryModeChange(e.target.value as RoomEntryMode)}
                                                aria-label="Watch party entry mode"
                                                className="min-h-11 bg-transparent text-amber-100 outline-none cursor-pointer"
                                            >
                                                <option className="bg-[#121322]" value="manual">Manual Approval</option>
                                                <option className="bg-[#121322]" value="auto">Auto-Enter</option>
                                            </select>
                                        </label>
                                    ) : (
                                        <span className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300">
                                            Entry: {getEntryModeLabel(currentRoom.entryMode || 'manual')}
                                        </span>
                                    )}
                                    {/* Series Episode Selector Button */}
                                    {(() => {
                                        const rawType = String(selectedMovie?.type || movieDetails?.type || currentRoom.movie?.type || '').toLowerCase();
                                        const isMovie = rawType === 'movie' || rawType.includes('feature');
                                        const isSer = !isMovie && (rawType.includes('series') || rawType.includes('tv') || rawType.includes('anime') || (movieDetails?.seasons && movieDetails.seasons.length > 1));
                                        if (!isSer || !movieDetails?.seasons) return null;
                                        return (
                                            <button 
                                                onClick={() => setShowEpisodeSelector(!showEpisodeSelector)}
                                                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-cyan-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <i className="fa-solid fa-list-ol"></i>
                                                <span>S{selectedSeason} E{selectedEpisode}</span>
                                                <i className="fa-solid fa-chevron-down text-[10px]"></i>
                                            </button>
                                        );
                                    })()}

                                    {/* Auto-Play Next Toggle for Creator */}
                                    {(() => {
                                        const rawType = String(selectedMovie?.type || movieDetails?.type || currentRoom.movie?.type || '').toLowerCase();
                                        const isMovie = rawType === 'movie' || rawType.includes('feature');
                                        const isSer = !isMovie && (rawType.includes('series') || rawType.includes('tv') || rawType.includes('anime') || (movieDetails?.seasons && movieDetails.seasons.length > 1));
                                        if (!isSer || !isCreator || !movieDetails?.seasons) return null;
                                        return (
                                            <button 
                                                onClick={() => setAutoPlayNext(!autoPlayNext)}
                                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                                    autoPlayNext ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-gray-400'
                                                }`}
                                            >
                                                Auto-Next: {autoPlayNext ? 'ON' : 'OFF'}
                                            </button>
                                        );
                                    })()}

                                    {/* Sleep Timer Menu */}
                                    <div className="relative">
                                        <button 
                                            onClick={() => setShowTimerMenu(!showTimerMenu)}
                                            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-cyan-400 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                            title="Set Sleep Timer"
                                        >
                                            <i className="fa-solid fa-stopwatch"></i>
                                            <span>{timerRemainingSeconds ? formatSeconds(timerRemainingSeconds) : 'Timer'}</span>
                                        </button>

                                        {showTimerMenu && (
                                            <div className="absolute left-0 bottom-full mb-2 bg-[#121324]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-2 shadow-2xl z-50 w-36 space-y-1 text-xs">
                                                <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase">Sleep Timer</div>
                                                {[15, 30, 45, 60, 90].map(mins => (
                                                    <button
                                                        key={mins}
                                                        onClick={() => {
                                                            setSleepTimerMinutes(mins);
                                                            setTimerRemainingSeconds(mins * 60);
                                                            setShowTimerMenu(false);
                                                        }}
                                                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-white font-semibold cursor-pointer transition-colors"
                                                    >
                                                        {mins} Minutes
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => {
                                                        setSleepTimerMinutes(null);
                                                        setTimerRemainingSeconds(null);
                                                        setShowTimerMenu(false);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-500/20 text-red-400 font-semibold cursor-pointer transition-colors"
                                                >
                                                    Turn Off
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                     </div>
                                     <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0" aria-label="Invite and room controls">
                                      {isCreator && waitExpiresAt && waitRemainingMs > 0 && (

                                         <div role="status" className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-xl flex items-center gap-2">

                                             <i className="fa-solid fa-hourglass-half"></i>

                                             <span>Closes in {Math.floor(waitRemainingMs / 60000)}:{String(Math.floor((waitRemainingMs % 60000) / 1000)).padStart(2, '0')} if nobody joins</span>

                                             {waitRemainingMs < 5 * 60 * 1000 && (

                                                 <button onClick={() => socket?.emit('extend_room_wait', { roomId: currentRoom.roomId, username })} className="px-2 py-1 bg-amber-500 text-black rounded-lg cursor-pointer">+30 min</button>

                                             )}

                                         </div>

                                     )}

                                     {/* Share invite link and six-character room code */}
                                     <button 
                                         onClick={handleShareInvite}
                                         className="px-3.5 py-2 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black text-cyan-400 border border-cyan-500/30 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                         title={`Share invite link or code ${currentRoom.roomId}`}
                                     >
                                         <i className="fa-solid fa-share-nodes"></i>
                                         <span>{inviteCopied ? 'Copied!' : 'Invite'}</span>
                                     </button>
                                     <button
                                         onClick={handleCopyInviteLink}
                                         className="px-3.5 py-2 bg-white/5 hover:bg-white/15 text-gray-200 border border-white/10 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                         title="Copy invite link"
                                         aria-label="Copy invite link"
                                     >
                                         <i className="fa-solid fa-link mr-1.5"></i>Copy link
                                     </button>
                                     <button
                                         onClick={handleCopyRoomCode}
                                         className="px-3.5 py-2 bg-white/5 hover:bg-white/15 text-gray-200 border border-white/10 font-mono font-bold text-xs rounded-xl transition-all cursor-pointer"
                                         title="Copy room code"
                                         aria-label={`Copy room code ${currentRoom.roomId}`}
                                     >
                                         <i className="fa-solid fa-copy mr-1.5"></i>Copy code <span className="text-cyan-300">#{currentRoom.roomId}</span>
                                     </button>

                                     {isCreator && joinRequests.length > 0 && (
                                         <div className="relative">
                                             <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-pink-500 text-[10px] font-black text-white flex items-center justify-center">{joinRequests.length}</span>
                                             <details className="relative">
                                                 <summary className="list-none px-3.5 py-2 bg-pink-500/10 hover:bg-pink-500 hover:text-black text-pink-300 border border-pink-500/30 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5">
                                                     <i className="fa-solid fa-user-clock"></i> Requests
                                                 </summary>
                                                 <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-[#121324] border border-white/15 rounded-2xl p-2 shadow-2xl space-y-2">
                                                     {joinRequests.map(request => (
                                                         <div key={request.requestId} className="bg-white/5 rounded-xl p-2.5 flex items-center justify-between gap-2">
                                                             <span className="text-xs font-bold text-white truncate">{request.username}</span>
                                                             <div className="flex gap-1">
                                                                 <button aria-label={`Approve ${request.username}`} title="Approve" onClick={() => handleJoinRequestDecision(request.requestId, 'approve')} className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-black"><i className="fa-solid fa-check"></i></button>
                                                                 <button aria-label={`Deny ${request.username}`} title="Deny" onClick={() => handleJoinRequestDecision(request.requestId, 'deny')} className="w-8 h-8 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
                                                             </div>
                                                         </div>
                                                     ))}
                                                 </div>
                                             </details>
                                         </div>
                                     )}

                                     </div>

                                     {/* Leave Room */}
                                    <button 
                                        onClick={handleLeaveRoom}
                                        className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                                    >
                                        Leave
                                    </button>

                                    {/* Creator Kill / End Party Button */}
                                    {isCreator && (
                                        <button 
                                            onClick={() => handleKillRoom()}
                                            className="px-3.5 py-2 bg-red-600/25 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-500/10"
                                            title="Permanently close this watch party for everyone"
                                        >
                                            <i className="fa-solid fa-trash-can"></i>
                                            <span>End Party</span>
                                        </button>
                                    )}
                                 </div>
                             </div>
                             </div>

                             {roomView === 'games' && (
                              <div className="space-y-4 rounded-3xl border border-fuchsia-400/20 bg-[linear-gradient(145deg,rgba(30,18,48,.84),rgba(8,13,27,.96))] p-3 shadow-2xl sm:p-4">
                                 <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                                     <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-400/15 text-fuchsia-200"><i className="fa-solid fa-gamepad"></i></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200">Room arcade</p><h2 className="mt-1 text-lg font-black text-white">Play together while you watch</h2><p className="mt-1 text-[11px] text-gray-400">Games stay tucked away until your group is ready. Hosts can open a round below.</p></div></div>
                                     <button type="button" onClick={() => setRoomView('watch')} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[11px] font-black text-gray-300 hover:bg-white/10 hover:text-white"><i className="fa-solid fa-arrow-left mr-1.5"></i>Back to watch</button>
                                 </div>
                             {/* WAITING-ROOM GAME: GUESS THE POSTER */}
                             <section className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4" aria-labelledby="guess-poster-title">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-2"><span className="rounded-full bg-purple-400/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-purple-200">Poster quiz</span><span className="text-[10px] text-purple-300/70">5 rounds · 20 sec each</span></div>
                                        <h2 id="guess-poster-title" className="mt-1 text-sm font-black text-purple-100">Guess the Poster</h2>
                                        <p className="text-[10px] text-purple-300/80">Exact/full guesses earn <strong className="text-amber-200">5 pts</strong>. Accepted non-full or near guesses earn <strong className="text-cyan-200">3 pts</strong>.</p>
                                    </div>
                                    {isCreator && (!guessPosterGame || guessPosterGame.status === 'finished') && (
                                        <button type="button" onClick={handleStartGuessPoster} disabled={currentRoom.users.length < 2 || getGuessPosterCandidates().length === 0} className="min-h-11 rounded-xl bg-purple-400 px-3 text-[11px] font-black text-black disabled:cursor-not-allowed disabled:opacity-40">Start game</button>
                                    )}
                                </div>
                                {guessPosterGame ? (
                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)]">
                                        <div>
                                            <div className="flex items-center justify-between text-[11px] font-black text-purple-100"><span>Round {guessPosterGame.round}/{guessPosterGame.maxRounds}</span>{guessPosterGame.status === 'active' && <span className="rounded-full bg-black/30 px-2 py-1 text-amber-200">{gameRemainingSeconds}s</span>}</div>
                                            <div className="relative mt-2 overflow-hidden rounded-2xl border border-purple-300/20 bg-black/50 p-2 shadow-2xl">
                                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,.28),transparent_55%)]"></div>
                                                {guessPosterGame.posterUrl ? <img src={guessPosterGame.posterUrl} alt="Mystery poster, title hidden until reveal" className="relative h-56 w-full rounded-xl object-cover transition-[filter] duration-500 sm:h-64" style={{ filter: guessPosterGame.status === 'active' ? `blur(${Math.max(2, gameRemainingSeconds / 2)}px) saturate(.75)` : 'none' }} /> : <div className="relative flex h-56 items-center justify-center text-xs text-gray-500">Poster unavailable</div>}
                                                {guessPosterGame.status === 'active' && <div className="absolute inset-x-5 bottom-5 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[.2em] text-white/80 backdrop-blur">Title hidden · trust the clues</div>}
                                            </div>
                                            {(guessPosterGame.label || guessPosterGame.category || guessPosterGame.mediaType || guessPosterGame.contentType) && <div className="mt-2 flex flex-wrap gap-1.5">{[guessPosterGame.label, guessPosterGame.category, guessPosterGame.mediaType || guessPosterGame.contentType].filter(Boolean).map(label => <span key={label} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold text-cyan-200">{label}</span>)}</div>}
                                            {guessPosterGame.status === 'active' && <form onSubmit={handleGuessSubmit} className="mt-2 flex gap-2"><input value={guessInput} onChange={e => setGuessInput(e.target.value)} maxLength={80} placeholder="Type your guess — title stays hidden" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white outline-none focus:border-purple-300" aria-label="Guess the poster title" /><button type="submit" className="min-h-11 rounded-xl bg-purple-400 px-3 text-xs font-black text-black">Guess</button></form>}
                                            {gameNotice && <p className="mt-2 text-[11px] font-bold text-amber-200" role="status">{gameNotice}</p>}
                                            {guessPosterGame.revealed && <p className="mt-2 text-xs font-black text-emerald-200">Answer revealed: {guessPosterGame.answerTitle}</p>}
                                            {guessPosterHistory.length > 1 && <div className="mt-3"><p className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-purple-200/70">Round reel</p><div className="flex gap-2 overflow-x-auto pb-1">{guessPosterHistory.map(item => <div key={item.round} className={`relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border ${item.round === guessPosterGame.round ? 'border-purple-300' : 'border-white/10'}`}><img src={item.posterUrl || WATCH_PARTY_FALLBACK} alt={`Round ${item.round}`} className={`h-full w-full object-cover ${item.revealed ? '' : 'blur-sm'}`} /><span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[9px] font-black text-white">R{item.round}</span></div>)}</div></div>}
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><h3 className="text-[10px] font-black uppercase tracking-wider text-purple-200">Scoreboard</h3><ol className="mt-2 space-y-1.5">{gameLeaderboard.map(([name, score], index) => <li key={name} className="flex items-center justify-between text-xs text-gray-200"><span>{index + 1}. {name}</span><strong className="text-purple-200">{score}</strong></li>)}</ol>{gameLeaderboard.length === 0 && <p className="mt-2 text-[11px] text-gray-500">Scores appear after the first correct guess.</p>}{guessPosterGame.status === 'finished' && <p className="mt-3 text-[11px] font-black text-emerald-200">Final leaderboard</p>}</div>
                                    </div>
                                ) : <p className="mt-3 text-[11px] text-gray-400">Waiting for the host to start a game. At least two members are required.</p>}
                            </section>
                            {/* SECOND WAITING-ROOM GAME: MOVIE TRIVIA */}
                            <section className="rounded-2xl border border-cyan-500/25 bg-cyan-950/15 p-4" aria-labelledby="movie-trivia-title">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-2"><span className="rounded-full bg-cyan-400/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">New game</span><span className="text-[10px] text-cyan-300/70">Timed choices</span></div>
                                        <h2 id="movie-trivia-title" className="mt-1 text-sm font-black text-cyan-100">Movie Trivia</h2>
                                        <p className="text-[10px] text-cyan-300/80">Race the room to the right answer, then watch the scoreboard update.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isCreator && triviaGame && <button type="button" onClick={handleEndTrivia} className="min-h-10 rounded-xl border border-red-400/30 bg-red-500/10 px-3 text-[11px] font-black text-red-200 hover:bg-red-500 hover:text-white">End game</button>}
                                        {isCreator && (!triviaGame || triviaGame.status === 'finished') && <button type="button" onClick={handleStartTrivia} disabled={isStartingTrivia || currentRoom.users.length < 2} className="min-h-10 rounded-xl bg-cyan-400 px-3 text-[11px] font-black text-black disabled:cursor-not-allowed disabled:opacity-40">{isStartingTrivia ? 'Loading…' : 'Start trivia'}</button>}
                                    </div>
                                </div>
                                {triviaError && <div role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-200"><i className="fa-solid fa-triangle-exclamation mr-1.5"></i>{triviaError}</div>}
                                {isStartingTrivia && !triviaGame && <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-xs text-gray-300" role="status"><span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent"></span>Preparing a trivia round…</div>}
                                {triviaGame ? <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.75fr)]">
                                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-cyan-200"><span>Round {triviaGame.round}/{triviaGame.maxRounds}</span>{triviaGame.status === 'active' && <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-cyan-200">{triviaRemainingSeconds}s</span>}</div>
                                        <p className="mt-3 text-base font-black leading-snug text-white">{triviaGame.prompt || 'Trivia prompt loading…'}</p>
                                        {triviaGame.category && <span className="mt-2 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold text-cyan-200">{triviaGame.category}</span>}
                                        <div className="mt-4 grid gap-2">{(triviaGame.choices || []).map((choice, index) => {
                                            const isSelected = triviaChoice === index;
                                            const isAnswer = triviaGame.revealed && triviaGame.answerIndex === index;
                                            return <button key={`${choice}-${index}`} type="button" onClick={() => handleTriviaSubmit(index)} disabled={triviaGame.status !== 'active' || triviaChoice !== null} className={`min-h-12 rounded-xl border px-3 text-left text-xs font-bold transition-all ${isAnswer ? 'border-emerald-300 bg-emerald-500/20 text-emerald-100' : isSelected ? 'border-cyan-300 bg-cyan-500/20 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200 hover:border-cyan-300/60 hover:bg-cyan-500/10'} disabled:cursor-not-allowed disabled:opacity-80`}><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-black/25 text-[10px]">{String.fromCharCode(65 + index)}</span>{choice}</button>;
                                        })}</div>
                                        {triviaGame.revealed && triviaGame.correctChoice && <p className="mt-3 text-xs font-black text-emerald-200">Correct answer: {triviaGame.correctChoice}</p>}
                                        {triviaNotice && <p className="mt-2 text-[11px] font-bold text-amber-200" role="status">{triviaNotice}</p>}
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3"><h3 className="text-[10px] font-black uppercase tracking-wider text-cyan-200">Scoreboard</h3><ol className="mt-2 space-y-1.5">{triviaLeaderboard.map(([name, score], index) => <li key={name} className="flex items-center justify-between text-xs text-gray-200"><span>{index + 1}. {name}</span><strong className="text-cyan-200">{score}</strong></li>)}</ol>{triviaLeaderboard.length === 0 && <p className="mt-2 text-[11px] text-gray-500">Scores appear after the first answer.</p>}{triviaGame.status === 'finished' && <p className="mt-3 text-[11px] font-black text-emerald-200">Final leaderboard</p>}</div>
                                 </div> : !isStartingTrivia && !triviaError && <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/15 px-3 py-5 text-center text-[11px] text-gray-400"><i className="fa-solid fa-circle-question mb-2 text-2xl text-cyan-400/50"></i><p>No trivia round is active.</p><p className="mt-1 text-gray-500">The host can start Movie Trivia when at least two people are in the room.</p></div>}
                             </section>
                             {/* GENERIC PARTY GAME LOBBY & LIVE CARD */}
                             <section className="overflow-hidden rounded-2xl border border-fuchsia-400/25 bg-[linear-gradient(135deg,rgba(36,20,56,.8),rgba(8,13,27,.95))] p-4 shadow-xl" aria-labelledby="party-game-title">
                                 <div className="flex flex-wrap items-start justify-between gap-3">
                                     <div>
                                         <div className="flex flex-wrap items-center gap-2">
                                             <span className="rounded-full bg-fuchsia-400/15 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-fuchsia-200">Party arcade</span>
                                             <span className="text-[10px] text-fuchsia-200/60">Live socket game</span>
                                         </div>
                                         <h2 id="party-game-title" className="mt-1 text-base font-black text-white">Movie Matchup</h2>
                                         <p className="mt-1 max-w-xl text-[10px] leading-relaxed text-fuchsia-100/65">A compact five-point race through clues, quotes, characters, and scrambled titles.</p>
                                     </div>
                                     {isCreator && partyGame && <button type="button" onClick={handleEndPartyGame} className="min-h-10 rounded-xl border border-red-400/30 bg-red-500/10 px-3 text-[11px] font-black text-red-200 transition-colors hover:bg-red-500 hover:text-white">End game</button>}
                                 </div>

                                 {isCreator && (!partyGame || partyGame.status === 'finished') && (
                                     <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                                         <div className="mb-3 flex items-center justify-between gap-2">
                                             <div>
                                                 <p className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">Game lobby</p>
                                                 <p className="mt-1 text-[11px] text-gray-400">Host controls · {currentRoom.users.length}/20 players in room</p>
                                             </div>
                                             {currentRoom.users.length < 2 && <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-200">Need 2 players</span>}
                                         </div>
                                         <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                                             {PARTY_GAME_OPTIONS.map(option => (
                                                 <button
                                                     key={option.value}
                                                     type="button"
                                                     aria-pressed={partyGameType === option.value}
                                                     onClick={() => setPartyGameType(option.value)}
                                                     className={`min-h-[84px] rounded-xl border p-2.5 text-left transition-all ${partyGameType === option.value ? 'border-fuchsia-300 bg-fuchsia-400/15 text-white shadow-lg shadow-fuchsia-500/10' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-fuchsia-300/50 hover:bg-fuchsia-400/10'}`}
                                                 >
                                                     <i className={`fa-solid ${option.icon} text-sm ${partyGameType === option.value ? 'text-fuchsia-200' : 'text-gray-500'}`}></i>
                                                     <span className="mt-2 block text-[11px] font-black leading-tight">{option.label}</span>
                                                     <span className="mt-1 block text-[9px] leading-snug text-gray-500">{option.description}</span>
                                                 </button>
                                             ))}
                                         </div>
                                         <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                             <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Rounds
                                                 <select value={partyRounds} onChange={e => setPartyRounds(e.target.value as '5' | '10' | 'custom')} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-[#0a0b14] px-3 text-xs font-bold normal-case tracking-normal text-white outline-none focus:border-fuchsia-300">
                                                     <option value="5">5 rounds</option>
                                                     <option value="10">10 rounds</option>
                                                     <option value="custom">Custom</option>
                                                 </select>
                                             </label>
                                             <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Seconds per round
                                                 <select value={partyRoundMs} onChange={e => setPartyRoundMs(Number(e.target.value))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-[#0a0b14] px-3 text-xs font-bold normal-case tracking-normal text-white outline-none focus:border-fuchsia-300">
                                                     <option value={15000}>15 seconds</option>
                                                     <option value={20000}>20 seconds</option>
                                                     <option value={30000}>30 seconds</option>
                                                     <option value={45000}>45 seconds</option>
                                                     <option value={60000}>60 seconds</option>
                                                 </select>
                                             </label>
                                             {partyRounds === 'custom' ? (
                                                 <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Custom rounds
                                                     <input type="number" min={1} max={50} value={partyCustomRounds} onChange={e => setPartyCustomRounds(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-[#0a0b14] px-3 text-xs font-bold normal-case tracking-normal text-white outline-none focus:border-fuchsia-300" />
                                                 </label>
                                             ) : (
                                                 <div className="flex items-end text-[10px] leading-relaxed text-gray-500">{partyGameType === 'mixed' ? 'Rotates Emoji → Quote → Character → Scramble.' : 'Every player sees the same clue at the same time.'}</div>
                                             )}
                                         </div>
                                         {partyGameError && <div role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-200"><i className="fa-solid fa-triangle-exclamation mr-1.5"></i>{partyGameError}</div>}
                                         {isStartingPartyGame && <div className="mt-3 flex items-center gap-2 rounded-xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-2 text-[11px] text-fuchsia-100" role="status"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-fuchsia-200 border-t-transparent"></span>Setting up the room game…</div>}
                                         <button type="button" onClick={handleStartPartyGame} disabled={isStartingPartyGame || currentRoom.users.length < 2 || !socket} className="mt-3 min-h-11 w-full rounded-xl bg-fuchsia-300 px-4 text-xs font-black text-[#1b0927] shadow-lg shadow-fuchsia-500/20 transition-colors hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40">{isStartingPartyGame ? 'Starting…' : 'Start party game'}</button>
                                     </div>
                                 )}

                                 {!partyGame && !isCreator && <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/15 px-3 py-6 text-center text-[11px] text-gray-400"><i className="fa-solid fa-hourglass-half mb-2 text-2xl text-fuchsia-300/50"></i><p>Waiting for the host to open the arcade.</p><p className="mt-1 text-gray-500">At least two players are required.</p></div>}
                                 {partyGame && (
                                     <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,.42fr)]">
                                         <div className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-3">
                                             <div className="flex flex-wrap items-center justify-between gap-2">
                                                 <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-fuchsia-100"><span>Round {partyGame.round}/{partyGame.maxRounds}</span>{activePartyMode && <span className="rounded-full bg-fuchsia-400/15 px-2 py-1 text-fuchsia-200">{activePartyMode.label}</span>}</div>
                                                 {partyGame.status === 'active' && <span className={`rounded-full px-2.5 py-1 text-xs font-black ${partyGameRemainingSeconds <= 5 ? 'bg-red-500/20 text-red-200' : 'bg-fuchsia-400/15 text-fuchsia-100'}`} role="timer" aria-label={`${partyGameRemainingSeconds} seconds remaining`}><i className="fa-solid fa-clock mr-1.5"></i>{partyGameRemainingSeconds}s</span>}
                                             </div>
                                             <div className="mt-3 overflow-hidden rounded-xl border border-fuchsia-300/15 bg-[radial-gradient(circle_at_50%_0%,rgba(217,70,239,.22),transparent_58%)] p-4 text-center">
                                                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200/70">{partyGame.prompt || 'Clue incoming'}</p>
                                                 <p className="mt-3 break-words text-2xl font-black leading-tight text-white sm:text-3xl">{partyGame.clue || '…'}</p>
                                                 {partyGame.imageUrl && <img src={partyGame.imageUrl} alt="Party game clue" loading="lazy" className={`mx-auto mt-3 max-h-36 max-w-full rounded-xl object-cover ${partyGame.status === 'active' && partyGame.roundType === 'character' ? 'blur-sm' : ''}`} onError={e => { e.currentTarget.style.display = 'none'; }} />}
                                                 {partyGame.category && <span className="mt-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold text-cyan-100">{partyGame.category}</span>}
                                             </div>
                                             {partyGame.status === 'active' ? (
                                                 partyGameSubmitted ? (
                                                     <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-3 text-xs font-black text-emerald-100" role="status"><i className="fa-solid fa-lock"></i><span>Answer locked · waiting for the reveal</span></div>
                                                 ) : (
                                                     <form onSubmit={handlePartyGameSubmit} className="mt-3 flex gap-2">
                                                         <label htmlFor="party-game-guess" className="sr-only">Your party game guess</label>
                                                         <input id="party-game-guess" value={partyGuessInput} onChange={e => setPartyGuessInput(e.target.value)} maxLength={80} placeholder="Type your guess…" autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white outline-none transition-colors focus:border-fuchsia-300" />
                                                         <button type="submit" disabled={!partyGuessInput.trim()} className="min-h-11 rounded-xl bg-fuchsia-300 px-4 text-xs font-black text-[#1b0927] transition-colors hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40">Lock guess</button>
                                                     </form>
                                                 )
                                             ) : (
                                                 <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-center text-xs font-black text-amber-100">{partyGame.status === 'finished' ? 'Final results' : 'Round revealed'}</div>
                                             )}
                                             {partyGameNotice && <p className="mt-2 text-[11px] font-bold text-amber-200" role="status">{partyGameNotice}</p>}
                                             {partyGame.revealed && partyGame.answer && <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-100">Answer: {partyGame.answer}</p>}
                                             <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500"><span><strong className="text-amber-200">5</strong> exact</span><span><strong className="text-cyan-200">3</strong> close</span><span><strong className="text-fuchsia-200">1</strong> initials</span><span><strong className="text-gray-300">0</strong> wrong</span></div>
                                         </div>
                                         <aside className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                             <div className="flex items-center justify-between gap-2"><h3 className="text-[10px] font-black uppercase tracking-wider text-fuchsia-100">Leaderboard</h3><span className="text-[9px] font-bold text-gray-500">{partyGame.status === 'finished' ? 'Final' : 'Live'}</span></div>
                                             <ol className="mt-3 space-y-2">{partyGameLeaderboard.map(([name, score], index) => <li key={name} className="flex items-center justify-between gap-2 text-xs text-gray-200"><span className="min-w-0 truncate"><span className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-black ${index === 0 ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-gray-400'}`}>{index + 1}</span>{name}</span><strong className="text-fuchsia-200">{score}</strong></li>)}</ol>
                                             {partyGameLeaderboard.length === 0 && <p className="mt-3 text-[11px] text-gray-500">Scores appear after guesses.</p>}
                                             {partyGame.status === 'finished' && <p className="mt-4 border-t border-white/10 pt-3 text-[11px] font-black text-emerald-200">The room has a winner.</p>}
                                         </aside>
                                     </div>
                                 )}
                              </section>
                             </div>
                              )}
                           </div>

                        {/* ROOM CHAT & PARTICIPANTS SIDEBAR */}
                         <div className="bg-[#121322] border border-white/10 rounded-3xl p-5 flex flex-col min-h-[420px] h-[min(580px,calc(100dvh-12rem))] lg:h-[580px] shadow-2xl">
                            {/* Header with Dual Tabs: Chat & Participants */}
                            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                                <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-2xl border border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setSidebarTab('chat')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            sidebarTab === 'chat' 
                                                ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20' 
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <i className="fa-solid fa-comments"></i>
                                        <span>Chat</span>
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${sidebarTab === 'chat' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                                            {chatMessages.length}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSidebarTab('participants')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            sidebarTab === 'participants' 
                                                ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20' 
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <i className="fa-solid fa-users"></i>
                                        <span>Users</span>
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${sidebarTab === 'participants' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                                            {currentRoom.users.length}
                                        </span>
                                    </button>
                                </div>
                                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live
                                </span>
                            </div>

                            {sidebarTab === 'chat' ? (
                                <>
                                    {/* Chat messages list */}
                                    <div className="flex-1 overflow-y-auto space-y-2.5 mb-3 pr-1">
                                        {chatMessages.length === 0 ? (
                                            <div className="text-center py-20 text-gray-500 text-xs">
                                                No messages yet. Send a message to the watch room!
                                            </div>
                                        ) : (
                                            chatMessages.map((msg, i) => {
                                                const isMe = msg.username === username;
                                                return (
                                                    <div key={msg.id || i} className={`p-2.5 rounded-xl border ${isMe ? 'bg-cyan-500/10 border-cyan-500/30 ml-4' : 'bg-white/5 border-white/5 mr-4'}`}>
                                                        <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                                                            <span className={isMe ? 'text-cyan-300' : 'text-purple-300'}>{msg.username} {isMe && '(You)'}</span>
                                                            <span className="text-gray-500 text-[9px]">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                        <div className="text-xs text-gray-200 leading-relaxed break-words">{msg.message}</div>
                                                    </div>
                                                );
                                            })
                                        )}
                                        <div ref={chatBottomRef} />
                                    </div>

                                    {/* Chat input box */}
                                    <form onSubmit={handleSendChat} className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={chatInput} 
                                            onChange={(e) => setChatInput(e.target.value)} 
                                            placeholder="Type message..." 
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-cyan-500 transition-colors"
                                        />
                                        <button type="submit" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs rounded-xl hover:scale-105 transition-transform cursor-pointer">
                                            Send
                                        </button>
                                    </form>
                                </>
                            ) : (
                                /* Participants Tab with Kick Mechanism */
                                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                    {isCreator && (
                                        <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-2.5 text-[11px] text-purple-200 flex items-center gap-2 mb-2">
                                            <i className="fa-solid fa-shield-halved text-purple-400 text-sm"></i>
                                            <span>You are the Host. You can remove any participant to disconnect and ban them from this session.</span>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {currentRoom.users.map((u) => {
                                            const isUserCreator = u.isCreator || u.name.toLowerCase() === currentRoom.creator.toLowerCase();
                                            const isMe = u.name === username;

                                            return (
                                                <div 
                                                    key={u.id || u.name} 
                                                    className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                                                            isUserCreator ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                                        }`}>
                                                            {u.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                                                <span>{u.name}</span>
                                                                {isMe && <span className="text-[10px] text-cyan-400 font-normal">(You)</span>}
                                                            </div>
                                                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                                {isUserCreator ? (
                                                                    <span className="text-[9px] font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.2 rounded-md flex items-center gap-1">
                                                                        <i className="fa-solid fa-crown text-[8px]"></i> Host
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-semibold text-gray-400 bg-white/5 px-1.5 py-0.2 rounded-md">
                                                                        Viewer
                                                                    </span>
                                                                )}
                                                                {u.buffering && (
                                                                    <span className="text-[9px] font-bold text-amber-200 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.2 rounded-md flex items-center gap-1" title="This participant is buffering">
                                                                        <i className="fa-solid fa-spinner fa-spin text-[8px]"></i> Buffering
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Kick button: visible to room creator for other participants */}
                                                    {isCreator && !isUserCreator && !isMe && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleKickUser(u.name)}
                                                            className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow-red-500/20"
                                                            title={`Remove ${u.name} from Watch Party`}
                                                        >
                                                            <i className="fa-solid fa-user-xmark"></i>
                                                            <span>Kick</span>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Barred / Kicked Users Session Log */}
                                    {currentRoom.kickedUsers && currentRoom.kickedUsers.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-white/10">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5 mb-2">
                                                <i className="fa-solid fa-ban"></i>
                                                <span>Barred from Session ({currentRoom.kickedUsers.length})</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {currentRoom.kickedUsers.map((kName, idx) => (
                                                    <span key={idx} className="text-[10px] bg-red-500/10 text-red-300 border border-red-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                                        <i className="fa-solid fa-user-slash text-[8px]"></i> {kName}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
