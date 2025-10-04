export interface Citation {
    ref_id: string;        // "#1"
    video_tag: string;     // "V1"
    video_title: string;
    timestamp: string;     // "MM:SS"
    url: string;           // robust ?t=...s
    snippet?: string;
    score?: number | null;
    video_url?: string;
    start?: number;
    used?: boolean;        // true if referenced in the answer headings
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
    sourceVideos?: string[];
    isStreaming?: boolean;
    timings?: Record<string, number>;
}
