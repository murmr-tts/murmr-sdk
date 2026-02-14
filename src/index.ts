export { MurmrClient } from './client';
export { MurmrError, MurmrChunkError } from './errors';
export { splitIntoChunks } from './chunker';
export { concatenateAudio, generateSilence, createWavHeader, WAV_HEADER_SIZE, SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE, BYTES_PER_SAMPLE } from './audio-concat';
export type {
  MurmrClientOptions,
  AudioFormat,
  SpeechCreateOptions,
  VoiceDesignOptions,
  VoiceSaveOptions,
  SavedVoice,
  VoiceListResponse,
  AsyncJobResponse,
  JobStatus,
  LongFormOptions,
  LongFormProgress,
  LongFormResult,
  WebhookPayload,
} from './types';
