export type SponsorBlockMode = 'off' | 'mark' | 'remove';

export type SponsorBlockCategory =
  | 'sponsor'
  | 'intro'
  | 'outro'
  | 'selfpromo'
  | 'preview'
  | 'filler'
  | 'interaction'
  | 'music_offtopic';

export type DownloadKind =
  | { kind: 'video'; maxHeight: number; preferHdr: boolean; fps60: boolean }
  | { kind: 'audio'; format: 'mp3' | 'm4a' | 'opus'; bitrateKbps: number };

export interface DownloadOptions {
  id: string;
  url: string;
  outputDir: string;
  selection: DownloadKind;
  embedSubtitles: boolean;
  subtitleLangs: string[];
  embedThumbnail: boolean;
  embedChapters: boolean;
  sponsorBlock: {
    mode: SponsorBlockMode;
    categories: SponsorBlockCategory[];
  };
  playlist: boolean;
  maxItems: number | null;
}

export type CollectionKind = 'video' | 'playlist' | 'channel';

export interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number;
  thumbnail: string;
  uploadDate: string | null;
  isLive: boolean;
  isPlaylist: boolean;
  playlistCount: number | null;
  collectionKind: CollectionKind;
  formats: ResolvedFormatSummary;
}

export interface ResolvedFormatSummary {
  maxHeight: number;
  hasHdr: boolean;
  has60fps: boolean;
  availableHeights: number[];
  hasAudio: boolean;
}

export type DownloadEvent =
  | { id: string; type: 'queued' }
  | { id: string; type: 'started' }
  | {
      id: string;
      type: 'progress';
      percent: number;
      speed: string | null;
      eta: string | null;
      sizeTotal: string | null;
      stage: 'video' | 'audio' | 'merge' | 'postprocess' | 'unknown';
    }
  | { id: string; type: 'log'; line: string }
  | { id: string; type: 'completed'; outputFile: string | null }
  | { id: string; type: 'error'; message: string }
  | { id: string; type: 'canceled' };

export type Platform =
  | 'aix'
  | 'darwin'
  | 'freebsd'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'
  | 'haiku'
  | 'android';

export interface AppDefaults {
  downloadDir: string;
  platform: Platform;
  appVersion: string;
  binaries: {
    ytdlp: string | null;
    ffmpeg: string | null;
    ytdlpFound: boolean;
    ffmpegFound: boolean;
  };
}

export interface AppApi {
  getDefaults: () => Promise<AppDefaults>;
  chooseFolder: () => Promise<string | null>;
  openPath: (target: string) => Promise<void>;
  revealInFolder: (target: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  fetchInfo: (url: string) => Promise<VideoInfo>;
  startDownload: (opts: DownloadOptions) => Promise<{ id: string }>;
  cancel: (id: string) => Promise<void>;
  onEvent: (handler: (event: DownloadEvent) => void) => () => void;
}

declare global {
  interface Window {
    app: AppApi;
  }
}
