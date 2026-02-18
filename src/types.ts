export interface MurmrClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export type AudioFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface SpeechCreateOptions {
  input: string;
  /**
   * Pass either `voice` (a voice ID like 'voice_xxx') or `voice_clone_prompt`
   * (base64-encoded embedding data from /v1/voices/extract-embeddings).
   * If both are provided, voice_clone_prompt takes precedence.
   */
  voice: string;
  /** Base64-encoded embedding data from /v1/voices/extract-embeddings */
  voice_clone_prompt?: string;
  language?: string;
  response_format?: AudioFormat;
  webhook_url?: string;
}

export interface VoiceDesignOptions {
  input: string;
  voice_description: string;
  language?: string;
  response_format?: AudioFormat;
}

export interface VoiceSaveOptions {
  name: string;
  audio: Buffer;
  description: string;
  language?: string;
}

export interface SavedVoice {
  id: string;
  name: string;
  language: string;
  language_name: string;
  description: string;
  type: string;
  created_at: string;
  audio_preview_url?: string;
}

export interface VoiceListResponse {
  voices: SavedVoice[];
  saved_count: number;
  saved_limit: number;
  total: number;
}

export interface AsyncJobResponse {
  id: string;
  status: 'queued';
  created_at: string;
}

export interface JobStatus {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
  duration_ms?: number | null;
  error: string | null;
}

export interface LongFormOptions {
  input: string;
  /**
   * Pass either `voice` (a voice ID like 'voice_xxx') or `voice_clone_prompt`
   * (base64-encoded embedding data from /v1/voices/extract-embeddings).
   * If both are provided, voice_clone_prompt takes precedence.
   */
  voice: string;
  /** Base64-encoded embedding data from /v1/voices/extract-embeddings */
  voice_clone_prompt?: string;
  language?: string;
  response_format?: AudioFormat;
  chunkSize?: number;
  silenceBetweenChunksMs?: number;
  maxRetries?: number;
  startFromChunk?: number;
  onProgress?: (progress: LongFormProgress) => void;
}

export interface LongFormProgress {
  current: number;
  total: number;
  percent: number;
}

export interface LongFormResult {
  audio: Buffer;
  totalChunks: number;
  durationMs: number;
  format: AudioFormat;
  characterCount: number;
}

export interface SpeechStreamOptions {
  input: string;
  voice: string;
  voice_clone_prompt?: string;
  language?: string;
}

export interface VoiceDesignStreamOptions {
  input: string;
  voice_description: string;
  language?: string;
}

export interface AudioStreamChunk {
  /** Base64-encoded PCM audio data (24kHz, mono, 16-bit) */
  audio?: string;
  /** Alias for audio — some SSE events use 'chunk' instead */
  chunk?: string;
  chunk_index?: number;
  sample_rate?: number;
  format?: string;
  first_chunk_latency_ms?: number;
  /** True when the stream is complete */
  done?: boolean;
  total_chunks?: number;
  total_time_ms?: number;
  error?: string;
}

export interface WebhookPayload {
  id: string;
  status: 'completed' | 'failed';
  audio?: string;
  content_type?: string;
  response_format?: string;
  duration_ms?: number;
  total_time_ms?: number;
  error?: string;
}
