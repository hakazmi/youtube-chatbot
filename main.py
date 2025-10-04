from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ingest import index_videos
from rag_pipeline import build_rag_pipeline, answer_question
import shutil
import os
from typing import Optional

app = FastAPI(title="YouTube RAG Chatbot", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all origins for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variable for pipeline (store as tuple: (qa, retriever))
qa_pipeline = None
VECTOR_STORE_PATH = "vector_store"


class QuestionRequest(BaseModel):
    question: str
    mode: Optional[str] = None  # 'concise' | 'detailed' (optional)


class MultiIndexRequest(BaseModel):
    urls: list[str]


@app.post("/reset")
def reset_faiss():
    """Clear FAISS index and reset pipeline (used when frontend reloads)."""
    global qa_pipeline
    if os.path.exists(VECTOR_STORE_PATH):
        shutil.rmtree(VECTOR_STORE_PATH)
    qa_pipeline = None
    return {"status": "ok", "message": "FAISS store cleared. New session started."}


@app.post("/index_videos")
def index_videos_endpoint(req: MultiIndexRequest):
    """
    Accepts a list of video URLs and/or playlist URLs.
    Example body:
    { "urls": ["https://youtu.be/VID1","https://youtube.com/playlist?list=..."] }
    """
    global qa_pipeline
    try:
        # Always append to FAISS during session
        vector_store, timings, indexed_urls = index_videos(
            req.urls,
            persist_path=VECTOR_STORE_PATH,
            overwrite=False,
        )

        qa, retriever = build_rag_pipeline(vector_store)
        qa_pipeline = (qa, retriever)

        return {"status": "ok", "timings": timings, "indexed_urls": indexed_urls}

    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.post("/ask_question")
def ask_question(req: QuestionRequest):
    global qa_pipeline
    if qa_pipeline is None:
        return {"error": "No video indexed yet. Call /index_videos first."}
    try:
        stuff_chain, retriever = qa_pipeline

        # Map mode to retriever K (tune these)
        mode = (req.mode or "concise").lower()
        k = 5 if mode == "concise" else 8

        answer, metadata = answer_question(
            req.question, stuff_chain, retriever, return_metadata=True, k=k
        )
        return {
            "question": req.question,
            "answer": answer,
            "citations": metadata.get("citations", []),
            "source_videos": metadata.get("source_videos", []),
            "timings": metadata.get("timings", {}),
        }
    except Exception as e:
        return {"error": f"Failed to generate answer: {str(e)}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
