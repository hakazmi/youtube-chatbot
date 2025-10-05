import React, { useMemo, useRef, useState } from 'react';
import {
  Youtube,
  Plus,
  RefreshCcw,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';

interface SidebarProps {
  onVideosIndexed: (urls: string[]) => void;
  indexedVideos: string[];
  onNewChat: () => void;
}

const API_BASE_URL = 'http://localhost:8000';

function parseUrls(input: string): string[] {
  return input
    .split(/[\n,\s,]+/) // split on newline, spaces, commas
    .map((s) => s.trim())
    .filter(Boolean);
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be');
  } catch {
    return false;
  }
}

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return id || null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    }
  } catch { }
  return null;
}

function thumbnailFor(url: string): string | null {
  const id = getYouTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

export default function Sidebar({
  onVideosIndexed,
  indexedVideos,
  onNewChat,
}: SidebarProps) {
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string[]>([]); // links staged by Enter
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Already indexed (deduped for display)
  const videos = useMemo(
    () => Array.from(new Set(indexedVideos)),
    [indexedVideos]
  );

  const addToPending = (raw: string) => {
    const urls = parseUrls(raw);
    if (urls.length === 0) return;

    const invalid = urls.filter((u) => !isYouTubeUrl(u));
    if (invalid.length) {
      setError(`These didn’t look like YouTube links: ${invalid.slice(0, 3).join(', ')}`);
    } else {
      setError(null);
    }

    const current = new Set(pending);
    const alreadyIndexed = new Set(videos);

    urls.forEach((u) => {
      if (!isYouTubeUrl(u)) return; // skip invalid
      if (!current.has(u) && !alreadyIndexed.has(u)) current.add(u);
    });

    setPending(Array.from(current));
    setInput('');
    // keep focus for fast entry
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const removePending = (url: string) => {
    setPending((prev) => prev.filter((u) => u !== url));
  };

  const clearPending = () => {
    setPending([]);
  };

  const startIndexing = async () => {
    if (pending.length === 0) {
      setError('Add one or more links above (press Enter) before indexing.');
      return;
    }
    setError(null);
    setIsIndexing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/index_videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: pending }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        onVideosIndexed(data.indexed_urls || []);
        clearPending();
      } else {
        setError(data.detail || 'Failed to index. Please try again.');
      }
    } catch {
      setError('Network error while indexing. Is the backend running?');
    } finally {
      setIsIndexing(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (input.trim().length > 0 && !isIndexing) addToPending(input);
    }
  };

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-200 bg-white h-screen sticky top-0 overflow-y-auto">
      {/* Brand / actions */}
      <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center">
            <Youtube className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm font-semibold text-zinc-900">YouTube Chatbot</div>
        </div>
        <button
          onClick={onNewChat}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-red-300"
          title="Start a brand new chat (clears index)"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* Add videos */}
      <div className="p-4 space-y-2">
        <div className="text-xs font-medium text-zinc-700">Add YouTube Videos</div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Paste a video/playlist URL and press Enter to stage it"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          className="w-full px-3 py-2 text-sm rounded-md border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-red-300"
        />

        {/* Pending chips */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase text-zinc-500">
                Pending to add ({pending.length})
              </div>
              <button
                type="button"
                onClick={clearPending}
                className="text-[11px] underline text-zinc-600 hover:text-zinc-900"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {pending.map((u) => (
                <span
                  key={u}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-zinc-100 border border-zinc-300 text-zinc-700"
                  title={u}
                >
                  <span className="truncate max-w-[160px]">{u}</span>
                  <button
                    type="button"
                    onClick={() => removePending(u)}
                    className="ml-1 p-0.5 rounded hover:bg-zinc-200"
                    aria-label="Remove"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Index button */}
        <button
          onClick={startIndexing}
          disabled={isIndexing || pending.length === 0}
          className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-300"
        >
          {isIndexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {isIndexing ? 'Analyzing…' : 'Add to Chat'}
        </button>

        {error && (
          <div className="mt-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>

      {/* Video list */}
      <div className="px-4 pb-4">
        <div className="text-xs font-medium text-zinc-700 mb-2">
          Your Videos ({videos.length})
        </div>
        <div className="space-y-3">
          {videos.map((url) => {
            const thumb = thumbnailFor(url);
            return (
              <div
                key={url}
                className="rounded-md border border-zinc-200 overflow-hidden bg-white hover:shadow-sm transition"
              >
                <div className="relative w-full aspect-video bg-zinc-100">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt="Video thumbnail"
                      loading="lazy"
                      width={320}
                      height={180}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-xs">
                      Playlist / Unknown
                    </div>
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <div className="text-[11px] text-zinc-600 truncate">{url}</div>
                </div>
              </div>
            );
          })}
          {videos.length === 0 && (
            <div className="text-xs text-zinc-500">
              No videos yet. Paste a link above and press Enter.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
