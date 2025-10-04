import re


def clean_transcript(text: str) -> str:
    """Normalize whitespace; keep punctuation; strip leading/trailing spaces."""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def format_citations(docs):
    """Format retrieved docs into citations with timestamps."""
    citations = []
    for d in docs:
        ts = d.metadata.get("start", "N/A")
        url = d.metadata.get("url", "")
        citations.append(f"[{ts}]({url}&t={int(ts)}s)")
    return " ".join(citations)
