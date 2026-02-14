/**
 * Long-form audio generation engine.
 * Handles chunking, sequential generation, retry, progress, and concatenation.
 */

import type { MurmrClient } from './client';
import type { LongFormOptions, LongFormResult, AudioFormat } from './types';
import { MurmrChunkError } from './errors';
import { splitIntoChunks } from './chunker';
import { concatenateAudio, WAV_HEADER_SIZE, SAMPLE_RATE, CHANNELS, BYTES_PER_SAMPLE } from './audio-concat';

const DEFAULT_CHUNK_SIZE = 3500;
const DEFAULT_SILENCE_MS = 400;
const DEFAULT_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createLongForm(
  client: MurmrClient,
  options: LongFormOptions,
): Promise<LongFormResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const silenceMs = options.silenceBetweenChunksMs ?? DEFAULT_SILENCE_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const format: AudioFormat = options.response_format ?? 'wav';

  const chunks = splitIntoChunks(options.input, chunkSize);
  if (chunks.length === 0) {
    return {
      audio: Buffer.alloc(0),
      totalChunks: 0,
      durationMs: 0,
      format,
      characterCount: 0,
    };
  }

  const audioChunks: Buffer[] = [];
  let totalCharacters = 0;

  for (let i = 0; i < chunks.length; i++) {
    let lastError: Error | null = null;
    let succeeded = false;

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        const audio = await client.request('/v1/audio/speech/batch', {
          method: 'POST',
          body: JSON.stringify({
            text: chunks[i],
            voice_clone_prompt: options.voice,
            language: options.language || 'English',
            response_format: format,
          }),
        });

        const arrayBuffer = await audio.arrayBuffer();
        audioChunks.push(Buffer.from(arrayBuffer));
        totalCharacters += chunks[i].length;
        succeeded = true;

        options.onProgress?.({
          current: i + 1,
          total: chunks.length,
          percent: Math.round(((i + 1) / chunks.length) * 100),
        });

        break;
      } catch (err) {
        lastError = err as Error;
        if (retry < maxRetries) {
          await sleep(1000 * Math.pow(2, retry));
        }
      }
    }

    if (!succeeded) {
      throw new MurmrChunkError(
        `Chunk ${i + 1}/${chunks.length} failed after ${maxRetries + 1} attempts`,
        {
          chunkIndex: i,
          completedChunks: i,
          totalChunks: chunks.length,
          cause: lastError || undefined,
        },
      );
    }
  }

  const concatenated = concatenateAudio(audioChunks, format, silenceMs);

  return {
    audio: concatenated,
    totalChunks: chunks.length,
    durationMs: estimateDurationMs(concatenated, format),
    format,
    characterCount: totalCharacters,
  };
}

function estimateDurationMs(audio: Buffer, format: AudioFormat): number {
  const bytesPerSecond = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  if (format === 'wav') {
    const dataSize = audio.length - WAV_HEADER_SIZE;
    return Math.round((dataSize / bytesPerSecond) * 1000);
  }
  if (format === 'pcm') {
    return Math.round((audio.length / bytesPerSecond) * 1000);
  }
  return 0;
}
