export interface MurmrClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export type AudioFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface SpeechCreateOptions {
  /** Text to synthesize. Mapped to the API's `text` field. Max 4,096 characters. */
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
  /** Text to synthesize. Max 4,096 characters. */
  input: string;
  voice_description: string;
  language?: string;
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
  /** Base64-encoded audio data, present when status is 'completed' */
  audio_base64?: string;
  /** Content type of the audio (e.g., 'audio/wav'), present when status is 'completed' */
  content_type?: string;
  /** Audio format used (e.g., 'wav'), present when status is 'completed' */
  response_format?: string;
}

export interface LongFormOptions {
  /** Text to synthesize. Can be any length — the SDK handles chunking automatically. */
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
  characterCount: number;
}

export interface SpeechStreamOptions {
  /** Text to synthesize. Max 4,096 characters. */
  input: string;
  voice: string;
  voice_clone_prompt?: string;
  language?: string;
}

export interface VoiceDesignStreamOptions {
  /** Text to synthesize. Max 4,096 characters. */
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

export interface SavedVoice {
  id: string;
  name: string;
  description: string;
  language: string;
  language_name?: string;
  audio_preview_url: string | null;
  created_at: string;
}

export interface VoiceListResponse {
  voices: SavedVoice[];
  saved_count: number;
  saved_limit: number;
  total: number;
}

export interface VoiceSaveOptions {
  name: string;
  audio: Uint8Array | Buffer;
  description: string;
  language?: string;
}

export interface VoiceSaveResponse {
  id: string;
  name: string;
  language: string;
  description: string;
  prompt_size_bytes: number;
  created_at: string;
  success: boolean;
  has_audio_preview: boolean;
}

export interface VoiceDeleteResponse {
  success: boolean;
  id: string;
  message: string;
}
