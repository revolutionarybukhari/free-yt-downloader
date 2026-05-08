import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';
import type {
  AppDefaults,
  DownloadEvent,
  DownloadKind,
  DownloadOptions,
  SponsorBlockCategory,
  SponsorBlockMode,
  VideoInfo,
} from './types.js';
import { UrlBar, parseUrls } from './components/UrlBar.js';
import { VideoPreview } from './components/VideoPreview.js';
import { OptionsPanel } from './components/OptionsPanel.js';
import { DownloadList, type DownloadJob } from './components/DownloadList.js';
import { SettingsBar } from './components/SettingsBar.js';
import { BatchList, type BatchEntry } from './components/BatchList.js';

const newId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface UiState {
  selection: DownloadKind;
  embedSubtitles: boolean;
  subtitleLangs: string;
  embedThumbnail: boolean;
  embedChapters: boolean;
  sponsorMode: SponsorBlockMode;
  sponsorCategories: SponsorBlockCategory[];
  playlist: boolean;
  maxItems: number | null;
}

const defaultUiState = (): UiState => ({
  selection: { kind: 'video', maxHeight: 1080, preferHdr: false, fps60: true },
  embedSubtitles: true,
  subtitleLangs: 'en',
  embedThumbnail: true,
  embedChapters: true,
  sponsorMode: 'remove',
  sponsorCategories: ['sponsor', 'selfpromo'],
  playlist: true,
  maxItems: 25,
});

