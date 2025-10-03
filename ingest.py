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
        resp = youtube.playlistItems().list(
            part="contentDetails,snippet",
            playlistId=playlist_id,
            maxResults=50,
            pageToken=nextPageToken,
        ).execute()
        items = resp.get("items", [])
        for it in items:
            vid = it["contentDetails"].get("videoId")
            title = it["snippet"]["title"]
            if vid:
                videos.append({
                    "id": vid,
                    "title": title,
                    "index": index_counter,
                    "playlist_id": playlist_id,
                })
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
            t = transcript_list.find_transcript(['en'])
            fetched = t.fetch()
            transcript = fetched.to_raw_data()
            return transcript, {"fetch_transcript": time.perf_counter() - start}
        except Exception as e:
            raise RuntimeError(f"No transcript available for {video_id}. {e}")

    except (TranscriptsDisabled, CouldNotRetrieveTranscript) as e:
        raise RuntimeError(f"Captions not available for {video_id}. {e}")


def index_videos(
    urls: List[str],
    persist_path: str = "vector_store",
    overwrite: bool = False,
) -> Tuple[FAISS, Dict, List[str]]:
    timings = {}
    total_start = time.perf_counter()
    indexed_urls = []  # To store individual video URLs

    # Collect all videos metadata
    videos = []
    for u in urls:
        u = u.strip()
        if "list=" in u or "/playlist" in u:
            pid = extract_playlist_id(u)
            videos.extend(get_video_ids_from_playlist(pid))
        else:
            vid = extract_video_id(u)
            videos.append({
                "id": vid,
                "title": f"Video {vid}",
                "index": None,
                "playlist_id": None,
            })

    print(f"Found {len(videos)} videos to index.")

    # Generate indexed_urls
    indexed_urls = [f"https://youtu.be/{v['id']}" for v in videos]

    docs = []
    fetch_times = []
    for v in videos:
        try:
            start = time.perf_counter()
            transcript, timing = fetch_transcript_for_video(v["id"])
            fetch_times.append(timing["fetch_transcript"])

            for snippet in transcript:
                text = clean_transcript(snippet["text"])
                docs.append({
                    "content": text,
                    "metadata": {
                        "video_id": v["id"],
                        "title": v["title"],
                        "video_url": f"https://youtu.be/{v['id']}",
                        "playlist_id": v.get("playlist_id"),
                        "index_in_playlist": v.get("index"),
                        "start": int(snippet["start"]),
                        "duration": float(snippet["duration"]),
                    }
                })

        except Exception as e:
            print(f"Warning: transcript fetch failed for {v['id']}: {e}")

    timings["fetch_transcripts_total"] = sum(fetch_times)
    timings["videos_count"] = len(videos)
    timings["raw_snippets_count"] = len(docs)

    if not docs:
        raise RuntimeError("No transcript snippets fetched for any provided URLs.")

    # Chunking
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunked_texts, chunked_metadatas = [], []
    for d in docs:
        pieces = splitter.split_text(d["content"])
        for p in pieces:
            chunked_texts.append(p)
            chunked_metadatas.append(d["metadata"])
    timings["chunks_count"] = len(chunked_texts)

    # Embeddings + FAISS
    embeddings = OpenAIEmbeddings()
    if overwrite or not os.path.exists(persist_path):
        vector_store = FAISS.from_texts(chunked_texts, embeddings, metadatas=chunked_metadatas)
    else:
        vector_store = FAISS.load_local(persist_path, embeddings, allow_dangerous_deserialization=True)
        vector_store.add_texts(chunked_texts, metadatas=chunked_metadatas)

    vector_store.save_local(persist_path)
    timings["total_indexing"] = time.perf_counter() - total_start
    timings["indexed_chunks"] = len(chunked_texts)

    print("Indexing completed. Timings:", timings)
    return vector_store, timings, indexed_urls






