import time
from ingest import index_videos
from rag_pipeline import build_rag_pipeline, answer_question

if __name__ == "__main__":
    print("🎥 YouTube RAG CLI Demo")
    print("Enter one or more YouTube video/playlist links.")
    print("Separate multiple links with commas or spaces.\n")

    urls_input = input("Enter YouTube link(s): ").strip()
    urls = [u.strip() for u in urls_input.replace(",", " ").split() if u.strip()]

    if not urls:
        print("❌ No valid URLs entered. Exiting.")
        exit()

    # Indexing
    vector_store, report = index_videos(urls)
    print("\n✅ Indexing completed!")
    print(f"   Videos processed: {report['videos_count']}")
    print(f"   Raw snippets: {report['raw_snippets_count']}")
    print(f"   Final chunks: {report['chunks_count']}")
    print(f"   Total indexing time: {report['total_indexing']:.2f} sec")

    # Build pipeline (loads vector store from disk)
    qa, retriever = build_rag_pipeline(vector_store)

    # Chat loop
    while True:
        q = input("\nAsk a question (or 'exit'): ").strip()
        if q.lower() == "exit":
            print("👋 Goodbye!")
            break

        # Get answer + timings
        answer, timings = answer_question(q, qa, retriever)

        # Print result + timings
        print("\n--- Answer ---")
        print(answer)
        print("\n--- Timings ---")
        print(f"Retriever: {timings['retrieval']:.2f} sec")
        print(f"LLM response: {timings['llm_response']:.2f} sec")
        print(f"Citations formatting: {timings['citations_formatting']:.2f} sec")
        print(f"Full cycle: {timings['total']:.2f} sec")



