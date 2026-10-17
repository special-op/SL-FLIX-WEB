import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io as socketIoClient } from 'socket.io-client';
import { ApiService } from '../services/api';
import { MovieResult, VideoSource, Subtitle, Season } from '../types';
import VideoPlayer from './VideoPlayer';
import { getOptimizedImageUrl } from '../utils/image';

type RoomEntryMode = 'manual' | 'auto';

const getEntryModeLabel = (entryMode: RoomEntryMode = 'manual') => (
    entryMode === 'auto' ? 'Auto-Enter' : 'Manual Approval'
);
const WATCH_PARTY_FALLBACK = '/icons/slflix.png';
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
    users: { id: string; name: string; isCreator: boolean }[];
    currentTime: number;
    paused: boolean;
    entryMode: RoomEntryMode;
    hostToken?: string;
    waitExpiresAt?: number | null;
    messages?: { id?: string; username: string; message: string; timestamp: number }[];
    kickedUsers?: string[];
    pendingRequests?: { requestId: string; username: string; requestedAt: number }[];
}

export const WatchPartyView: React.FC<{
    onBack: () => void;
    onSelectMovieToWatch?: (movie: MovieResult) => void;
}> = ({ onBack }) => {
    const [socket, setSocket] = useState<any>(null);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [activeRooms, setActiveRooms] = useState<WatchRoom[]>([]);
    const [currentRoom, setCurrentRoom] = useState<WatchRoom | null>(null);
    const [username, setUsername] = useState<string>(() => localStorage.getItem('slflix_username') || `Viewer_${Math.floor(Math.random() * 10000)}`);
    const [roomNameInput, setRoomNameInput] = useState('');
    const [createEntryMode, setCreateEntryMode] = useState<RoomEntryMode>('manual');
    const [chatMessages, setChatMessages] = useState<{ id?: string; username: string; message: string; timestamp: number }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants'>('chat');
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
    const [joinRequestState, setJoinRequestState] = useState<'idle' | 'pending' | 'denied'>('idle');
    const [joinRequests, setJoinRequests] = useState<{ requestId: string; username: string; requestedAt: number }[]>([]);
    const [roomSyncTimestamp, setRoomSyncTimestamp] = useState<number>(Date.now());
    const chatBottomRef = useRef<HTMLDivElement>(null);
    
    // Stable refs to prevent stale closure in socket listeners
    const currentRoomRef = useRef<WatchRoom | null>(null);
    const usernameRef = useRef<string>(username);

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
            setWaitExpiresAt(room.waitExpiresAt ?? null);
            setCurrentRoom(room);
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
        });

        s.on('disconnect', () => setIsReconnecting(true));
        s.on('connect_error', () => setIsReconnecting(true));

        s.on('room_request_pending', () => setJoinRequestState('pending'));
        s.on('room_request_denied', (data: { message?: string }) => {
            setJoinRequestState('denied');
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

        // User kicked from room by creator
        s.on('room_kicked', (data: { roomId: string; message: string }) => {
            alert(data.message || 'You were removed from this Watch Party session and cannot rejoin.');
            setCurrentRoom(null);
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
                setSelectedMovie(null);
                setSources([]);
                setSubtitles([]);
                setChatMessages([]);
                setPauseNotice(null);
                window.history.pushState({}, '', '/watch-party');
                s.emit('get_active_rooms');
            }, 1200);
        });

        s.on('error_message', (data: { message: string }) => {
            setPauseNotice(data.message || 'Error occurred');
            setTimeout(() => setPauseNotice(null), 3500);
        });

        s.on('room_sync', (data: { action: string; currentTime: number; paused: boolean; movie: any; season?: number; episode?: number; username: string }) => {
            setCurrentRoom(prev => prev ? { 
                ...prev, 
                currentTime: data.currentTime !== undefined ? data.currentTime : prev.currentTime, 
                paused: data.paused !== undefined ? data.paused : prev.paused, 
                movie: data.movie || prev.movie,
                currentSeason: data.season || prev.currentSeason,
                currentEpisode: data.episode || prev.currentEpisode
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
                const cleanParam = roomParam.trim().toUpperCase();
                s.emit('join_room', {
                    roomId: cleanParam,
                    username: storedName,
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
            setSearchResults(res.results || []);
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
        if (!roomNameInput.trim() || !socket) return;
        localStorage.setItem('slflix_username', username);
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        socket.emit('create_room', {
            roomId,
            roomName: roomNameInput.trim(),
            username,
            entryMode: createEntryMode,
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
            setSearchResults(result.results || []);
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
        const cleanId = String(roomId || '').trim().toUpperCase();
        localStorage.setItem('slflix_username', username);
        socket.emit('join_room', { roomId: cleanId, username });
        window.history.pushState({}, '', `/watch-party?room=${cleanId}`);
    };

    const handleRequestRoom = (roomId: string) => {
        if (!socket) return;
        const cleanId = String(roomId || '').trim().toUpperCase();
        localStorage.setItem('slflix_username', username);
        setJoinRequestState('pending');
        socket.emit('join_room', { roomId: cleanId, username, request: true });
        window.history.pushState({}, '', `/watch-party?room=${cleanId}&request=1`);
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
        setSelectedMovie(null);
        setSources([]);
        setSubtitles([]);
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
            setSelectedMovie(null);
            setSources([]);
            setSubtitles([]);
            setChatMessages([]);
            window.history.pushState({}, '', '/watch-party');
            localStorage.removeItem(`slflix_host_token_${rId}`);
        }
        socket.emit('get_active_rooms');
    };

    const handleSendChat = (e: React.FormEvent) => {
        e.preventDefault();
        const text = chatInput.trim();
        if (!text || !currentRoom || !socket) return;

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

        socket.emit('room_chat', { roomId: currentRoom.roomId, username, message: text });
        setChatInput('');
    };

    const formatSeconds = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

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
                                 <span>Reconnecting…</span>
                             </div>
                         )}
                     </div>
                 </div>

                 {joinRequestState !== 'idle' && !currentRoom && (
                     <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm flex items-center gap-3 ${joinRequestState === 'denied' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'}`} role="status" aria-live="polite">
                         <i className={`fa-solid ${joinRequestState === 'pending' ? 'fa-hourglass-half' : 'fa-circle-exclamation'}`}></i>
                         <span>{joinRequestState === 'pending' ? 'Join request sent. Keep this page open while the host approves you.' : 'Your request was not approved. You can try another room.'}</span>
                     </div>
                 )}

                {/* ROOM NOT JOINED YET: CREATE OR JOIN ACTIVE ROOM */}
                {!currentRoom ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Room Creation Card */}
                        <div className="bg-[#121322] border border-white/10 rounded-3xl p-6 shadow-2xl">
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-cyan-400">
                                <i className="fa-solid fa-circle-plus"></i> Create Watch Party Room
                            </h2>
                            <form onSubmit={handleCreateRoom} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Your Display Name</label>
                                    <input 
                                        type="text" 
                                        value={username} 
                                        onChange={(e) => setUsername(e.target.value)} 
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-white text-xs outline-none focus:border-cyan-500 font-bold"
                                        placeholder="Enter your nickname"
                                        required 
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Room Name</label>
                                    <input 
                                        type="text" 
                                        value={roomNameInput} 
                                        onChange={(e) => setRoomNameInput(e.target.value)} 
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-white text-xs outline-none focus:border-cyan-500"
                                        placeholder="e.g. Cinema Night with Friends"
                                        required 
                                    />
                                </div>
                                <div>
                                    <label htmlFor="watch-party-entry-mode" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Guest Entry Mode</label>
                                        <select
                                            id="watch-party-entry-mode"
                                            value={createEntryMode}
                                            onChange={(e) => setCreateEntryMode(e.target.value as RoomEntryMode)}
                                            className="w-full min-h-11 bg-[#0a0b14] border border-white/10 rounded-xl py-2 px-3 text-white text-xs outline-none focus:border-cyan-500"
                                    >
                                        <option value="manual">Manual Approval</option>
                                        <option value="auto">Auto-Enter</option>
                                    </select>
                                </div>

                                {/* Main Search Engine Picker */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                                        <span>Pick Movie or Series</span>
                                        <span className="text-cyan-400 font-normal">Main Search Engine</span>
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

                                <button type="submit" className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer">
                                    Launch Watch Room
                                </button>
                            </form>
                        </div>

                        {/* Active Rooms Listing */}
                        <div className="lg:col-span-2 bg-[#121322] border border-white/10 rounded-3xl p-6 shadow-2xl">
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
                                                    <span className="bg-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                                                        ROOM #{room.roomId}
                                                    </span>
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
                                                    className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                                                >
                                                     <i className={`fa-solid ${room.entryMode === 'auto' ? 'fa-right-to-bracket' : 'fa-paper-plane'}`}></i> {room.entryMode === 'auto' ? 'Join Now' : 'Request to Join'}
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
                        </div>
                    </div>
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
                            <div className="bg-[#121322] border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                                <div>
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
                                </div>
                                <div className="flex items-center flex-wrap gap-2">
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
                                                            <div className="flex items-center gap-1 mt-0.5">
                                                                {isUserCreator ? (
                                                                    <span className="text-[9px] font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.2 rounded-md flex items-center gap-1">
                                                                        <i className="fa-solid fa-crown text-[8px]"></i> Host
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-semibold text-gray-400 bg-white/5 px-1.5 py-0.2 rounded-md">
                                                                        Viewer
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
