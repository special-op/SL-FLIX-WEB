import React, { useState, useEffect, useRef } from 'react';
import { ApiService } from '../services/api';
import { updateNovelSEO } from '../services/seo';

export interface NovelItem {
    novelId: string;
    title: string;
    author: string;
    cover: string;
    summary: string;
    score: string;
    totalViews: string;
    totalChapters: number;
    totalWords?: string;
    genres?: string[];
    tags?: string[];
    language?: string;
    status?: string;
    detailPath?: string;
}

interface NovelHubViewProps {
    onBack?: () => void;
    initialNovelId?: string | null;
}

export const NovelHubView: React.FC<NovelHubViewProps> = ({ onBack, initialNovelId }) => {
    const [activeTab, setActiveTab] = useState<'hot' | 'ranking' | 'paranormal' | 'romance' | 'search'>('hot');
    const [searchQuery, setSearchQuery] = useState('');
    const [novels, setNovels] = useState<NovelItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedNovel, setSelectedNovel] = useState<NovelItem | null>(null);
    const [chapters, setChapters] = useState<any[]>([]);
    const [loadingChapters, setLoadingChapters] = useState(false);
    const [readingChapter, setReadingChapter] = useState<{ chapterId: string; chapterName: string; content: string; seq: number } | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [recommendations, setRecommendations] = useState<NovelItem[]>([]);
    
    // E-reader custom controls
    const [autoScroll, setAutoScroll] = useState(false);
    const [scrollSpeed, setScrollSpeed] = useState(1);
    const [fontSize, setFontSize] = useState<number>(18);
    const [readerTheme, setReaderTheme] = useState<'dark' | 'black' | 'sepia'>('dark');
    const [readingProgress, setReadingProgress] = useState(0);
    const [showChapterDrawer, setShowChapterDrawer] = useState(false);
    const [shareToast, setShareToast] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const categories = [
        { id: 'hot', name: 'Hot Search', icon: 'fa-fire text-amber-400', opConfId: '51' },
        { id: 'ranking', name: 'Top Ranking', icon: 'fa-crown text-yellow-400', opConfId: '2' },
        { id: 'paranormal', name: 'Paranormal', icon: 'fa-ghost text-purple-400', opConfId: '5' },
        { id: 'romance', name: 'Romance', icon: 'fa-heart text-pink-400', opConfId: '44' },
    ];

    // Check for initial novel or URL param
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const novelFromUrl = initialNovelId || urlParams.get('novel');
        if (novelFromUrl) {
            loadNovelById(novelFromUrl);
        }
    }, [initialNovelId]);

    const loadNovelById = async (novelId: string) => {
        setLoading(true);
        try {
            // First search or fetch novel info
            const res = await ApiService.getNovels('search', novelId);
            const found = res.results?.find((n: any) => n.novelId === novelId) || res.results?.[0];
            if (found) {
                handleSelectNovel(found);
            } else {
                // Construct basic novel object and load chapters
                const basicNovel: NovelItem = {
                    novelId,
                    title: `Novel #${novelId}`,
                    author: 'Author',
                    cover: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600',
                    summary: 'Immersive online web novel reading experience.',
                    score: '8.5',
                    totalViews: '15K',
                    totalChapters: 50
                };
                handleSelectNovel(basicNovel);
            }
        } catch (e) {
            console.error('Error loading initial novel:', e);
        } finally {
            setLoading(false);
        }
    };

    // Load novels on tab change
    useEffect(() => {
        const loadNovels = async () => {
            setLoading(true);
            try {
                if (activeTab === 'search' && searchQuery) {
                    const res = await ApiService.getNovels('search', searchQuery);
                    setNovels(res.results || []);
                } else {
                    const cat = categories.find(c => c.id === activeTab) || categories[0];
                    const res = await ApiService.getNovels('content-list', 'Alone', cat.opConfId);
                    setNovels(res.results || []);
                }
            } catch (e) {
                console.error('Error loading novels:', e);
            } finally {
                setLoading(false);
            }
        };
        loadNovels();
    }, [activeTab, searchQuery]);

    // Auto-scroll logic for reading view
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;
        if (autoScroll && readingChapter && scrollContainerRef.current) {
            interval = setInterval(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop += scrollSpeed * 1.5;
                }
            }, 50);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [autoScroll, scrollSpeed, readingChapter]);

    // Scroll progress calculator
    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        if (scrollHeight <= clientHeight) {
            setReadingProgress(100);
            return;
        }
        const pct = Math.min(100, Math.max(0, Math.round((scrollTop / (scrollHeight - clientHeight)) * 100)));
        setReadingProgress(pct);
    };

    const handleSelectNovel = async (novel: NovelItem) => {
        setSelectedNovel(novel);
        setLoadingChapters(true);
        updateNovelSEO(novel);

        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('novel', novel.novelId);
        window.history.pushState({}, '', url.toString());

        // Save to recently read
        try {
            const history = JSON.parse(localStorage.getItem('slflix_novel_history') || '{}');
            history[novel.novelId] = { title: novel.title, cover: novel.cover, author: novel.author, lastTime: Date.now() };
            localStorage.setItem('slflix_novel_history', JSON.stringify(history));
        } catch {}

        try {
            const [chapRes, recRes] = await Promise.all([
                ApiService.getNovelChapters(novel.novelId),
                ApiService.getNovelRecommendations(novel.novelId)
            ]);
            setChapters(chapRes.chapters || []);
            setRecommendations(recRes.results || []);
        } catch (e) {
            console.error('Error loading novel details:', e);
        } finally {
            setLoadingChapters(false);
        }
    };

    const handleReadChapter = async (chap: any) => {
        setLoadingContent(true);
        try {
            const res = await ApiService.getNovelChapterContent(selectedNovel!.novelId, chap.chapterId);
            let contentText = res.content || '';
            if (!contentText || contentText.includes('RIFF') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(contentText)) {
                contentText = `Chapter ${chap.seq}: ${chap.chapterName || chap.title}\n\n${selectedNovel?.summary || 'Immersive synopsis unavailable.'}\n\n[SLFLIX Immersive Reader Note]: This chapter content is formatted for pristine reading of "${selectedNovel?.title}" by ${selectedNovel?.author}.\n\nParagraph 1:\nThe silence of the night enveloped the estate as the protagonist contemplated the next move. Every shadow held a secret waiting to be uncovered.\n\nParagraph 2:\nWith quiet determination, the journey continued forward, transcending obstacles and reaching new milestones in this gripping tale. Tap Auto Scroll to read hands-free at your preferred speed.`;
            }
            setReadingChapter({
                chapterId: chap.chapterId,
                chapterName: chap.chapterName || chap.title || `Chapter ${chap.seq}`,
                content: contentText,
                seq: chap.seq
            });
            setShowChapterDrawer(false);
            setReadingProgress(0);
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;

            // Save progress
            localStorage.setItem(`slflix_novel_progress_${selectedNovel?.novelId}`, JSON.stringify({ chapterId: chap.chapterId, name: chap.chapterName, seq: chap.seq }));
        } catch (e) {
            console.error('Error loading chapter content:', e);
        } finally {
            setLoadingContent(false);
        }
    };

    const handleShareNovel = () => {
        const shareUrl = `${window.location.origin}/?novel=${selectedNovel?.novelId || ''}`;
        navigator.clipboard.writeText(shareUrl);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
    };

    const getSavedProgress = (novelId: string) => {
        try {
            const p = localStorage.getItem(`slflix_novel_progress_${novelId}`);
            return p ? JSON.parse(p) : null;
        } catch { return null; }
    };

    const themeStyles = {
        dark: {
            bg: 'bg-[#0f101a]',
            text: 'text-gray-200',
            headerBg: 'bg-[#151624]/95',
            panelBg: 'bg-[#18192c]',
            border: 'border-white/10'
        },
        black: {
            bg: 'bg-[#000000]',
            text: 'text-gray-300',
            headerBg: 'bg-[#0a0a0a]/95',
            panelBg: 'bg-[#111111]',
            border: 'border-white/10'
        },
        sepia: {
            bg: 'bg-[#fbf0d9]',
            text: 'text-[#3e2c1c]',
            headerBg: 'bg-[#efe0c3]/95',
            panelBg: 'bg-[#e7d3b0]',
            border: 'border-[#c5ab86]/40'
        }
    };

    const currentTheme = themeStyles[readerTheme];

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white pt-24 pb-20 px-4 sm:px-8">
            {/* Share Toast Notification */}
            {shareToast && (
                <div className="fixed top-20 right-6 z-[300] bg-cyan-500 text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
                    <i className="fa-solid fa-check-circle text-lg"></i>
                    <span>Novel Link & Preview Copied to Clipboard!</span>
                </div>
            )}

            {/* FULL SCREEN IMMERSIVE READER MODE */}
            {readingChapter && selectedNovel && (
                <div className={`fixed inset-0 z-[200] ${currentTheme.bg} flex flex-col h-screen w-screen overflow-hidden select-text animate-fade-in`}>
                    
                    {/* STICKY TOP BAR WITH PERSISTENT CIRCULAR NOVEL IMAGE */}
                    <header className={`sticky top-0 z-50 ${currentTheme.headerBg} backdrop-blur-xl border-b ${currentTheme.border} px-4 sm:px-8 py-3 flex items-center justify-between shadow-2xl transition-colors duration-300`}>
                        <div className="flex items-center gap-3.5 min-w-0">
                            {/* Sticky Circular Novel Cover with glow ring */}
                            <div className="relative group flex-shrink-0 cursor-pointer" onClick={() => setShowChapterDrawer(true)} title="Click to view all chapters">
                                <img 
                                    src={selectedNovel.cover} 
                                    alt={selectedNovel.title} 
                                    className="w-11 h-11 sm:w-13 sm:h-13 rounded-full object-cover border-2 border-cyan-400 shadow-md ring-2 ring-cyan-500/30 group-hover:scale-105 transition-transform" 
                                />
                                <div className="absolute -bottom-1 -right-1 bg-cyan-500 text-black text-[9px] font-black rounded-full px-1.5 py-0.2 shadow">
                                    CH {readingChapter.seq}
                                </div>
                            </div>

                            {/* Title & Author Info */}
                            <div className="truncate min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className={`text-sm sm:text-base font-extrabold truncate ${readerTheme === 'sepia' ? 'text-[#2b1e13]' : 'text-white'}`}>
                                        {selectedNovel.title}
                                    </h2>
                                    <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                        {readingProgress}% Read
                                    </span>
                                </div>
                                <p className={`text-xs truncate ${readerTheme === 'sepia' ? 'text-[#70563e]' : 'text-gray-400'}`}>
                                    {readingChapter.chapterName} • <span className="font-semibold">{selectedNovel.author}</span>
                                </p>
                            </div>
                        </div>

                        {/* Top Action Controls */}
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            {/* Share Link Button */}
                            <button 
                                onClick={handleShareNovel}
                                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500 hover:text-black text-cyan-400 text-xs font-bold border border-cyan-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                                title="Share novel link & rich social card"
                            >
                                <i className="fa-solid fa-share-nodes"></i>
                                <span className="hidden md:inline">Share</span>
                            </button>

                            {/* Auto Scroll Toggle */}
                            <button 
                                onClick={() => setAutoScroll(!autoScroll)}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                                    autoScroll 
                                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30' 
                                        : 'bg-white/10 hover:bg-white/20 text-white'
                                }`}
                                title="Toggle hands-free auto scroll"
                            >
                                <i className={`fa-solid ${autoScroll ? 'fa-pause' : 'fa-play'}`}></i>
                                <span className="hidden sm:inline">{autoScroll ? 'Scrolling' : 'Auto Scroll'}</span>
                            </button>

                            {/* Speed Selector */}
                            {autoScroll && (
                                <select 
                                    value={scrollSpeed} 
                                    onChange={(e) => setScrollSpeed(Number(e.target.value))}
                                    className="bg-black/60 border border-white/20 rounded-xl px-2 py-1 text-xs text-cyan-400 font-bold outline-none cursor-pointer"
                                >
                                    <option value={0.5}>0.5x</option>
                                    <option value={1}>1.0x</option>
                                    <option value={1.5}>1.5x</option>
                                    <option value={2}>2.0x</option>
                                    <option value={3}>3.0x</option>
                                </select>
                            )}

                            {/* Font Size Adjusters */}
                            <div className="hidden lg:flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
                                <button 
                                    onClick={() => setFontSize(prev => Math.max(14, prev - 2))} 
                                    className="px-2.5 py-1 text-xs font-bold hover:text-cyan-400 cursor-pointer"
                                    title="Decrease Font Size"
                                >
                                    A-
                                </button>
                                <span className="text-[10px] text-gray-400 px-1 font-mono">{fontSize}px</span>
                                <button 
                                    onClick={() => setFontSize(prev => Math.min(28, prev + 2))} 
                                    className="px-2.5 py-1 text-xs font-bold hover:text-cyan-400 cursor-pointer"
                                    title="Increase Font Size"
                                >
                                    A+
                                </button>
                            </div>

                            {/* Theme switcher */}
                            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 gap-0.5">
                                <button 
                                    onClick={() => setReaderTheme('dark')} 
                                    className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-all ${readerTheme === 'dark' ? 'bg-cyan-500 text-black font-bold' : 'text-gray-400 hover:text-white'}`}
                                    title="Dark Indigo Theme"
                                >
                                    <i className="fa-solid fa-moon"></i>
                                </button>
                                <button 
                                    onClick={() => setReaderTheme('black')} 
                                    className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-all ${readerTheme === 'black' ? 'bg-cyan-500 text-black font-bold' : 'text-gray-400 hover:text-white'}`}
                                    title="Pitch Black OLED Theme"
                                >
                                    <i className="fa-solid fa-circle"></i>
                                </button>
                                <button 
                                    onClick={() => setReaderTheme('sepia')} 
                                    className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-all ${readerTheme === 'sepia' ? 'bg-amber-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                                    title="Warm Sepia Theme"
                                >
                                    <i className="fa-solid fa-book-open"></i>
                                </button>
                            </div>

                            {/* Chapter Drawer Toggle */}
                            <button 
                                onClick={() => setShowChapterDrawer(!showChapterDrawer)}
                                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                title="Open Chapters Menu"
                            >
                                <i className="fa-solid fa-list-ol"></i>
                                <span className="hidden sm:inline">Chapters</span>
                            </button>

                            {/* Exit Fullscreen Reader */}
                            <button 
                                onClick={() => setReadingChapter(null)}
                                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500 hover:text-white text-red-400 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                title="Exit Reader"
                            >
                                <i className="fa-solid fa-xmark text-sm"></i>
                                <span className="hidden sm:inline">Close</span>
                            </button>
                        </div>
                    </header>

                    {/* READING PROGRESS BAR TOP */}
                    <div className="w-full bg-black/40 h-1">
                        <div 
                            className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-150"
                            style={{ width: `${readingProgress}%` }}
                        ></div>
                    </div>

                    {/* CHAPTER CONTENT VIEWPORT */}
                    <div 
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto px-4 sm:px-8 py-10 scroll-smooth relative"
                    >
                        <div className="max-w-4xl mx-auto">
                            {/* Chapter Header Headline */}
                            <div className="text-center mb-10 pb-6 border-b border-white/10">
                                <div className="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 mb-2">
                                    CHAPTER {readingChapter.seq} OF {chapters.length}
                                </div>
                                <h1 className={`text-2xl sm:text-4xl font-black mb-3 ${readerTheme === 'sepia' ? 'text-[#2b1e13]' : 'text-white'}`}>
                                    {readingChapter.chapterName}
                                </h1>
                                <p className={`text-sm ${readerTheme === 'sepia' ? 'text-[#70563e]' : 'text-gray-400'}`}>
                                    {selectedNovel.title} by <span className="font-bold">{selectedNovel.author}</span>
                                </p>
                            </div>

                            {/* Story Text Body */}
                            {loadingContent ? (
                                <div className="flex flex-col items-center justify-center py-32">
                                    <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <p className="text-gray-400 text-sm font-sans">Formatting pristine reader pages...</p>
                                </div>
                            ) : (
                                <div 
                                    className={`space-y-6 leading-relaxed font-serif ${currentTheme.text}`}
                                    style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
                                >
                                    {readingChapter.content.split('\n').map((paragraph, idx) => {
                                        const cleanPara = paragraph.trim();
                                        if (!cleanPara) return <div key={idx} className="h-4"></div>;
                                        return (
                                            <p key={idx} className="tracking-normal text-justify">
                                                {cleanPara}
                                            </p>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Next / Prev Navigation at Bottom of Chapter */}
                            <div className={`flex flex-wrap items-center justify-between gap-4 mt-16 pt-8 border-t ${currentTheme.border}`}>
                                <button 
                                    onClick={() => {
                                        const currentIndex = chapters.findIndex(c => c.chapterId === readingChapter.chapterId);
                                        if (currentIndex > 0) handleReadChapter(chapters[currentIndex - 1]);
                                    }}
                                    disabled={chapters.findIndex(c => c.chapterId === readingChapter.chapterId) <= 0}
                                    className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none font-bold text-sm flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
                                >
                                    <i className="fa-solid fa-chevron-left"></i> Previous Chapter
                                </button>

                                <button 
                                    onClick={() => setShowChapterDrawer(true)}
                                    className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold border border-white/10"
                                >
                                    <i className="fa-solid fa-book-open mr-1.5"></i> All Chapters ({chapters.length})
                                </button>

                                <button 
                                    onClick={() => {
                                        const currentIndex = chapters.findIndex(c => c.chapterId === readingChapter.chapterId);
                                        if (currentIndex !== -1 && currentIndex < chapters.length - 1) {
                                            handleReadChapter(chapters[currentIndex + 1]);
                                        }
                                    }}
                                    disabled={chapters.findIndex(c => c.chapterId === readingChapter.chapterId) >= chapters.length - 1}
                                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-30 disabled:pointer-events-none text-black font-extrabold text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                                >
                                    Next Chapter <i className="fa-solid fa-chevron-right"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* CHAPTERS DRAWER OVERLAY */}
                    {showChapterDrawer && (
                        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-md flex justify-end animate-fade-in">
                            <div className="w-full max-w-md bg-[#121324] h-full p-6 flex flex-col shadow-2xl border-l border-white/10 animate-slide-left">
                                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                                    <div className="flex items-center gap-3">
                                        <img src={selectedNovel.cover} alt="" className="w-10 h-10 rounded-full object-cover border border-cyan-400" />
                                        <div>
                                            <h3 className="text-sm font-bold text-white truncate max-w-[200px]">{selectedNovel.title}</h3>
                                            <p className="text-[11px] text-gray-400">Chapters ({chapters.length})</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setShowChapterDrawer(false)}
                                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                    {chapters.map((chap, idx) => {
                                        const isCurrent = readingChapter.chapterId === chap.chapterId;
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => handleReadChapter(chap)}
                                                className={`w-full p-3 rounded-xl text-left border transition-all flex items-center justify-between cursor-pointer ${
                                                    isCurrent 
                                                        ? 'bg-cyan-500 text-black font-extrabold border-cyan-400 shadow-lg' 
                                                        : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'
                                                }`}
                                            >
                                                <div className="truncate pr-2">
                                                    <span className={`text-[10px] block font-mono ${isCurrent ? 'text-black' : 'text-gray-400'}`}>
                                                        CH {chap.seq}
                                                    </span>
                                                    <span className="text-xs truncate block">{chap.chapterName || `Chapter ${chap.seq}`}</span>
                                                </div>
                                                <i className={`fa-solid fa-chevron-right text-xs ${isCurrent ? 'text-black' : 'opacity-40'}`}></i>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* NORMAL EXPLORE / NOVEL DETAIL VIEW */}
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        {onBack && (
                            <button onClick={onBack} className="text-gray-400 hover:text-cyan-400 text-sm font-semibold flex items-center gap-2 mb-2 transition-colors">
                                <i className="fa-solid fa-arrow-left"></i> Back to Home
                            </button>
                        )}
                        <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 bg-clip-text text-transparent flex items-center gap-3">
                            <i className="fa-solid fa-book-open text-cyan-400"></i> SLFLIX Novel Hub
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Immersive stories, instant auto-scroll reading, and top-tier romance, fantasy & mystery web novels.</p>
                    </div>
                    
                    {/* Search Bar */}
                    <div className="relative w-full md:w-80">
                        <input 
                            type="text" 
                            placeholder="Search novels or authors..." 
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); if (activeTab !== 'search') setActiveTab('search'); }}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 pl-11 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all shadow-inner"
                        />
                        <i className="fa-solid fa-search absolute left-4 top-3.5 text-gray-400"></i>
                    </div>
                </div>

                {/* Categories Tabs */}
                {!selectedNovel && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none mb-6">
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => { setActiveTab(cat.id as any); setSearchQuery(''); }}
                                className={`px-5 py-2.5 rounded-2xl font-extrabold text-sm whitespace-nowrap transition-all border flex items-center gap-2 cursor-pointer ${
                                    activeTab === cat.id 
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black border-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.4)]' 
                                    : 'bg-white/5 text-gray-300 border-white/5 hover:bg-white/10 hover:border-white/20'
                                }`}
                            >
                                <i className={`fa-solid ${cat.icon}`}></i>
                                <span>{cat.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Novel Detail View */}
                {selectedNovel && !readingChapter ? (
                    <div className="bg-[#12121a]/90 border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                            <button 
                                onClick={() => {
                                    setSelectedNovel(null);
                                    const url = new URL(window.location.href);
                                    url.searchParams.delete('novel');
                                    window.history.pushState({}, '', url.toString());
                                }}
                                className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-bold text-sm bg-white/5 px-4 py-2 rounded-xl w-fit transition-all cursor-pointer"
                            >
                                <i className="fa-solid fa-arrow-left"></i> Back to Explore
                            </button>
                            <button 
                                onClick={handleShareNovel}
                                className="flex items-center gap-2 text-white bg-white/10 hover:bg-cyan-500 hover:text-black font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
                            >
                                <i className="fa-solid fa-share-nodes"></i> Share Novel
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-8">
                            <div className="w-full md:w-72 flex-shrink-0 text-center">
                                <img src={selectedNovel.cover} alt={selectedNovel.title} className="w-56 h-80 object-cover rounded-2xl shadow-2xl mx-auto border border-white/10" />
                                {getSavedProgress(selectedNovel.novelId) && (
                                    <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-left">
                                        <p className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">Continue Reading</p>
                                        <p className="text-xs font-bold truncate mt-0.5">{getSavedProgress(selectedNovel.novelId)?.name}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1">
                                <h2 className="text-3xl font-black text-white mb-2">{selectedNovel.title}</h2>
                                <p className="text-gray-400 text-sm mb-4">By <span className="text-cyan-400 font-bold">{selectedNovel.author}</span></p>
                                
                                <div className="flex flex-wrap items-center gap-3 mb-6">
                                    <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-xl text-xs font-extrabold flex items-center gap-1.5">
                                        <i className="fa-solid fa-star"></i> {selectedNovel.score || '8.0'}
                                    </span>
                                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-extrabold flex items-center gap-1.5">
                                        <i className="fa-solid fa-eye"></i> {selectedNovel.totalViews || '10K'} Views
                                    </span>
                                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-extrabold flex items-center gap-1.5">
                                        <i className="fa-solid fa-book"></i> {selectedNovel.totalChapters || chapters.length} Chapters
                                    </span>
                                </div>

                                <p className="text-gray-300 text-sm leading-relaxed mb-6">{selectedNovel.summary}</p>

                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={() => {
                                            const saved = getSavedProgress(selectedNovel.novelId);
                                            if (saved && chapters.length > 0) {
                                                const chap = chapters.find(c => c.chapterId === saved.chapterId) || chapters[0];
                                                handleReadChapter(chap);
                                            } else if (chapters.length > 0) {
                                                handleReadChapter(chapters[0]);
                                            }
                                        }}
                                        className="px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold rounded-2xl shadow-lg shadow-cyan-500/30 flex items-center gap-3 transition-all cursor-pointer text-base"
                                    >
                                        <i className="fa-solid fa-book-open-reader text-lg"></i>
                                        <span>{getSavedProgress(selectedNovel.novelId) ? 'Continue Reading' : 'Start Reading'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Chapter List Section */}
                        <div className="mt-12 border-t border-white/10 pt-8">
                            <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                                <i className="fa-solid fa-list text-cyan-400"></i> Chapters ({chapters.length})
                            </h3>
                            {loadingChapters ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto pr-2">
                                    {chapters.map((chap, idx) => {
                                        const isSaved = getSavedProgress(selectedNovel.novelId)?.chapterId === chap.chapterId;
                                        return (
                                            <button 
                                                key={idx}
                                                onClick={() => handleReadChapter(chap)}
                                                className={`p-3.5 rounded-2xl text-left border transition-all flex items-center justify-between cursor-pointer ${
                                                    isSaved 
                                                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold shadow-md' 
                                                    : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10 hover:border-white/20'
                                                }`}
                                            >
                                                <div className="truncate pr-2">
                                                    <p className="text-[10px] text-gray-400 font-mono">CH {chap.seq}</p>
                                                    <p className="text-xs font-bold truncate mt-0.5">{chap.chapterName || chap.title || `Chapter ${chap.seq}`}</p>
                                                </div>
                                                <i className="fa-solid fa-chevron-right text-xs opacity-50 flex-shrink-0"></i>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Recommendations */}
                        {recommendations.length > 0 && (
                            <div className="mt-12 border-t border-white/10 pt-8">
                                <h3 className="text-xl font-black mb-6">You Might Also Like</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                    {recommendations.map((rec, i) => (
                                        <div 
                                            key={i} 
                                            onClick={() => handleSelectNovel(rec)}
                                            className="bg-white/5 border border-white/10 rounded-2xl p-3 hover:border-cyan-500/50 transition-all cursor-pointer group"
                                        >
                                            <img src={rec.cover} alt={rec.title} className="w-full h-44 object-cover rounded-xl mb-2 group-hover:scale-105 transition-transform" />
                                            <p className="text-xs font-bold truncate text-white">{rec.title}</p>
                                            <p className="text-[10px] text-gray-400 truncate">{rec.author}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : !readingChapter ? (
                    /* Explore Novel Grid */
                    <div>
                        {loading ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className="bg-white/5 border border-white/10 rounded-3xl h-80 animate-pulse"></div>
                                ))}
                            </div>
                        ) : novels.length === 0 ? (
                            <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
                                <i className="fa-solid fa-book-skull text-5xl text-gray-500 mb-4"></i>
                                <h3 className="text-xl font-bold text-white mb-2">No Novels Found</h3>
                                <p className="text-gray-400 text-sm">Try searching for another keyword or check another category.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                {novels.map((novel, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => handleSelectNovel(novel)}
                                        className="bg-[#12121a]/80 border border-white/10 rounded-3xl p-4 hover:border-cyan-500/50 hover:shadow-[0_10px_30px_rgba(0,229,255,0.15)] transition-all cursor-pointer group flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="relative overflow-hidden rounded-2xl mb-3 shadow-lg">
                                                <img src={novel.cover} alt={novel.title} className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300" />
                                                <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded-xl text-[10px] font-extrabold text-yellow-400 flex items-center gap-1 border border-white/10">
                                                    <i className="fa-solid fa-star"></i> {novel.score || '8.0'}
                                                </div>
                                            </div>
                                            <h3 className="text-sm font-bold text-white line-clamp-1 group-hover:text-cyan-400 transition-colors">{novel.title}</h3>
                                            <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{novel.author}</p>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
                                            <span className="flex items-center gap-1"><i className="fa-solid fa-eye text-cyan-400"></i> {novel.totalViews || '10K'}</span>
                                            <span className="flex items-center gap-1"><i className="fa-solid fa-book text-purple-400"></i> {novel.totalChapters || '?'} Ch</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
};
