export { MurmrClient } from './client';
export { MurmrError, MurmrChunkError } from './errors';
export { splitIntoChunks } from './chunker';
export { parseSSEStream, collectStreamAsWav, collectStreamAsPcm } from './streaming';
export { concatenateAudio, generateSilence, createWavHeader, WAV_HEADER_SIZE, SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE, BYTES_PER_SAMPLE } from './audio-concat';
export { MAX_INPUT_LENGTH } from './validate';
export type { CreateAndWaitOptions } from './resources/speech';
export type {
  MurmrClientOptions,
  AudioFormat,
  SpeechCreateOptions,
  SpeechStreamOptions,
  VoiceDesignOptions,
  VoiceDesignStreamOptions,
  AsyncJobResponse,
  JobStatus,
  AudioStreamChunk,
  LongFormOptions,
  LongFormProgress,
  LongFormResult,
  WebhookPayload,
  SavedVoice,
  VoiceListResponse,
  VoiceSaveOptions,
  VoiceSaveResponse,
  VoiceDeleteResponse,
} from './types';
