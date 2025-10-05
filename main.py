from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Tuple, Any, cast
import shutil
import os
import threading

from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

from ingest import index_videos
from rag_pipeline import build_rag_pipeline, answer_question

# -------------------- App & CORS --------------------
app = FastAPI(title="YouTube RAG Chatbot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only — restrict for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VECTOR_STORE_PATH = os.getenv("VECTOR_STORE_PATH", "vector_store")

# Cache in app.state (no module-level globals). Use cast() to keep Pylance happy.
app.state.pipeline_lock = threading.Lock()
app.state.pipeline = cast(Optional[Tuple[Any, Any]], None)  # (stuff_chain, retriever)
app.state.vs_mtime = cast(Optional[float], None)


# -------------------- Models --------------------
class QuestionRequest(BaseModel):
    question: str
    mode: Optional[str] = None  # 'concise' | 'detailed' (optional)


class MultiIndexRequest(BaseModel):
    urls: list[str]


# -------------------- Helpers --------------------
def _vector_store_files(path: str):
    return [
        os.path.join(path, "index.faiss"),
        os.path.join(path, "index.pkl"),
    ]


def _vector_store_exists(path: str) -> bool:
    if not os.path.isdir(path):
        return False
    return any(os.path.exists(f) for f in _vector_store_files(path))


def _vector_store_mtime(path: str) -> Optional[float]:
    if not _vector_store_exists(path):
        return None
    mtimes = [
        os.path.getmtime(f) for f in _vector_store_files(path) if os.path.exists(f)
    ]
    return max(mtimes) if mtimes else None


def _load_vector_store(path: str) -> FAISS:
    embeddings = OpenAIEmbeddings()
    return FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)


def _ensure_pipeline() -> Tuple[Any, Any]:
    """
    Lazily build or rebuild the (stuff_chain, retriever) from the on-disk FAISS store.
    """
    with app.state.pipeline_lock:
        on_disk_mtime = _vector_store_mtime(VECTOR_STORE_PATH)

        # Reuse cached pipeline if fresh
        if app.state.pipeline is not None and app.state.vs_mtime and on_disk_mtime:
            if app.state.vs_mtime == on_disk_mtime:
                return app.state.pipeline  # type: ignore[return-value]

        if not _vector_store_exists(VECTOR_STORE_PATH):
            raise RuntimeError(
                "No FAISS vector store found. Please call /index_videos first."
            )

        vs = _load_vector_store(VECTOR_STORE_PATH)
        stuff_chain, retriever = build_rag_pipeline(vs)

        app.state.pipeline = (stuff_chain, retriever)
        app.state.vs_mtime = on_disk_mtime
        return app.state.pipeline  # type: ignore[return-value]


# -------------------- Endpoints --------------------
@app.get("/status")
def status():
    return {
        "vector_store_path": VECTOR_STORE_PATH,
        "vector_store_exists": _vector_store_exists(VECTOR_STORE_PATH),
        "vector_store_mtime": _vector_store_mtime(VECTOR_STORE_PATH),
        "pipeline_cached": app.state.pipeline is not None,
    }


@app.post("/reset")
def reset_faiss():
    """Clear FAISS index and reset cached pipeline."""
    with app.state.pipeline_lock:
        if os.path.exists(VECTOR_STORE_PATH):
            shutil.rmtree(VECTOR_STORE_PATH)
        app.state.pipeline = cast(Optional[Tuple[Any, Any]], None)
        app.state.vs_mtime = cast(Optional[float], None)
    return {"status": "ok", "message": "FAISS store cleared. New session started."}


@app.post("/index_videos")
def index_videos_endpoint(req: MultiIndexRequest):
    """
    Accepts a list of video URLs and/or playlist URLs.
    Example body:
    { "urls": ["https://youtu.be/VID1","https://youtube.com/playlist?list=..."] }
    """
    try:
        vector_store, timings, indexed_urls = index_videos(
            req.urls,
            persist_path=VECTOR_STORE_PATH,
            overwrite=False,
        )

        # Immediately refresh pipeline cache from in-memory store
        stuff_chain, retriever = build_rag_pipeline(vector_store)
        with app.state.pipeline_lock:
            app.state.pipeline = (stuff_chain, retriever)
            app.state.vs_mtime = _vector_store_mtime(VECTOR_STORE_PATH)

        return {"status": "ok", "timings": timings, "indexed_urls": indexed_urls}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.post("/ask_question")
def ask_question(req: QuestionRequest):
    if not _vector_store_exists(VECTOR_STORE_PATH):
        return {"error": "No video indexed yet. Call /index_videos first."}

    try:
        stuff_chain, retriever = _ensure_pipeline()

        # Map mode to retriever K (tune if you like)
        # mode = (req.mode or "concise").lower()
        # k = 5 if mode == "concise" else 8
        k = 8
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


# -------------------- Main --------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
