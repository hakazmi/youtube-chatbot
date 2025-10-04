import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Youtube } from 'lucide-react';
import ChatMessage from './ChatMessage';
import type { Message } from './types';

interface ChatInterfaceProps {
  hasIndexedVideos: boolean;
}

const API_BASE_URL = 'http://localhost:8000';

export default function ChatInterface({ hasIndexedVideos }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Keep the mode wiring (default to concise) but no header buttons.
  const [detailMode] = useState<'concise' | 'detailed'>('concise');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  const simulateStreaming = (text: string, messageId: string) => {
    const words = text.split(' ');
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < words.length) {
        const chunk = words.slice(0, currentIndex + 1).join(' ');
        setMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, content: chunk } : msg)));
        currentIndex++;
      } else {
        clearInterval(interval);
        setMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, isStreaming: false } : msg)));
      }
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !hasIndexedVideos) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true }]);

    try {
      const response = await fetch(`${API_BASE_URL}/ask_question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // mode still sent; backend can map to k/verbosity
        body: JSON.stringify({ question: userMessage.content, mode: detailMode }),
      });
      const data = await response.json();

      if (data.error) {
        setMessages(prev =>
          prev.map(msg => (msg.id === assistantMessageId
            ? { ...msg, content: `Error: ${data.error}`, isStreaming: false }
            : msg))
        );
      } else {
        setMessages(prev =>
          prev.map(msg => (msg.id === assistantMessageId
            ? {
              ...msg,
              content: '',
              citations: data.citations,
              sourceVideos: data.source_videos,
              timings: data.timings || {},
            }
            : msg))
        );
        simulateStreaming(data.answer, assistantMessageId);
      }
    } catch {
      setMessages(prev =>
        prev.map(msg => (msg.id === assistantMessageId
          ? { ...msg, content: 'Failed to get response. Make sure the backend is running.', isStreaming: false }
          : msg))
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
      {/* Header (buttons removed) */}
      <div className="border-b border-zinc-200 px-6 py-4 bg-white/90 backdrop-blur">
        <div className="max-w-[820px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">Chat</h2>
          </div>
          {/* right side intentionally empty now */}
          <div />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
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
                    From hours of content to seconds of answers — just ask.
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
            <div ref={messagesEndRef} />
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
                placeholder={hasIndexedVideos ? 'Ask a question about your videos...' : 'Add videos in the sidebar first...'}
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
