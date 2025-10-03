import time
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.chains import RetrievalQA


def build_rag_pipeline(vector_store):
    """Build a RetrievalQA pipeline from an in-memory FAISS vector store."""
    retriever = vector_store.as_retriever(search_kwargs={"k": 5})

    prompt = ChatPromptTemplate.from_template("""
You are an AI assistant that answers questions about YouTube content (single videos, multiple videos, or playlists).

Your job:
- Always use ONLY the provided transcript segments as your source of truth.
- Adapt your answer format depending on the user input type:
  1. **Single video**: Provide a clear, fluent narrative answer based only on that video. 
     - Organize by **timestamp ranges** (e.g., "0:00 - 1:00").
     - Mention speakers if available in transcript metadata.
     - End with citations in the format: [timestamp](video_url?t=TIMESTAMPs).
  2. **Multiple videos (different links)**: Compare and contrast across videos. 
     - Organize the answer by video, then within each video by **timestamp ranges**.
     - Highlight overlaps, differences, and unique insights.
     - Provide citations per video with the same format.
  3. **Playlist**: Treat it like an **index or summary across multiple videos**. 
     - Organize by **video title or link**, and within each video by **timestamp ranges**.
     - Provide a structured overview of key points for each video.
     - Conclude with an overall synthesis across the playlist if relevant.
- Ensure the final answer is fluent, narrative, and informative — not just transcript fragments.
- Be concise but detailed enough to capture the main ideas.
- If the question asks for a direct yes/no or fact-check, still provide supporting context from transcripts with timestamps.

Question: {question}

Relevant transcript segments:
{context}

Final Answer (adapted to single video / multiple videos / playlist, with timestamp ranges):
""")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    qa = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type="stuff",
        chain_type_kwargs={"prompt": prompt},
        return_source_documents=True,
    )

    return qa, retriever


def answer_question(
    question: str,
    qa,
    retriever,
    filter_metadata: dict = None,
    return_metadata: bool = False
):
    timings = {}
    total_start = time.perf_counter()

    # Retrieval
    start = time.perf_counter()
    if filter_metadata:
        docs = retriever.vectorstore.similarity_search(
            question, k=5, filter=filter_metadata
        )
    else:
        docs = retriever.invoke(question)
    timings["retrieval"] = time.perf_counter() - start

    # LLM response
    start = time.perf_counter()
    response = qa.invoke({"query": question})
    timings["llm_response"] = time.perf_counter() - start

    # Citations
# Citations
    start = time.perf_counter()
    citations = []
    source_videos = []
    for d in docs:
     meta = d.metadata
     video_url = meta.get("video_url")
     start_time = int(meta.get("start", 0))
     timestamp = f"{start_time // 60}:{start_time % 60:02d}"  # e.g. 2:45
    
     citations.append({
        "text": meta.get("title", "Unknown"),
        "timestamp": timestamp,
        "url": f"{video_url}&t={start_time}s" if video_url else None
    })
    source_videos.append(video_url)
    timings["citations_formatting"] = time.perf_counter() - start
    timings["total"] = time.perf_counter() - total_start

    print("⏱️ RAG pipeline timings:")
    for step, t in timings.items():
        print(f"   {step}: {t:.2f} sec")

    # ✅ Don't append citations into the answer text
    final_answer = response["result"]

    if return_metadata:
        return final_answer, {
            "citations": citations,
            "source_videos": list(set(source_videos)),
            "timings": timings,
        }
    else:
        return final_answer




