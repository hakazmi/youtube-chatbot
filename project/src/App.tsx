import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';

function App() {
  const [indexedVideos, setIndexedVideos] = useState<string[]>([]);
  const [refreshChat, setRefreshChat] = useState(0);

  const handleNewChat = async () => {
    try {
      await fetch('http://localhost:8000/reset', {
        method: 'POST',
      });
      setIndexedVideos([]);
      setRefreshChat(prev => prev + 1);
    } catch (error) {
      console.error('Failed to reset:', error);
    }
  };

  const handleVideosIndexed = (urls: string[]) => {
    setIndexedVideos(prev => [...prev, ...urls]);
  };

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        onVideosIndexed={handleVideosIndexed}
        indexedVideos={indexedVideos}
        onNewChat={handleNewChat}
      />
      <ChatInterface
        key={refreshChat}
        hasIndexedVideos={indexedVideos.length > 0}
        onNewChat={handleNewChat}
      />
    </div>
  );
}

export default App;
