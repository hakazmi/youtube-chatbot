// src/components/ChatMessage.tsx
import React, { useState } from 'react';
import {
  Bot,
  User,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import type { Message, Citation } from './types';

/* ---------- Helpers ---------- */

// Linkify bracketed refs like "[#1 V2 01:59–02:04]" using the matching citation URL.
function linkifyRefBrackets(text: string, citations: Citation[]): React.ReactNode[] {
  const refMap = new Map(citations.map((c) => [c.ref_id, c]));

  // We'll process in two passes:
  // 1) Full refs "[#1 V2 01:59–02:04]" (keep as one link)
  // 2) Short refs "[#1]" (inside Evidence lines, etc.)
  const reFull = /\[(#\d+)\s+V\d+\s+\d{1,2}:\d{2}–\d{1,2}:\d{2}\]/g;
  const reShort = /\[(#\d+)\]/g;

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  // helper to push a link node
  const pushLink = (key: string, refId: string, label: string) => {
    const cite = refMap.get(refId);
    if (!cite?.url) return nodes.push(label);
    nodes.push(
      <a
        key={key}
        href={cite.url}
        target="_blank"
        rel="noopener noreferrer"
        className="no-underline hover:underline font-semibold inline-flex items-center gap-1 text-zinc-900 hover:text-red-600 transition"
        title={`Play ${cite.video_tag} at ${cite.timestamp}`}
        aria-label={`Play ${cite.video_tag} at ${cite.timestamp}`}
      >
        <Play className="w-3 h-3 text-red-600" />
        {label}
      </a>
    );
  };

  // First pass: full refs
  while ((m = reFull.exec(text)) !== null) {
    const start = m.index;
    const end = reFull.lastIndex;
    const segment = text.slice(last, start);
    if (segment) nodes.push(segment);

    const full = m[0];
    const refId = m[1]; // "#1"
    pushLink(`${refId}-${start}-full`, refId, full);
    last = end;
  }
  if (last < text.length) nodes.push(text.slice(last));

  // Second pass: within plain text chunks, link short refs "[#N]"
  const expanded: React.ReactNode[] = [];
  nodes.forEach((node, idx) => {
    if (typeof node !== 'string') return expanded.push(node);
    let s = node;
    let pos = 0;
    let match: RegExpExecArray | null;
    while ((match = reShort.exec(s)) !== null) {
      const start = match.index;
      const end = reShort.lastIndex;
      if (start > pos) expanded.push(s.slice(pos, start));
      const label = match[0];
      const refId = match[1];
      pushLink(`short-${refId}-${idx}-${start}`, refId, label);
      pos = end;
    }
    if (pos < s.length) expanded.push(s.slice(pos));
  });

  return expanded;
}


// Extract a YouTube ID for thumbnails
function extractVideoIdFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      if (u.pathname.startsWith('/shorts/')) {
        const parts = u.pathname.split('/');
        return parts[2] || null;
      }
    }
  } catch { }
  return null;
}
function ytThumbnail(id: string) {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

/* ---------- Subcomponent ---------- */

function CitationGroup({ list }: { list: Citation[] }) {
  const [open, setOpen] = useState(false);
  const used = list.filter((c) => c.used);
  const others = list.filter((c) => !c.used);

  const title = `${list[0]?.video_tag || ''} ${list[0]?.video_title || 'Video'}`.trim();
  const vid = extractVideoIdFromUrl(list[0]?.video_url);

  return (
    <div className="border border-zinc-200 rounded-2xl p-3 bg-white shadow-[0_1px_1px_rgba(0,0,0,0.04),0_8px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-3">
        {vid && (
          <img
            src={ytThumbnail(vid)}
            alt="Video thumbnail"
            className="w-24 h-14 rounded-lg object-cover flex-shrink-0 aspect-video"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-tight text-zinc-900 truncate mb-1">
            {title}
          </div>

          {/* Used in answer */}
          {used.length > 0 && (
            <div className="mb-1">
              <div className="text-[11px] uppercase opacity-70 mb-1">Used in answer</div>
              <div className="flex flex-wrap gap-1">
                {used.map((c, i) => (
                  <a
                    key={`u-${i}`}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.snippet || ''}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:shadow-sm transition focus:outline-none focus:ring-2 focus:ring-red-300"
                  >
                    <Play className="w-3 h-3 text-white" />
                    {c.ref_id} {c.timestamp}
                  </a>
                ))}
              </div>

              {/* Play all used (open first) */}
              {used.length > 1 && (
                <button
                  type="button"
                  onClick={() => window.open(used[0].url, '_blank')}
                  className="mt-2 text-[11px] px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-50 hover:ring-1 hover:ring-red-200 transition"
                  title="Open the first cited moment"
                >
                  Play all used
                </button>
              )}
            </div>
          )}

          {/* More matches (collapsed) */}
          {others.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center text-[11px] underline opacity-70"
                aria-expanded={open}
              >
                {open ? (
                  <ChevronDown className="w-3 h-3 mr-1" />
                ) : (
                  <ChevronRight className="w-3 h-3 mr-1" />
                )}
                More matches ({others.length})
              </button>

              {open && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {others.map((c, i) => (
                    <a
                      key={`o-${i}`}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={c.snippet || ''}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white text-zinc-700 border border-zinc-300 hover:border-red-300 hover:bg-zinc-50 transition focus:outline-none focus:ring-2 focus:ring-red-300"
                    >
                      <Play className="w-3 h-3 text-zinc-700" />
                      {c.timestamp}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main component ---------- */

interface ChatMessageProps {
  message: Message;
  index: number;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const citations = Array.isArray(message.citations) ? message.citations : [];
  const [copied, setCopied] = useState(false);

  // Only show copy when assistant response is finalized.
  const showCopy =
    !isUser &&
    !message.isStreaming &&
    Boolean(message.content && message.content.trim().length > 0);

  // Group citations by base video URL (fallback to video_tag)
  const groups = citations.reduce((acc: Record<string, Citation[]>, c) => {
    const key = (c.video_url && c.video_url.split('?')[0]) || c.video_tag || 'unknown';
    (acc[key] ||= []).push(c);
    return acc;
  }, {});

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-2xl w-full flex ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-red-600' : 'bg-zinc-900'
            }`}
        >
          {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
        </div>

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-4 py-3 ${isUser
            ? 'bg-red-700 text-white'
            : 'bg-zinc-100 text-zinc-900 border border-zinc-200'
            }`}
          style={{ whiteSpace: 'pre-wrap' }}
          aria-live={!isUser ? 'polite' : undefined}
        >
          {/* Copy (assistant only, AFTER streaming) */}
          {showCopy && (
            <button
              onClick={doCopy}
              className="absolute top-2 right-2 p-1.5 rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:ring-1 hover:ring-red-200"
              title="Copy answer"
              aria-label="Copy answer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Body: show streaming placeholder or linkified final text */}
          <div className="prose prose-sm max-w-none leading-6">
            {isUser
              ? message.content || (message.isStreaming ? '...' : '')
              : linkifyRefBrackets(message.content || (message.isStreaming ? '...' : ''), citations)}
          </div>

          {/* Low-evidence nudge */}
          {citations.length > 0 && citations.filter((c) => c.used).length < 2 && (
            <div className="mt-2 mb-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Low evidence: only a few used segments were referenced for this answer.
            </div>
          )}

          {/* Citations */}
          {citations.length > 0 && (
            <div className="mt-3 text-zinc-700">
              <div className="flex items-center text-xs font-semibold uppercase tracking-wide mb-2 opacity-80">
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                Citations
              </div>

              <div className="space-y-3">
                {Object.entries(groups).map(([key, list]) => (
                  <CitationGroup key={key} list={list} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
