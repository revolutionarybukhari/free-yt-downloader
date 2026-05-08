import { AlertCircle, ListVideo, Loader2, Music2, Radio, Tv, Video, X } from 'lucide-react';
import type { VideoInfo } from '../types.js';

export interface BatchEntry {
  id: string;
  url: string;
  status: 'fetching' | 'ready' | 'error';
  info: VideoInfo | null;
  error: string | null;
}

interface Props {
  entries: BatchEntry[];
  onRemove: (id: string) => void;
}

export const BatchList = ({ entries, onRemove }: Props) => {
  const ready = entries.filter((e) => e.status === 'ready').length;
  const errored = entries.filter((e) => e.status === 'error').length;
  const fetching = entries.filter((e) => e.status === 'fetching').length;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-800/80">
        <div className="text-xs uppercase tracking-wide text-zinc-400 font-medium">
          Batch · {entries.length} items
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {fetching > 0 && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> {fetching}
            </span>
          )}
          {ready > 0 && <span className="text-emerald-400">{ready} ready</span>}
          {errored > 0 && <span className="text-red-400">{errored} failed</span>}
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800/60">
        {entries.map((entry) => (
          <BatchRow key={entry.id} entry={entry} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
};

const BatchRow = ({
  entry,
  onRemove,
}: {
  entry: BatchEntry;
  onRemove: (id: string) => void;
}) => {
  const info = entry.info;
  return (
    <div className="px-3 py-2 flex items-center gap-3 hover:bg-zinc-800/30">
      <div className="w-16 h-9 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {info?.thumbnail ? (
          <img
            src={info.thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : entry.status === 'fetching' ? (
          <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        ) : entry.status === 'error' ? (
          <AlertCircle className="w-4 h-4 text-red-400" />
        ) : (
          <Video className="w-4 h-4 text-zinc-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium truncate">
          <KindIcon entry={entry} />
          <span className="truncate">{info?.title ?? entry.url}</span>
        </div>
        <div className="text-xs text-zinc-500 truncate">
          {entry.status === 'error' ? (
            <span className="text-red-400">{entry.error}</span>
          ) : info ? (
            <SubtitleLine info={info} />
          ) : (
            <span className="text-zinc-500">Reading metadata…</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        className="w-7 h-7 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 inline-flex items-center justify-center transition flex-shrink-0"
        title="Remove from batch"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

const KindIcon = ({ entry }: { entry: BatchEntry }) => {
  const kind = entry.info?.collectionKind;
  const cls = 'w-3.5 h-3.5 text-zinc-500 flex-shrink-0';
  if (kind === 'channel') return <Tv className={cls} />;
  if (kind === 'playlist') return <ListVideo className={cls} />;
  if (entry.info?.isLive) return <Radio className={cls} />;
  return <Video className={cls} />;
};

const SubtitleLine = ({ info }: { info: VideoInfo }) => {
  const parts: string[] = [];
  if (info.collectionKind === 'channel') {
    parts.push('Channel');
    if (info.playlistCount) parts.push(`${info.playlistCount.toLocaleString()} videos`);
    parts.push(info.channel);
  } else if (info.collectionKind === 'playlist') {
    parts.push('Playlist');
    if (info.playlistCount) parts.push(`${info.playlistCount.toLocaleString()} videos`);
    parts.push(info.channel);
  } else {
    parts.push(info.channel);
    if (info.formats.maxHeight > 0) parts.push(`up to ${info.formats.maxHeight}p`);
  }
  return <span>{parts.join(' · ')}</span>;
};

export { Music2 };
