# API Configuration

The frontend is configured to connect to your FastAPI backend at `http://localhost:8000`.

## Backend Setup

Make sure your FastAPI server is running on port 8000 before using the application.

## API Endpoints Used

- `POST /index_videos` - Index YouTube videos or playlists (incremental indexing)
- `POST /ask_question` - Ask questions about indexed content
- `POST /reset` - Clear FAISS index and start a new chat session

## Key Features

### Incremental Indexing
- Users can add new videos at any time during a session
- New videos are appended to the existing FAISS index (not overwriting)
- No need to re-index previously added videos

### New Chat Feature
- Click "New Chat" button to reset the FAISS index
- Starts a fresh session without any indexed videos
- Clears all chat history

### Video Thumbnails
- Automatically displays YouTube video thumbnails in:
  - Sidebar (indexed videos list)
  - Chat messages (source videos and citations)
- Uses YouTube's image CDN for high-quality thumbnails

## Changing the API URL

If your backend runs on a different host or port, update the `API_BASE_URL` constant in:
- `src/components/Sidebar.tsx`
- `src/components/ChatInterface.tsx`
