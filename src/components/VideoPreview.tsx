import type { VideoInfo } from '../types.js';
import { Clock, ListVideo, Radio, Sparkles, Tv, Zap } from 'lucide-react';

const formatDuration = (seconds: number): string => {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface Props {
  info: VideoInfo;
}

export const VideoPreview = ({ info }: Props) => {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      {info.thumbnail ? (
        <div className="aspect-video bg-zinc-950 overflow-hidden">
          <img
            src={info.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="aspect-video bg-zinc-800 flex items-center justify-center text-zinc-600 text-sm">
          No thumbnail
        </div>
      )}
      <div className="p-4 space-y-2.5">
        <h2 className="text-sm font-semibold leading-snug line-clamp-3">
          {info.title}
        </h2>
        <div className="text-xs text-zinc-400">{info.channel}</div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Pill>
            <Clock className="w-3 h-3" /> {formatDuration(info.durationSeconds)}
          </Pill>
          {info.formats.maxHeight > 0 && (
            <Pill>
              <Sparkles className="w-3 h-3" /> up to {info.formats.maxHeight}p
            </Pill>
          )}
          {info.formats.has60fps && (
            <Pill>
              <Zap className="w-3 h-3" /> 60fps
            </Pill>
          )}
          {info.formats.hasHdr && <Pill className="text-amber-300">HDR</Pill>}
          {info.isLive && (
            <Pill className="text-red-300">
              <Radio className="w-3 h-3" /> Live
            </Pill>
          )}
          {info.collectionKind === 'channel' && (
            <Pill className="text-sky-300">
              <Tv className="w-3 h-3" /> Channel
              {info.playlistCount ? ` · ${info.playlistCount.toLocaleString()} videos` : ''}
            </Pill>
          )}
          {info.collectionKind === 'playlist' && (
            <Pill>
              <ListVideo className="w-3 h-3" /> Playlist
              {info.playlistCount ? ` · ${info.playlistCount} videos` : ''}
            </Pill>
          )}
        </div>
      </div>
    </div>
  );
};

const Pill = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/60 text-xs text-zinc-300 ${className}`}
  >
    {children}
  </span>
);
