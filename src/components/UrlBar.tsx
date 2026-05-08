import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ClipboardPaste, Loader2, Plus, Search } from 'lucide-react';

interface Props {
  value: string;
  loading: boolean;
  parsedCount: number;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

const parseUrls = (text: string): string[] =>
  text
    .split(/\r?\n|,\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export const UrlBar = ({ value, loading, parsedCount, onChange, onSubmit }: Props) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const max = 180;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [value]);

  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const merged = value.trim() ? `${value.trim()}\n${text.trim()}` : text.trim();
      onChange(merged);
      onSubmit(merged);
    } catch {
      /* clipboard permission may be denied */
    }
  };

  const isMulti = parsedCount > 1;
  const lineCount = Math.max(1, value.split(/\r?\n/).length);

  return (
    <div className="flex gap-2 items-stretch">
      <div className="flex-1 flex items-start gap-2 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 focus-within:border-red-500/50 focus-within:ring-2 focus-within:ring-red-500/20 transition">
        <Search className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-1" />
        <textarea
          ref={ref}
          autoFocus
          spellCheck={false}
          rows={1}
          placeholder="Paste a YouTube URL — video, Shorts, playlist, or channel. Multiple URLs (one per line) are downloaded as a batch."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-zinc-600 resize-none leading-snug min-h-[20px]"
        />
        <div className="flex flex-col items-end gap-1 mt-0.5">
          <button
            type="button"
            onClick={paste}
            className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-zinc-800 transition"
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste
          </button>
          {isMulti && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 px-2 py-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/60">
              <Plus className="w-3 h-3" /> {parsedCount} URLs
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={loading || !value.trim()}
          onClick={submit}
          className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition min-w-[120px]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Reading…
            </>
          ) : isMulti ? (
            'Fetch all'
          ) : (
            'Fetch info'
          )}
        </button>
        {lineCount > 1 && (
          <div className="text-[10px] text-zinc-600 text-right">⌘/Ctrl+Enter</div>
        )}
      </div>
    </div>
  );
};

export { parseUrls };
