# 🎥 YouTube RAG Chatbot

This project is an **AI-powered chatbot** that allows you to interact with **YouTube videos, playlists, or multiple video links** by asking natural language questions.  
It uses **LangChain, FAISS, and OpenAI GPT models** to retrieve transcript segments and generate fluent, contextual answers with **timestamped citations** that link directly to YouTube.

---

## 🚀 Project Overview

- **Backend (FastAPI + LangChain + FAISS + OpenAI API)**
  - Extracts transcripts from YouTube videos use youtube-transcript-Api.
  - Stores transcripts in a **FAISS vector store** for efficient retrieval.
  - Runs a **RAG pipeline (Retrieval-Augmented Generation)** using OpenAI’s GPT model.
  - Returns structured answers **with citations** (clickable YouTube timestamps).

- **Frontend (React + TypeScript + Vite)**
  - Clean chat interface where you can ask questions.
  - Sidebar to input YouTube video/playlist URLs and index them.
  - Displays answers with citations in styled boxes.

- **Dockerized Setup**
  - Backend runs on **http://127.0.0.1:8000**
  - Frontend runs on **http://localhost:5173**
  - Fully isolated with `docker-compose`.

---

## ⚙️ How It Works

1. **Indexing Phase**
   - Enter one or more YouTube links in the sidebar.
   - The backend fetches transcripts using `youtube-transcript-api`.
   - Transcripts are chunked and stored in a FAISS vector database.

2. **Chatting Phase**
   - Ask any question in the chat interface.
   - Backend retrieves the most relevant transcript segments.
   - OpenAI GPT generates a narrative answer:
     - For **single video** → structured by timestamps.
     - For **multiple videos** → compare/contrast across sources.
     - For **playlists** → summarize across videos.
   - Answers include **clickable citations** to the original video.

---

## 🛠️ Local Setup (Without Docker)

### 1. Clone the repositor

- git clone https://github.com/yourusername/youtube-chatbot.git
- cd youtube-chatbot
  
### 2. Create and activate a virtual environment
- python -m venv youtubee
- source youtubee/bin/activate   # Linux/Mac
- youtubee\Scripts\activate      # Windows

### 3. Install backend dependencies
- pip install -r requirements.txt

### 4. Install frontend dependencies
- cd project
- npm install

### 5. Create a .env file in the project root
- OPENAI_API_KEY=your_openai_api_key_here
- YOUTUBE_API_KEY=your_youtube_api_key_here

### 6. Run backend (FastAPI)
- uvicorn main:app --reload --host 127.0.0.1 --port 8000

### 7. Run frontend (Vite)
- cd project
- npm run dev

- Frontend: http://localhost:5173
- Backend: http://127.0.0.1:8000

## 🐳 Running with Docker

### 1. Build and start containers
- docker-compose build
- docker-compose up -d

### 2. Check logs
- docker-compose logs -f

### 3. Access services
- Frontend → http://localhost:5173
- Backend → http://127.0.0.1:8000

### 4. Stopping services
- docker-compose down

## 📂 Project Structure

youtube_chatbot/
│── main.py                 # FastAPI backend entry
│── rag_pipeline.py         # RAG pipeline with LangChain + OpenAI
│── requirements.txt        # Python dependencies
│── docker-compose.yml      # Docker services config
│── backend.Dockerfile      # Backend Dockerfile
│── project/                # Frontend React app
│   │── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── ...
│   │── package.json
│   │── frontend.Dockerfile
│── .env                    # API keys (not committed to Git)
│── .gitignore              # Ignore venv, node_modules, etc.


## ✨ Features
- Index single/multiple YouTube videos or playlists
- Ask questions and get AI-generated answers
- Structured answers with timestamps + citations
- Compare/contrast across multiple videos
- Dockerized for easy setup



   







