import os
import time
from typing import List, Tuple, Dict
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
    CouldNotRetrieveTranscript,
)
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from googleapiclient.discovery import build
from utils import clean_transcript
from tqdm.auto import tqdm
from typing import Optional

load_dotenv()

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100


def extract_video_id(url: str) -> str:
    parsed = urlparse(url)
    if "youtube.com" in parsed.netloc:
        query = parse_qs(parsed.query)
        if "v" in query:
            return query["v"][0]
    if "youtu.be" in parsed.netloc:
        return parsed.path.lstrip("/")
    raise ValueError(f"Invalid YouTube video URL: {url}")


def extract_playlist_id(url: str) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if "list" in query:
        return query["list"][0]
    raise ValueError(f"Invalid YouTube playlist URL: {url}")


def get_video_ids_from_playlist(playlist_id: str) -> List[Dict]:
    """Return list of dicts {id, title, index, playlist_id}"""
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY not set in environment (.env)")

    youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    videos = []
    nextPageToken = None
    index_counter = 0

    while True:
        resp = (
            youtube.playlistItems()
            .list(
                part="contentDetails,snippet",
                playlistId=playlist_id,
                maxResults=50,
                pageToken=nextPageToken,
            )
            .execute()
        )
        items = resp.get("items", [])
        for it in items:
            vid = it["contentDetails"].get("videoId")
            title = it["snippet"]["title"]
            if vid:
                videos.append(
                    {
                        "id": vid,
                        "title": title,
                        "index": index_counter,
                        "playlist_id": playlist_id,
                    }
                )
                index_counter += 1
        nextPageToken = resp.get("nextPageToken")
        if not nextPageToken:
            break

    return videos


def fetch_transcript_for_video(video_id: str) -> Tuple[list, Dict]:
    """Fetch transcript. Returns (list of dicts, timing dict)."""
    start = time.perf_counter()
    try:
        # Directly fetch transcript using the API instance
        ytt = YouTubeTranscriptApi()
        fetched_transcript = ytt.fetch(video_id, languages=["en"])
        # Convert FetchedTranscript to raw data (list of dicts)
        transcript = fetched_transcript.to_raw_data()
        return transcript, {"fetch_transcript": time.perf_counter() - start}

    except NoTranscriptFound:
        # Fallback: list + find_transcript + fetch
        try:
            ytt = YouTubeTranscriptApi()
            transcript_list = ytt.list(video_id)
            t = transcript_list.find_transcript(["en"])
            fetched = t.fetch()
            transcript = fetched.to_raw_data()
            return transcript, {"fetch_transcript": time.perf_counter() - start}
        except Exception as e:
            raise RuntimeError(f"No transcript available for {video_id}. {e}")

    except (TranscriptsDisabled, CouldNotRetrieveTranscript) as e:
        raise RuntimeError(f"Captions not available for {video_id}. {e}")


from tqdm.auto import tqdm  # add at top of ingest.py


