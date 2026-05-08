import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { requireBinaries, resolveBinaries } from './binaries.js';
import type {
  CollectionKind,
  DownloadEvent,
  DownloadOptions,
  ResolvedFormatSummary,
  VideoInfo,
} from './types.js';

const MAX_CONCURRENT_DOWNLOADS = 2;

const isChannelUrl = (url: string): boolean =>
  /youtube\.com\/(@|c\/|channel\/|user\/)/i.test(url);

const isPlaylistOnlyUrl = (url: string): boolean =>
  /youtube\.com\/playlist\?/i.test(url) ||
  (/[?&]list=/i.test(url) && !/[?&]v=/i.test(url));

const execFileP = promisify(execFile);

interface RawFormat {
  format_id?: string;
  format_note?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number | null;
  width?: number | null;
  fps?: number | null;
  dynamic_range?: string | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  abr?: number | null;
}

interface RawInfo {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url: string }[];
  upload_date?: string;
  is_live?: boolean;
  _type?: string;
  playlist_count?: number;
  entries?: RawInfo[];
  formats?: RawFormat[];
}

const summarizeFormats = (formats: RawFormat[] | undefined): ResolvedFormatSummary => {
  const fmts = formats ?? [];
  const heights = new Set<number>();
  let hasHdr = false;
  let has60 = false;
  let hasAudio = false;
  for (const f of fmts) {
    if (f.vcodec && f.vcodec !== 'none' && f.height) heights.add(f.height);
    if (f.dynamic_range && /HDR/i.test(f.dynamic_range)) hasHdr = true;
    if ((f.fps ?? 0) >= 50) has60 = true;
    if (f.acodec && f.acodec !== 'none') hasAudio = true;
  }
  const sorted = [...heights].sort((a, b) => b - a);
  return {
    maxHeight: sorted[0] ?? 0,
    hasHdr,
    has60fps: has60,
    availableHeights: sorted,
    hasAudio,
  };
};

export const fetchInfo = async (url: string): Promise<VideoInfo> => {
  const { ytdlp } = await requireBinaries();
  const channelGuess = isChannelUrl(url);
  const playlistGuess = isPlaylistOnlyUrl(url);
  const treatAsCollection = channelGuess || playlistGuess;

  const args = [
    '--dump-single-json',
    '--no-warnings',
    '--no-call-home',
    '--ignore-config',
    ...(treatAsCollection ? ['--flat-playlist', '--yes-playlist'] : ['--no-playlist']),
    url,
  ];

  const { stdout } = await execFileP(ytdlp, args, {
    maxBuffer: 128 * 1024 * 1024,
  });
  const raw = JSON.parse(stdout) as RawInfo;
  const isCollection =
    treatAsCollection || raw._type === 'playlist' || (raw.entries?.length ?? 0) > 0;

  if (isCollection) {
    const collectionKind: CollectionKind = channelGuess ? 'channel' : 'playlist';
    const firstEntry = raw.entries?.[0];
    const thumb =
      raw.thumbnail ??
      raw.thumbnails?.[raw.thumbnails.length - 1]?.url ??
      firstEntry?.thumbnail ??
      firstEntry?.thumbnails?.[firstEntry.thumbnails.length - 1]?.url ??
      '';
    return {
      id: raw.id,
      title: raw.title ?? 'Untitled collection',
      channel: raw.channel ?? raw.uploader ?? 'Unknown',
      durationSeconds: 0,
      thumbnail: thumb,
      uploadDate: raw.upload_date ?? null,
      isLive: false,
      isPlaylist: true,
      playlistCount: raw.playlist_count ?? raw.entries?.length ?? null,
      collectionKind,
      formats: summarizeFormats(undefined),
    };
  }

  const thumb =
    raw.thumbnail ??
    raw.thumbnails?.[raw.thumbnails.length - 1]?.url ??
    '';

  return {
    id: raw.id,
    title: raw.title,
    channel: raw.channel ?? raw.uploader ?? 'Unknown',
    durationSeconds: raw.duration ?? 0,
    thumbnail: thumb,
    uploadDate: raw.upload_date ?? null,
    isLive: !!raw.is_live,
    isPlaylist: false,
    playlistCount: null,
    collectionKind: 'video',
    formats: summarizeFormats(raw.formats),
  };
};

