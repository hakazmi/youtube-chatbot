import { useState } from 'react';
import { Youtube, Plus, Loader2, PlusCircle, MessageSquarePlus, Video, X } from 'lucide-react';
import { extractVideoId, getVideoThumbnail } from '../utils/youtube';

interface SidebarProps {
  onVideosIndexed: (urls: string[]) => void;
  indexedVideos: string[];
  onNewChat: () => void;
}

const API_BASE_URL = 'http://localhost:8000';

export default function Sidebar({ onVideosIndexed, indexedVideos, onNewChat }: SidebarProps) {
  const [currentUrl, setCurrentUrl] = useState('');
  const [urlList, setUrlList] = useState<string[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddUrl = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentUrl.trim().length > 0) {
        setUrlList([...urlList, currentUrl.trim()]);
        setCurrentUrl('');
      }
    }
  };

  const handleRemoveUrl = (index: number) => {
    setUrlList(urlList.filter((_, i) => i !== index));
  };

  const handleIndexVideos = async () => {
    setError(null);
    setSuccess(null);

    if (urlList.length === 0) {
      setError('Please enter at least one YouTube URL');
      return;
    }

    setIsIndexing(true);

    try {
      const response = await fetch(`${API_BASE_URL}/index_videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: urlList,
        }),
      });

      const data = await response.json();

      if (data.status === 'ok') {
        const indexedCount = data.indexed_urls?.length || urlList.length;
        setSuccess(`Successfully indexed ${indexedCount} video(s)!`);
        onVideosIndexed(data.indexed_urls || urlList);
        setUrlList([]); // clear after indexing
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.detail || 'Failed to index videos');
      }
    } catch (err) {
      setError('Failed to connect to the server.');
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
            <Youtube className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">YouTube Chatbot</h1>
            <p className="text-xs text-gray-500">Chat with videos</p>
          </div>
        </div>
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border-2 border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-all font-medium text-sm"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
            <PlusCircle className="w-4 h-4 mr-2 text-red-600" />
            Add YouTube Videos
          </h2>

          {/* Input box for one link at a time */}
          <input
            type="text"
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            onKeyDown={handleAddUrl}
            placeholder="Paste a YouTube video/playlist URL and press Enter"
            disabled={isIndexing}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {/* Show entered URLs */}
          {urlList.length > 0 && (
            <div className="mt-3 space-y-2">
              {urlList.map((url, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded px-2 py-1"
                >
                  <p className="text-xs text-gray-600 truncate">{url}</p>
                  <button onClick={() => handleRemoveUrl(idx)} className="text-red-500 hover:text-red-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleIndexVideos}
            disabled={isIndexing || urlList.length === 0}
            className="w-full mt-3 flex items-center justify-center space-x-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {isIndexing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Add to Chat</span>
              </>
            )}
          </button>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-xs">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-700 text-xs">{success}</p>
            </div>
          )}
        </div>

        {indexedVideos.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <Video className="w-4 h-4 mr-2 text-red-600" />
              Your Videos ({indexedVideos.length})
            </h3>
            <div className="space-y-2">
              {indexedVideos.map((url, idx) => {
                const videoId = extractVideoId(url);
                return (
                  <div
                    key={idx}
                    className="bg-white border border-gray-200 rounded-lg p-2 hover:border-red-300 transition-colors"
                  >
                    {videoId && (
                      <img
                        src={getVideoThumbnail(videoId)}
                        alt="Video thumbnail"
                        className="w-full h-20 object-cover rounded mb-2"
                      />
                    )}
                    <p className="text-xs text-gray-600 truncate">{url}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