def index_videos(
    urls: List[str],
    persist_path: str = "vector_store",
    overwrite: bool = False,
    show_progress: bool = True,
    batch_size: int = 256,
) -> Tuple[FAISS, Dict, List[str]]:
    timings: Dict = {}
    total_start = time.perf_counter()
    indexed_urls: List[str] = []

    # -------- 1) Collect all videos from the provided URLs --------
    videos: List[Dict] = []
    for raw in urls:
        u = raw.strip()
        if not u:
            continue
        try:
            if "list=" in u or "/playlist" in u:
                # playlist
                pid = extract_playlist_id(u)
                videos.extend(get_video_ids_from_playlist(pid))
            else:
                # single video
                vid = extract_video_id(u)
                videos.append(
                    {
                        "id": vid,
                        "title": f"Video {vid}",
                        "index": None,
                        "playlist_id": None,
                    }
                )
        except Exception as e:
            print(f"Warning: skipping URL '{u}': {e}")

    print(f"Found {len(videos)} videos to index.")
    indexed_urls = [f"https://youtu.be/{v['id']}" for v in videos]

    # -------- 2) Fetch transcripts and build raw docs --------
    docs: List[Dict] = []
    fetch_times: List[float] = []
    seen_snippets: set[tuple[str, int]] = set()  # (video_id, start)

    video_iter = videos
    if show_progress:
        video_iter = tqdm(videos, desc="Fetching transcripts", unit="video")

    for v in video_iter:
        try:
            transcript, timing = fetch_transcript_for_video(v["id"])
            fetch_times.append(timing["fetch_transcript"])

            for snip in transcript:
                start_s = int(snip["start"])
                key = (v["id"], start_s)
                if key in seen_snippets:
                    continue
                seen_snippets.add(key)

                text = clean_transcript(snip["text"])
                docs.append(
                    {
                        "content": text,
                        "metadata": {
                            "video_id": v["id"],
                            "title": v.get("title") or f"Video {v['id']}",
                            "video_url": f"https://youtu.be/{v['id']}",
                            "playlist_id": v.get("playlist_id"),
                            "index_in_playlist": v.get("index"),
                            "start": start_s,
                            "end": start_s + int(float(snip.get("duration", 0))),
                            "duration": float(snip.get("duration", 0)),
                            "lang": "en",
                        },
                    }
                )
        except Exception as e:
            print(f"Warning: transcript fetch failed for {v.get('id')}: {e}")

    timings["fetch_transcripts_total"] = sum(fetch_times)
    timings["videos_count"] = len(videos)
    timings["raw_snippets_count"] = len(docs)

    if not docs:
        raise RuntimeError("No transcript snippets fetched for any provided URLs.")

    # -------- 3) Chunking (sentence-aware separators) --------
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", "? ", "! ", ", ", " "],
    )

    chunked_texts: List[str] = []
    chunked_metadatas: List[Dict] = []

    doc_iter = docs
    if show_progress:
        doc_iter = tqdm(docs, desc="Chunking snippets", unit="snippet")

    for d in doc_iter:
        pieces = splitter.split_text(d["content"])
        # Update by number of pieces (optional; gives better feel of work done)
        if show_progress and len(pieces) > 1 and hasattr(doc_iter, "update"):
            # we already advanced by 1 for this snippet; add the extra
            try:
                doc_iter.update(len(pieces) - 1)
            except Exception:
                pass
        for p in pieces:
            chunked_texts.append(p)
            chunked_metadatas.append(d["metadata"])

    timings["chunks_count"] = len(chunked_texts)
    timings["indexed_chunks"] = len(chunked_texts)

    # -------- 4) Embeddings + FAISS (batched with progress) --------
    embeddings = OpenAIEmbeddings()

    # Helper to add a batch into a (possibly new) FAISS index
    def _add_batch_to_index(
        vs: Optional[FAISS],
        texts: List[str],
        metas: List[Dict],
    ) -> FAISS:
        if vs is None:
            return FAISS.from_texts(texts, embeddings, metadatas=metas)
        else:
            vs.add_texts(texts, metadatas=metas)
            return vs

    vector_store: Optional[FAISS] = None

    if not overwrite and os.path.exists(persist_path):
        vector_store = FAISS.load_local(
            persist_path,
            embeddings,
            allow_dangerous_deserialization=True,
        )

    total_chunks = len(chunked_texts)
    if total_chunks == 0:
        raise RuntimeError("No chunks produced; nothing to embed/index.")

    batch_iter = range(0, total_chunks, batch_size)
    if show_progress:
        batch_iter = tqdm(
            batch_iter,
            total=((total_chunks - 1) // batch_size + 1),
            desc="Embedding + indexing",
            unit="batch",
        )

    for i in batch_iter:
        batch_texts = chunked_texts[i : i + batch_size]
        batch_metas = chunked_metadatas[i : i + batch_size]
        vector_store = _add_batch_to_index(vector_store, batch_texts, batch_metas)

    # -------- 5) Save index (with a small progress bar) --------
    if show_progress:
        with tqdm(total=1, desc="Saving index", unit="step") as pbar:
            vector_store.save_local(persist_path)
            pbar.update(1)
    else:
        vector_store.save_local(persist_path)

    timings["total_indexing"] = time.perf_counter() - total_start

    print("Indexing completed. Timings:", timings)
    return vector_store, timings, indexed_urls
