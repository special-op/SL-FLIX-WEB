export interface MovieResult {
  title: string;
  cover: string;
  thumbnail: string;
  type: string; 
  subjectId: string;
  imdbRating?: string;
  releaseDate?: string;
  genre?: string;
  description?: string;
  countryName?: string;
  detailPath?: string;
  hasResource?: boolean;
  cast?: CastMember[];
  recommendations?: MovieResult[];
  seasons?: Season[];
  trailerUrl?: string;
  sourceUrl?: string; 
  rawStartTime?: number; 
  dubs?: MovieDub[];
}
export interface MovieDub {
  subjectId: string;
  lanName: string;
  lanCode: string;
  detailPath: string;
  original: boolean;
}
export interface CastMember {
  name: string;
  character?: string;
  avatar: string;
  id?: string;
}
export interface Season {
  seasonNumber: number;
  episodeCount: number;
  episodes?: Episode[];
}
export interface Episode {
  episodeNumber: number;
  title?: string;
}
export interface SearchResponse {
  results: MovieResult[];
}
export interface Subtitle {
  id?: string;
  lang?: string;
  language?: string;
  languageCode?: string;
  name: string;
  url: string;
  proxyUrl?: string;
  label?: string;
  size?: string;
  delay?: number;
}
export interface VideoSource {
  id?: string;
  quality?: number; 
  size?: string;
  download?: string;
  direct?: string;
  stream?: string;
  label?: string; 
  title?: string;
  name?: string;
  videoUrl?: string;
  isM3u8?: boolean;
  type?: 'hls' | 'mp4' | 'dash';
}
export interface CategoryData {
  title: string;
  query: string;
  movies: MovieResult[];
  isLive?: boolean;
}
export interface LiveChannel {
  id: string;
  name: string;
  url: string;
  region: string;
  language: string;
  category: string;
  logo?: string;
}
export interface TvChannel {
  id: string;
  name: string;
  logo: string;
  category: string;
  url: string;
  stream_url?: string;
  thumbnail?: string;
  group?: string;
  epg_id?: string;
}
export interface TvGuideItem {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  category?: string;
  thumbnail?: string;
}
export interface LiveMatch {
  id: string;
  home_team: string;
  away_team: string;
  home_logo: string;
  away_logo: string;
  league: string;
  time: string;
  status: string;
  score?: string;
  urls: Array<{ name: string; url: string }>;
}
export interface IpcResult {
  id: number | string;
  type: 'movie' | 'tv';
  title: string;
  year?: string;
  description?: string;
  rating?: number;
  votes?: number;
  popularity?: number;
  imdb?: string;
  poster: string;
  backdrop?: string;
  url: string;
  embed: string;
  servers?: Array<{
    name: string;
    flag: string;
    url: string;
  }>;
}
export interface AnimeItem {
  title: string;
  link: string;
  image: string;
}

export interface AnimeDownloadServer {
  server: string;
  url: string;
  resolution?: string;
}

export interface AnimeDetail {
  title: string;
  synopsis?: string;
  video?: string;
  downloads: AnimeDownloadServer[];
  image?: string;
  link?: string;
}

export interface CaptionSettings {
  fontFamily: string;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontColor: string;
  bgColor: string;
  bgOpacity: number;
  textShadow: string;
  textOutline: boolean;
  fontWeight: string;
}

export interface WebtoonItem {
  titleNo: string;
  title: string;
  genre: string;
  type: string;
  thumbnail: string;
  url: string;
  rank?: number;
  authors?: string[];
  readCount?: number;
}
export interface WebtoonEpisode {
  episodeNo: number;
  title: string;
  date: string;
  thumbnail: string;
  url: string;
}
export interface WebtoonDetail {
  title: string;
  thumbnail: string;
  authors: string[];
  summary: string;
  ranking: string;
  tags: string[];
  titleNo: string;
  episodes: WebtoonEpisode[];
}
export interface WebtoonRead {
  url: string;
  title: string;
  images: Array<{
    url: string;
    width: number;
    height: number;
    sortOrder: number;
  }>;
}
export interface ImdbSuggestion {
  id: string;
  l: string;
  s?: string;
  y?: number;
  i?: { imageUrl: string; height: number; width: number };
  q?: string;
  v?: { id: string; l: string; s: string }[];
  rank?: number;
}