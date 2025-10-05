# rag_pipeline.py
import re
import time
from typing import Dict, Tuple, List, Optional
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.schema import Document


# -------- helpers --------
def _ts(sec: int) -> str:
    sec = max(0, int(sec))
    return f"{sec // 60}:{sec % 60:02d}"


def _add_ts(url: str, start_sec: int) -> str:
    u = urlparse(url)
    q = parse_qs(u.query)
    q["t"] = [f"{int(start_sec)}s"]
    new_query = urlencode(q, doseq=True)
    return urlunparse((u.scheme, u.netloc, u.path, u.params, new_query, u.fragment))


def _build_video_tags(docs: List[Document]) -> Dict[str, str]:
    """Stable order of video ids to tags V1, V2, ..."""
    tags: Dict[str, str] = {}
    order: List[str] = []
    for d in docs:
        vid = (d.metadata or {}).get("video_id", "unknown")
        if vid not in tags:
            order.append(vid)
            tags[vid] = f"V{len(order)}"
    return tags


def _doc_with_bracket_prefix(d: Document, ref_id: str, vtag: str) -> Document:
    s = int(d.metadata.get("start", 0))
    e = int(d.metadata.get("end", s + int(d.metadata.get("duration", 0))))
    prefix = f"[{ref_id} {vtag} {_ts(s)}–{_ts(e)}] "
    return Document(page_content=prefix + d.page_content, metadata=d.metadata)


def _build_used_order(
    answer: str, refs: List[str], fallback_timestamps: List[str]
) -> List[str]:
    """Return ref_ids in the order the model used them. Fallback by timestamps."""
    order: List[str] = []

    # Prefer explicit [#N] tokens
    for m in re.finditer(r"\[#(\d+)\]", answer):
        rid = f"#{m.group(1)}"
        if rid in refs and rid not in order:
            order.append(rid)
    if order:
        return order

    # Fallback: by timestamps (MM:SS) in the answer
    used_ts: List[str] = []
    for m in re.finditer(r"\b(\d{1,2}:\d{2})\b", answer):
        t = m.group(1)
        if t not in used_ts:
            used_ts.append(t)

    for t in used_ts:
        for rid, ts in zip(refs, fallback_timestamps):
            if ts == t and rid not in order:
                order.append(rid)
                break
    return order


# -------- prompt --------

BASE_PROMPT = ChatPromptTemplate.from_template(
    """
You are an AI assistant that answers questions about YouTube content.

You will receive transcript segments prefixed like: "[#N VX MM:SS–MM:SS] text…"
- #N is a unique reference id.
- VX is the video tag (V1, V2, …).
- MM:SS–MM:SS is the exact time range.

Write the answer using ONLY this context. Never add links in the text.

If the context includes segments from MULTIPLE videos (i.e., more than one VX tag appears):
  1) Produce 3–6 numbered points.
  2) Each point should be a synthesis across videos (merge overlaps, highlight differences).
  3) Keep each point to 1–3 sentences.
  4) End that point with a new line starting with:
     Evidence: [#N VX MM:SS–MM:SS], [#M VY MM:SS–MM:SS], …
     (Only include the #refs you actually used. Keep the exact bracket format.)
Else (mostly a single video):
  - Use timestamped micro-headings: "[#N VX MM:SS–MM:SS] • Short label"
  - Beneath each heading, write 1–2 sentences tied to that specific segment.

General rules:
- Use the exact timestamps and #refs you see; do not invent/reformat.
- If something is uncertain or missing, say so and point to the nearest #ref.
- Be concise (≈200–250 words total) unless the question demands more.

Question:
{question}

Context (each line begins with a bracketed reference):
{context}

Write the final answer now.
"""
)


def build_rag_pipeline(vector_store, k: int = 10):
    """Returns (stuff_chain, retriever). Retrieval happens in answer_question()."""
    # Diversify results for better cross-video coverage
    try:
        retriever = vector_store.as_retriever(
            search_type="mmr",
            search_kwargs={"k": k, "fetch_k": max(20, k * 4), "lambda_mult": 0.5},
        )
    except Exception:
        # Fallback if MMR not available for this vectorstore build
        retriever = vector_store.as_retriever(search_kwargs={"k": k})

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.4)
    stuff_chain = create_stuff_documents_chain(llm=llm, prompt=BASE_PROMPT)
    return stuff_chain, retriever


