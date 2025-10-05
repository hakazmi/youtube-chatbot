import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  const [indexedVideos, setIndexedVideos] = useState<string[]>([]);
  const [refreshChat, setRefreshChat] = useState(0);

  const handleNewChat = async () => {
    try {
      await fetch(`${API_BASE_URL}/reset`, { method: 'POST' });
    } catch (error) {
      console.warn('Reset failed (continuing locally):', error);
    }
    setIndexedVideos([]);
    setRefreshChat((prev) => prev + 1);
  };

  const handleVideosIndexed = (urls: string[]) => {
    setIndexedVideos((prev) => Array.from(new Set([...prev, ...(urls || [])])));
  };

  return (
    <div className="app-bg h-screen flex">
      <Sidebar
        onVideosIndexed={handleVideosIndexed}
        indexedVideos={indexedVideos}
        onNewChat={handleNewChat}
      />
      <ChatInterface
        key={refreshChat}
        hasIndexedVideos={indexedVideos.length > 0}
        onVideosIndexed={handleVideosIndexed}  // <-- pass through
      />
    </div>
  );
}

export default App;
