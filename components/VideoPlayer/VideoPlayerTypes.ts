import { VideoSource, Subtitle, MovieResult } from '../../types';

export interface ChapterMarker {
  title: string;
  startTime: number;
  endTime: number;
  type: 'intro' | 'recap' | 'credits' | 'chapter';
}

export interface WatchPartyProps {
  isHost: boolean;
  viewersCount: number;
  viewersList: Array<{ id: string; name: string; isCreator?: boolean }>;
  inStreamChat?: { username: string; message: string } | null;
  pauseNotice?: string | null;
  onHostAction?: (action: 'play' | 'pause' | 'seek', time: number) => void;
  syncTime?: number;
  syncPaused?: boolean;
  syncTimestamp?: number;
  onOpenChatDrawer?: () => void;
}

export interface VideoPlayerProps {
  title: string;
  subTitle?: string;
  sources: VideoSource[];
  subtitles?: Subtitle[];
  onClose: () => void;
  minimized?: boolean;
  overlay?: boolean;
  embedded?: boolean;
  watchPartyProps?: WatchPartyProps;
  onToggleMinimize?: () => void;
  subjectId?: string;
  initialTime?: number;
  onProgressUpdate?: (time: number, duration: number) => void;
  nextEpisode?: { season: number; episode: number; title?: string; };
  onPlayNext?: () => void;
  isTrailer?: boolean;
  isLive?: boolean;
  startTime?: number;
  movie?: MovieResult;
  currentSeason?: number;
  currentEpisode?: number;
  onSeasonChange?: (season: number) => void;
  onEpisodeChange?: (season: number, episode: number) => void;
  movieId?: string;
  seasonNumber?: number;
}