const buildArgs = (opts: DownloadOptions, ffmpegPath: string): string[] => {
  const args: string[] = [
    '--no-warnings',
    '--no-call-home',
    '--ignore-config',
    '--newline',
    '--progress',
    '--no-mtime',
    '--ffmpeg-location',
    ffmpegPath,
    '--paths',
    opts.outputDir,
    '--output',
    '%(title).180B [%(id)s].%(ext)s',
  ];

  if (!opts.playlist) {
    args.push('--no-playlist');
  } else {
    args.push('--yes-playlist');
    if (opts.maxItems && opts.maxItems > 0) {
      args.push('--playlist-end', String(opts.maxItems));
    }
  }

  if (opts.selection.kind === 'audio') {
    args.push('-x', '--audio-format', opts.selection.format);
    if (opts.selection.bitrateKbps > 0) {
      args.push('--audio-quality', `${opts.selection.bitrateKbps}K`);
    }
  } else {
    const h = opts.selection.maxHeight;
    const fpsClause = opts.selection.fps60 ? '[fps>=50]' : '';
    const hdrClause = opts.selection.preferHdr
      ? '[dynamic_range~=HDR]'
      : '';
    const heightClause = `[height<=${h}]`;
    const videoBest = `bv*${heightClause}${fpsClause}${hdrClause}`;
    const videoFallback = `bv*${heightClause}${fpsClause}`;
    const videoFallback2 = `bv*${heightClause}`;
    const audioBest = 'ba/b';
    args.push(
      '-f',
      `${videoBest}+${audioBest}/${videoFallback}+${audioBest}/${videoFallback2}+${audioBest}/b${heightClause}/b`,
    );
    args.push('--merge-output-format', 'mp4');
    args.push('--remux-video', 'mp4');
  }

  if (opts.embedThumbnail) args.push('--embed-thumbnail');
  if (opts.embedChapters) args.push('--embed-chapters');

  if (opts.embedSubtitles && opts.subtitleLangs.length > 0) {
    args.push(
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs',
      opts.subtitleLangs.join(','),
      '--embed-subs',
      '--convert-subs',
      'srt',
    );
  }

  if (opts.sponsorBlock.mode !== 'off' && opts.sponsorBlock.categories.length > 0) {
    const flag =
      opts.sponsorBlock.mode === 'remove'
        ? '--sponsorblock-remove'
        : '--sponsorblock-mark';
    args.push(flag, opts.sponsorBlock.categories.join(','));
  }

  args.push('--', opts.url);
  return args;
};

interface RunningJob {
  child: ReturnType<typeof spawn>;
  canceled: boolean;
}

const running = new Map<string, RunningJob>();

interface QueuedJob {
  opts: DownloadOptions;
  emit: (event: DownloadEvent) => void;
  resolve: (value: { id: string }) => void;
  reject: (reason: unknown) => void;
}

const pending: QueuedJob[] = [];

const cancelPending = (id: string): boolean => {
  const idx = pending.findIndex((j) => j.opts.id === id);
  if (idx < 0) return false;
  const [job] = pending.splice(idx, 1);
  job.emit({ id, type: 'canceled' });
  job.resolve({ id });
  return true;
};

const tryStartNext = () => {
  while (running.size < MAX_CONCURRENT_DOWNLOADS && pending.length > 0) {
    const job = pending.shift()!;
    runDownload(job.opts, job.emit)
      .then(job.resolve)
      .catch(job.reject)
      .finally(tryStartNext);
  }
};

