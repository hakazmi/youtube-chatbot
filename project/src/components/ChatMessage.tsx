import { User, Bot, ExternalLink, Clock, Play } from 'lucide-react';
import { extractVideoId, getVideoThumbnail } from '../utils/youtube';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ text: string; timestamp: string; url: string}>;
  sourceVideos?: string[];
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: Message;
  index: number;
}

export default function ChatMessage({ message, index }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex items-start space-x-4 animate-fade-in-up ${
        isUser ? 'flex-row-reverse space-x-reverse' : ''
      }`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-gray-700' : 'bg-green-600'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`inline-block max-w-3xl ${isUser ? '' : 'w-full'}`}>
          <div
            className={`rounded-2xl px-4 py-3 ${
              isUser
                ? 'bg-gray-100 text-gray-900'
                : 'bg-white text-gray-900'
            }`}
          >
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
              {message.isStreaming && (
                <span className="inline-block w-1.5 h-5 bg-red-600 ml-1 animate-pulse"></span>
              )}
            </div>

            {message.citations && message.citations.length > 0 && (
             <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
             <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center">
             <Clock className="w-3.5 h-3.5 mr-1.5" />
              Citations
             </p>
               {message.citations.map((citation, idx) => {
                 const videoId = citation.url ? extractVideoId(citation.url) : null;
                return (
               <a
                 key={idx}
                 href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                 className="group block bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-red-300 rounded-lg p-3 transition-all"
                 >
          <div className="flex items-start space-x-3">
            {videoId && (
              <img
                src={getVideoThumbnail(videoId)}
                alt="Video thumbnail"
                className="w-24 h-16 object-cover rounded flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 text-sm leading-relaxed mb-1">
                {citation.text}
              </p>
              {citation.timestamp && (
                <p className="text-xs text-gray-500 flex items-center">
                  <Play className="w-3 h-3 mr-1" />
                  {citation.timestamp}
                </p>
              )}
            </div>
          </div>
        </a>
      );
    })}
  </div>
)}


            {message.sourceVideos && message.sourceVideos.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  Source Videos
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {message.sourceVideos.map((video, idx) => {
                    const videoId = extractVideoId(video);
                    return (
                      <a
                        key={idx}
                        href={video}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center space-x-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-red-300 rounded-lg p-2 transition-all"
                      >
                        {videoId && (
                          <img
                            src={getVideoThumbnail(videoId)}
                            alt="Video thumbnail"
                            className="w-32 h-18 object-cover rounded flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate flex items-center">
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                            {video}
                          </p>
                          {videoId && (
                            <p className="text-xs text-gray-500 mt-1">Video ID: {videoId}</p>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

