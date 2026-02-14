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
  const startFrom = options.startFromChunk ?? 0;

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
  let totalDurationMs = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Skip chunks before startFromChunk (still report progress)
    if (i < startFrom) {
      options.onProgress?.({
        current: i + 1,
        total: chunks.length,
        percent: Math.round(((i + 1) / chunks.length) * 100),
      });
      continue;
    }

    let lastError: Error | null = null;
    let succeeded = false;

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        const audio = await client.request('/v1/audio/speech/batch', {
          method: 'POST',
          body: JSON.stringify({
            text: chunks[i],
            ...(options.voice_clone_prompt
              ? { voice_clone_prompt: options.voice_clone_prompt }
              : { voice: options.voice }),
            language: options.language || 'English',
            response_format: format,
          }),
        });

        const durationHeader = audio.headers.get('X-Audio-Duration-Ms');
        if (durationHeader) {
          totalDurationMs += parseInt(durationHeader, 10) || 0;
        }

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
    durationMs: totalDurationMs > 0 ? totalDurationMs : estimateDurationMs(concatenated, format),
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