const PROGRESS_RE =
  /^\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\w+)?(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/;

export const startDownload = (
  opts: DownloadOptions,
  emit: (event: DownloadEvent) => void,
): Promise<{ id: string }> => {
  return new Promise((resolve, reject) => {
    emit({ id: opts.id, type: 'queued' });
    pending.push({ opts, emit, resolve, reject });
    tryStartNext();
  });
};

const runDownload = (
  opts: DownloadOptions,
  emit: (event: DownloadEvent) => void,
): Promise<{ id: string }> => {
  return new Promise(async (resolve, reject) => {
    let bins;
    try {
      bins = await requireBinaries();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ id: opts.id, type: 'error', message });
      reject(err);
      return;
    }

    const args = buildArgs(opts, bins.ffmpeg);

    const child = spawn(bins.ytdlp, args, {
      cwd: opts.outputDir,
      windowsHide: true,
    });
    running.set(opts.id, { child, canceled: false });
    emit({ id: opts.id, type: 'started' });

    let stage: 'video' | 'audio' | 'merge' | 'postprocess' | 'unknown' = 'unknown';
    let videoSeen = false;
    let outputFile: string | null = null;

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      emit({ id: opts.id, type: 'log', line });

      if (line.startsWith('[download] Destination:')) {
        const dest = line.replace('[download] Destination:', '').trim();
        outputFile = dest;
        if (!videoSeen) {
          stage = 'video';
          videoSeen = true;
        } else {
          stage = 'audio';
        }
      } else if (line.startsWith('[Merger]')) {
        stage = 'merge';
        const m = line.match(/Merging formats into "(.+)"$/);
        if (m) outputFile = m[1];
      } else if (
        line.startsWith('[ExtractAudio]') ||
        line.startsWith('[VideoRemuxer]') ||
        line.startsWith('[EmbedSubtitle]') ||
        line.startsWith('[ThumbnailsConvertor]') ||
        line.startsWith('[SponsorBlock]') ||
        line.startsWith('[ModifyChapters]')
      ) {
        stage = 'postprocess';
        const m = line.match(/Destination: (.+)$/);
        if (m) outputFile = m[1].trim();
      }

      const m = line.match(PROGRESS_RE);
      if (m) {
        const percent = parseFloat(m[1]);
        const sizeTotal = m[2] ?? null;
        const speed = m[3] ?? null;
        const eta = m[4] ?? null;
        emit({
          id: opts.id,
          type: 'progress',
          percent,
          speed,
          eta,
          sizeTotal,
          stage,
        });
      }
    };

    let stdoutBuf = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? '';
      for (const ln of lines) handleLine(ln);
    });

    let stderrBuf = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8');
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop() ?? '';
      for (const ln of lines) {
        if (ln.trim()) emit({ id: opts.id, type: 'log', line: ln });
      }
    });

    child.on('error', (err) => {
      running.delete(opts.id);
      emit({ id: opts.id, type: 'error', message: err.message });
      reject(err);
    });

    child.on('close', (code) => {
      const job = running.get(opts.id);
      running.delete(opts.id);
      if (job?.canceled) {
        emit({ id: opts.id, type: 'canceled' });
        resolve({ id: opts.id });
        return;
      }
      if (code === 0) {
        const finalPath = outputFile ? path.resolve(opts.outputDir, outputFile) : null;
        emit({ id: opts.id, type: 'completed', outputFile: finalPath });
        resolve({ id: opts.id });
      } else {
        emit({
          id: opts.id,
          type: 'error',
          message: `yt-dlp exited with code ${code}`,
        });
        resolve({ id: opts.id });
      }
    });
  });
};

export const cancelDownload = (id: string) => {
  if (cancelPending(id)) return;
  const job = running.get(id);
  if (!job) return;
  job.canceled = true;
  if (process.platform === 'win32') {
    try {
      job.child.kill();
    } catch {
      /* noop */
    }
  } else {
    try {
      job.child.kill('SIGTERM');
      setTimeout(() => {
        if (running.has(id)) job.child.kill('SIGKILL');
      }, 1500);
    } catch {
      /* noop */
    }
  }
};

export const cancelAllDownloads = () => {
  for (const job of [...pending]) cancelPending(job.opts.id);
  for (const id of [...running.keys()]) cancelDownload(id);
};

export const probeBinaries = async () => {
  const { ytdlp, ffmpeg } = await resolveBinaries();
  const out: { ytdlp?: string; ffmpeg?: string } = {};
  if (ytdlp) {
    try {
      const { stdout } = await execFileP(ytdlp, ['--version']);
      out.ytdlp = stdout.trim();
    } catch {
      /* noop */
    }
  }
  if (ffmpeg) {
    try {
      const { stdout } = await execFileP(ffmpeg, ['-version']);
      out.ffmpeg = stdout.split('\n')[0]?.trim();
    } catch {
      /* noop */
    }
  }
  return out;
};