export const App = () => {
  const [defaults, setDefaults] = useState<AppDefaults | null>(null);
  const [outputDir, setOutputDir] = useState<string>('');
  const [url, setUrl] = useState('');
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [ui, setUi] = useState<UiState>(defaultUiState());
  const [downloads, setDownloads] = useState<Record<string, DownloadJob>>({});
  const submittedUrlsRef = useRef<Set<string>>(new Set());

  const handleEvent = useCallback((evt: DownloadEvent) => {
    setDownloads((prev) => {
      const job = prev[evt.id];
      if (!job && evt.type !== 'queued' && evt.type !== 'started') return prev;
      const next = { ...prev };
      const current = job ?? ({} as DownloadJob);
      switch (evt.type) {
        case 'queued':
          next[evt.id] = { ...current, status: 'queued', logs: current.logs ?? [] };
          break;
        case 'started':
          next[evt.id] = { ...current, status: 'running', logs: current.logs ?? [] };
          break;
        case 'progress':
          next[evt.id] = {
            ...current,
            status: 'running',
            percent: evt.percent,
            speed: evt.speed,
            eta: evt.eta,
            sizeTotal: evt.sizeTotal,
            stage: evt.stage,
          };
          break;
        case 'log': {
          const logs = (current.logs ?? []).concat(evt.line).slice(-200);
          next[evt.id] = { ...current, logs };
          break;
        }
        case 'completed':
          next[evt.id] = {
            ...current,
            status: 'completed',
            percent: 100,
            outputFile: evt.outputFile,
          };
          break;
        case 'error':
          next[evt.id] = { ...current, status: 'error', error: evt.message };
          break;
        case 'canceled':
          next[evt.id] = { ...current, status: 'canceled' };
          break;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void window.app.getDefaults().then((d) => {
      setDefaults(d);
      setOutputDir(d.downloadDir);
    });
    const off = window.app.onEvent(handleEvent);
    return off;
  }, [handleEvent]);

  const updateEntry = useCallback((id: string, patch: Partial<BatchEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const fetchOne = useCallback(
    async (entry: BatchEntry) => {
      try {
        const info = await window.app.fetchInfo(entry.url);
        updateEntry(entry.id, { status: 'ready', info, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateEntry(entry.id, { status: 'error', error: message });
      }
    },
    [updateEntry],
  );

  const onUrlSubmit = useCallback(
    (raw: string) => {
      const urls = parseUrls(raw);
      if (urls.length === 0) return;
      const seen = submittedUrlsRef.current;
      const fresh = urls.filter((u) => !seen.has(u));
      if (fresh.length === 0) return;
      const newEntries: BatchEntry[] = fresh.map((u) => {
        seen.add(u);
        return {
          id: newId(),
          url: u,
          status: 'fetching',
          info: null,
          error: null,
        };
      });
      setEntries((prev) => [...prev, ...newEntries]);
      newEntries.forEach((e) => void fetchOne(e));
    },
    [fetchOne],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target) submittedUrlsRef.current.delete(target.url);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const readyEntries = useMemo(
    () => entries.filter((e) => e.status === 'ready' && e.info),
    [entries],
  );

  const hasAnyCollection = useMemo(
    () =>
      readyEntries.some(
        (e) => e.info?.collectionKind === 'channel' || e.info?.collectionKind === 'playlist',
      ),
    [readyEntries],
  );

  const startDownloads = useCallback(async () => {
    if (readyEntries.length === 0 || !outputDir) return;
    const newJobs: Record<string, DownloadJob> = {};
    const optsToSend: DownloadOptions[] = [];
    for (const entry of readyEntries) {
      if (!entry.info) continue;
      const id = newId();
      const isCollection =
        entry.info.collectionKind === 'channel' || entry.info.collectionKind === 'playlist';
      const opts: DownloadOptions = {
        id,
        url: entry.url,
        outputDir,
        selection: ui.selection,
        embedSubtitles: ui.embedSubtitles,
        subtitleLangs: ui.subtitleLangs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        embedThumbnail: ui.embedThumbnail,
        embedChapters: ui.embedChapters,
        sponsorBlock: { mode: ui.sponsorMode, categories: ui.sponsorCategories },
        playlist: isCollection ? ui.playlist : false,
        maxItems: isCollection && ui.playlist ? ui.maxItems : null,
      };
      newJobs[id] = {
        id,
        status: 'queued',
        title: entry.info.title,
        thumbnail: entry.info.thumbnail,
        url: entry.url,
        outputDir,
        kind: ui.selection.kind,
        logs: [],
        startedAt: Date.now(),
      };
      optsToSend.push(opts);
    }
    setDownloads((prev) => ({ ...prev, ...newJobs }));
    setEntries([]);
    submittedUrlsRef.current.clear();
    setUrl('');
    for (const opts of optsToSend) {
      window.app.startDownload(opts).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setDownloads((prev) => ({
          ...prev,
          [opts.id]: { ...prev[opts.id], status: 'error', error: message },
        }));
      });
    }
  }, [outputDir, readyEntries, ui]);

  const cancel = useCallback((id: string) => {
    void window.app.cancel(id);
  }, []);

  const removeJob = useCallback((id: string) => {
    setDownloads((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const chooseFolder = useCallback(async () => {
    const picked = await window.app.chooseFolder();
    if (picked) setOutputDir(picked);
  }, []);

  const downloadList = useMemo(
    () =>
      Object.values(downloads).sort(
        (a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.id.localeCompare(b.id),
      ),
    [downloads],
  );

  const binariesMissing =
    defaults &&
    (!defaults.binaries.ytdlpFound || !defaults.binaries.ffmpegFound);

  const anyFetching = entries.some((e) => e.status === 'fetching');
  const previewInfo: VideoInfo | null =
    readyEntries.length === 1 ? readyEntries[0].info : null;
  const canDownload = readyEntries.length > 0 && !!outputDir && !anyFetching;
  const submitLabel =
    readyEntries.length === 0
      ? 'Download'
      : readyEntries.length === 1
        ? 'Download'
        : `Download all (${readyEntries.length})`;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header className="titlebar-drag flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-900">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-md shadow-red-900/40">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Free YT Downloader</h1>
            <p className="text-xs text-zinc-500 leading-tight">
              4K · 1080p60 · HDR · MP3 · Subtitles · SponsorBlock · Batch · Channels
            </p>
          </div>
        </div>
        <div className="titlebar-nodrag flex items-center gap-2 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            No telemetry
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            No login
          </span>
        </div>
      </header>

      {binariesMissing && (
        <div className="px-5 py-3 bg-amber-950/40 border-b border-amber-900 text-amber-200 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            yt-dlp or ffmpeg was not found. Run{' '}
            <code className="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-100 font-mono text-xs">
              npm run fetch-binaries
            </code>{' '}
            or install them on your PATH.
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <UrlBar
          value={url}
          loading={anyFetching}
          parsedCount={parseUrls(url).length}
          onChange={setUrl}
          onSubmit={onUrlSubmit}
        />

        {entries.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 space-y-4">
              {entries.length > 1 ? (
                <BatchList entries={entries} onRemove={removeEntry} />
              ) : entries[0].status === 'error' ? (
                <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
                  <div className="font-semibold mb-1">Could not read this URL</div>
                  <div className="text-red-300/80 break-words">{entries[0].error}</div>
                </div>
              ) : entries[0].status === 'fetching' ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                  Reading metadata…
                </div>
              ) : entries[0].info ? (
                <VideoPreview info={entries[0].info} />
              ) : null}
            </div>
            <div className="lg:col-span-3">
              <OptionsPanel
                info={previewInfo}
                hasAnyCollection={hasAnyCollection}
                totalEntries={readyEntries.length}
                state={ui}
                onChange={setUi}
                onSubmit={startDownloads}
                canSubmit={canDownload}
                submitLabel={submitLabel}
              />
            </div>
          </div>
        )}

        <SettingsBar
          outputDir={outputDir}
          defaults={defaults}
          onChooseFolder={chooseFolder}
          onOpenFolder={() => outputDir && window.app.openPath(outputDir)}
        />

        <DownloadList jobs={downloadList} onCancel={cancel} onRemove={removeJob} />
      </main>

      <footer className="px-5 py-3 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between">
        <span>Free, open-source. Powered by yt-dlp + ffmpeg. v{defaults?.appVersion ?? '0.1.0'}</span>
        <button
          className="hover:text-zinc-300 transition"
          onClick={() => window.app.openExternal('https://github.com/yt-dlp/yt-dlp')}
        >
          About yt-dlp ↗
        </button>
      </footer>
    </div>
  );
};
