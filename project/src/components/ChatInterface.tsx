import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Loader2,
  Youtube,
  ArrowDown,
  Plus,
  AlertCircle,
  X,
} from 'lucide-react';
import ChatMessage from './ChatMessage';
import type { Message } from './types';

interface ChatInterfaceProps {
  hasIndexedVideos: boolean;
  onVideosIndexed: (urls: string[]) => void; // <-- NEW: update parent when we add links here
}

const API_BASE_URL = 'http://localhost:8000';

// --- helpers (same parsing as sidebar) ---
function parseUrls(input: string): string[] {
  return input
    .split(/[\n,\s,]+/)
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

export default function ChatInterface({ hasIndexedVideos, onVideosIndexed }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // we keep the “mode” plumbing; backend can ignore it
  const [detailMode] = useState<'concise' | 'detailed'>('concise');

  // scrolling state
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // --- Add Videos (inline panel) ---
  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [isIndexingAdd, setIsIndexingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const addToPending = (raw: string) => {
    const urls = parseUrls(raw);
    if (urls.length === 0) return;

    const invalid = urls.filter((u) => !isYouTubeUrl(u));
    if (invalid.length) {
      setAddError(`Not YouTube links: ${invalid.slice(0, 3).join(', ')}`);
    } else {
      setAddError(null);
    }

    const current = new Set(pending);
    urls.forEach((u) => {
      if (isYouTubeUrl(u)) current.add(u);
    });
    setPending(Array.from(current));
    setAddInput('');
    setTimeout(() => addInputRef.current?.focus(), 0);
  };

  const removePending = (url: string) => setPending((prev) => prev.filter((u) => u !== url));
  const clearPending = () => setPending([]);

  const startIndexingAdd = async () => {
    if (pending.length === 0) {
      setAddError('Add one or more links above (press Enter) before indexing.');
      return;
    }
    setAddError(null);
    setIsIndexingAdd(true);
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
        setShowAdd(false); // collapse panel on success
      } else {
        setAddError(data.detail || 'Failed to index. Please try again.');
      }
    } catch {
      setAddError('Network error while indexing. Is the backend running?');
    } finally {
      setIsIndexingAdd(false);
      setTimeout(() => addInputRef.current?.focus(), 0);
    }
  };

  const handleAddKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (addInput.trim().length > 0 && !isIndexingAdd) addToPending(addInput);
    }
  };

  // --- textarea autosize ---
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  // only autoscroll when user is already near bottom
  useEffect(() => {
    if (isAtBottom) scrollToBottom('auto');
  }, [messages, isAtBottom, scrollToBottom]);

  // track whether user is near the bottom
  const handleScroll = () => {
    const el = scrollBoxRef.current;
    if (!el) return;
    const threshold = 80; // px
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsAtBottom(distanceFromBottom <= threshold);
  };

  const simulateStreaming = (text: string, messageId: string) => {
    const words = text.split(' ');
    let currentIndex = 0;

    const interval = setInterval(() => {
      if (currentIndex < words.length) {
        const chunk = words.slice(0, currentIndex + 1).join(' ');
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, content: chunk } : msg))
        );
        currentIndex++;
        if (isAtBottom) scrollToBottom('auto');
      } else {
        clearInterval(interval);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg))
        );
      }
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !hasIndexedVideos) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true },
    ]);

    setIsAtBottom(true);
    scrollToBottom('auto');

    try {
      const response = await fetch(`${API_BASE_URL}/ask_question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage.content, mode: detailMode }),
      });
      const data = await response.json();

      if (data.error) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: `Error: ${data.error}`, isStreaming: false }
              : msg
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                ...msg,
                content: '',
                citations: data.citations,
                sourceVideos: data.source_videos,
                timings: data.timings || {},
              }
              : msg
          )
        );
        simulateStreaming(data.answer, assistantMessageId);
      }
    } catch {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
              ...msg,
              content: 'Failed to get response. Make sure the backend is running.',
              isStreaming: false,
            }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent">
      {/* Header with Add panel toggle */}
      <div className="border-b border-zinc-200 px-6 py-4 bg-white/90 backdrop-blur">
        <div className="max-w-[820px] mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                <Youtube className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-900">Chat</h2>
            </div>

            {/* Add videos toggle */}
            <button
              type="button"
              onClick={() => {
                setShowAdd((v) => !v);
                setTimeout(() => addInputRef.current?.focus(), 0);
              }}
              className="inline-flex items-center gap-2 text-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-red-300"
              title="Add more YouTube links while chatting"
            >
              <Plus className="w-4 h-4" />
              Add videos
            </button>
          </div>

          {/* Collapsible Add panel */}
          {showAdd && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={addInputRef}
                  type="text"
                  placeholder="Paste a video/playlist URL and press Enter to stage it"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={handleAddKeyDown}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <button
                  type="button"
                  onClick={startIndexingAdd}
                  disabled={isIndexingAdd || pending.length === 0}
                  className="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  {isIndexingAdd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {isIndexingAdd ? 'Analyzing…' : 'Add to Chat'}
                </button>
              </div>

              {/* Pending chips */}
              {pending.length > 0 && (
                <div className="mt-2">
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
                  <div className="mt-1 flex flex-wrap gap-2">
                    {pending.map((u) => (
                      <span
                        key={u}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-zinc-100 border border-zinc-300 text-zinc-700"
                        title={u}
                      >
                        <span className="truncate max-w-[260px]">{u}</span>
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

              {addError && (
                <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1 inline-flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {addError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages scroll area */}
      <div ref={scrollBoxRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-[720px]">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Youtube className="w-8 h-8 text-red-600" />
              </div>
              {hasIndexedVideos ? (
                <>
                  <h3 className="text-2xl font-bold text-zinc-900 mb-2">Ready to chat!</h3>
                  <p className="text-zinc-600">
                    Ask me anything about your indexed YouTube videos. I&apos;ll provide answers grounded in transcripts.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-2xl font-bold text-zinc-900 mb-2">Chat with your first video</h3>
                  <p className="text-zinc-600">From hours of content to seconds of answers — just ask.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-[820px] mx-auto px-6 lg:px-8 py-8 space-y-6">
            {messages.map((message, index) => (
              <ChatMessage key={message.id} message={message} index={index} />
            ))}
          </div>
        )}

        {/* “Jump to latest” floating pill (only when not at bottom) */}
        {!isAtBottom && (
          <div className="pointer-events-none sticky bottom-4 z-10">
            <div className="max-w-[820px] mx-auto px-6 lg:px-8">
              <button
                type="button"
                onClick={() => {
                  setIsAtBottom(true);
                  scrollToBottom('smooth');
                }}
                className="pointer-events-auto ml-auto flex items-center gap-2 rounded-full bg-white/95 border border-zinc-300 shadow px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                title="Jump to latest"
              >
                <ArrowDown className="w-4 h-4" />
                Jump to latest
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-zinc-200 bg-white/90 backdrop-blur px-6 py-4">
        <div className="max-w-[820px] mx-auto">
          <form onSubmit={handleSubmit} className="flex items-end space-x-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasIndexedVideos ? 'Ask a question about your videos...' : 'Add videos in the sidebar/header first...'}
                rows={1}
                disabled={isLoading || !hasIndexedVideos}
                className="w-full px-4 py-3 bg-white border border-zinc-300 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-50 resize-none overflow-hidden"
                style={{ maxHeight: '150px' }}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !hasIndexedVideos}
              className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
          <p className="text-xs text-zinc-500 mt-2 text-center">Press Enter to send, Shift + Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