def _build_citations(
    docs: List[Document],
    ref_ids: List[str],
    video_tags: Dict[str, str],
    used_order: List[str],
):
    """Return (citations_sorted, source_videos). Adds 'ref_id', 'video_tag', 'used'."""
    items = []
    for d, ref_id in zip(docs, ref_ids):
        m = d.metadata or {}
        url = m.get("video_url", "")
        start = int(m.get("start", 0))
        vid = m.get("video_id", "unknown")
        items.append(
            {
                "ref_id": ref_id,
                "video_tag": video_tags.get(vid, "V?"),
                "video_title": m.get("title", "Unknown"),
                "timestamp": _ts(start),
                "url": _add_ts(url, start),
                "snippet": (
                    d.page_content[:140] + ("…" if len(d.page_content) > 140 else "")
                ),
                "score": getattr(d, "score", None),
                "video_url": url,
                "start": start,
                "used": False,
            }
        )

    ref_to_item = {c["ref_id"]: c for c in items}

    used_first = []
    for rid in used_order:
        if rid in ref_to_item and not ref_to_item[rid]["used"]:
            ref_to_item[rid]["used"] = True
            used_first.append(ref_to_item[rid])

    others = [c for c in items if not c["used"]]
    others.sort(key=lambda x: (x["video_tag"], x["start"]))
    citations_sorted = used_first + others

    source_videos = []
    seen = set()
    for c in citations_sorted:
        if c["video_url"] and c["video_url"] not in seen:
            source_videos.append(c["video_url"])
            seen.add(c["video_url"])
    return citations_sorted, source_videos


def answer_question(
    question: str,
    stuff_chain,
    retriever,
    return_metadata: bool = False,
    k: Optional[int] = None,
):
    timings: Dict = {}
    total_start = time.perf_counter()

    # 1) Retrieval
    start = time.perf_counter()
    if k is not None and hasattr(retriever, "vectorstore"):
        docs: List[Document] = retriever.vectorstore.similarity_search(question, k=k)
    else:
        docs: List[Document] = retriever.invoke(question)
    timings["retrieval"] = time.perf_counter() - start

    if not docs:
        final_answer = "I couldn't find relevant transcript segments for that question."
        meta = {
            "citations": [],
            "source_videos": [],
            "timings": {"total": time.perf_counter() - total_start},
        }
        return (final_answer, meta) if return_metadata else final_answer

    # Stable tags and reference ids
    video_tags = _build_video_tags(docs)
    ref_ids = [f"#{i+1}" for i in range(len(docs))]

    # 2) LLM — prefix docs with bracket so it copies exact timestamps + video tag
    start = time.perf_counter()
    docs_for_llm = [
        _doc_with_bracket_prefix(
            d,
            ref_id=rid,
            vtag=video_tags.get((d.metadata or {}).get("video_id", "unknown"), "V?"),
        )
        for d, rid in zip(docs, ref_ids)
    ]
    final_answer: str = stuff_chain.invoke(
        {"context": docs_for_llm, "question": question}
    )
    timings["llm_response"] = time.perf_counter() - start

    # 3) Citations — detect which refs were used in the answer (used-first)
    used_order = _build_used_order(
        final_answer,
        refs=ref_ids,
        fallback_timestamps=[_ts(int(d.metadata.get("start", 0))) for d in docs],
    )

    start = time.perf_counter()
    citations, source_videos = _build_citations(docs, ref_ids, video_tags, used_order)
    timings["citations_formatting"] = time.perf_counter() - start
    timings["total"] = time.perf_counter() - total_start

    if return_metadata:
        return final_answer, {
            "citations": citations,
            "source_videos": source_videos,
            "timings": timings,
        }
    return final_answer
