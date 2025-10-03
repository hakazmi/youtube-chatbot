from youtube_transcript_api import YouTubeTranscriptApi

def extract_video_id(url: str) -> str:
    """Extract video ID from YouTube URL."""
    if "youtu.be/" in url:
        return url.split("youtu.be/")[1].split("?")[0]
    elif "v=" in url:
        return url.split("v=")[1].split("&")[0]
    else:
        raise ValueError("Invalid YouTube URL")

def test_fetch(video_url: str):
    video_id = extract_video_id(video_url)
    print(f"🎥 Testing transcript fetch for video ID: {video_id}\n")

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id)

        print(f"✅ Transcript fetched successfully for {video_id}")
        print(f"- Language: {transcript.language}")
        print(f"- Generated: {transcript.is_generated}")
        print(f"- Snippets count: {len(transcript.snippets)}\n")

        # Show first 5 snippets
        for snippet in transcript.snippets[:5]:
            print(f"[{snippet.start:.2f}s - {snippet.start + snippet.duration:.2f}s] {snippet.text}")

    except Exception as e:
        print(f"❌ Error fetching transcript: {e}")

if __name__ == "__main__":
    url = input("Enter YouTube video URL: ").strip()
    test_fetch(url)
