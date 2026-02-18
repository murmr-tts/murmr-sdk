/**
 * Long-form audio generation engine.
 * Handles chunking, sequential generation via streaming endpoint,
 * retry with Retry-After support, progress reporting, and concatenation.
 */

import type { MurmrClient } from './client';
import type { LongFormOptions, LongFormResult } from './types';
import { MurmrError, MurmrChunkError } from './errors';
import { splitIntoChunks } from './chunker';
import { createWavHeader, generateSilence, SAMPLE_RATE, CHANNELS, BYTES_PER_SAMPLE } from './audio-concat';
import { collectStreamAsPcm } from './streaming';

const DEFAULT_CHUNK_SIZE = 3500;
const DEFAULT_SILENCE_MS = 400;
const DEFAULT_MAX_RETRIES = 3;
const RATE_LIMIT_MIN_WAIT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof MurmrError && error.status === 429) {
    return Math.max(RATE_LIMIT_MIN_WAIT_MS, 1000 * Math.pow(2, attempt));
  }
  return 1000 * Math.pow(2, attempt);
}

export async function createLongForm(
  client: MurmrClient,
  options: LongFormOptions,
): Promise<LongFormResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const silenceMs = options.silenceBetweenChunksMs ?? DEFAULT_SILENCE_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const startFrom = options.startFromChunk ?? 0;

  const chunks = splitIntoChunks(options.input, chunkSize);
  if (chunks.length === 0) {
    return {
      audio: Buffer.alloc(0),
      totalChunks: 0,
      durationMs: 0,
      characterCount: 0,
    };
  }

  const pcmChunks: Buffer[] = [];
  let totalCharacters = 0;

  for (let i = 0; i < chunks.length; i++) {
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
        const pcm = await generateChunkAudio(client, chunks[i], options);
        pcmChunks.push(pcm);
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
          await sleep(getRetryDelayMs(err, retry));
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

  const concatenated = concatenatePcmChunks(pcmChunks, silenceMs);

  return {
    audio: concatenated,
    totalChunks: chunks.length,
    durationMs: estimateDurationMs(concatenated),
    characterCount: totalCharacters,
  };
}

async function generateChunkAudio(
  client: MurmrClient,
  text: string,
  options: LongFormOptions,
): Promise<Buffer> {
  const voiceFields = options.voice_clone_prompt
    ? { voice_clone_prompt: options.voice_clone_prompt }
    : { voice: options.voice };

  const body = {
    text,
    ...voiceFields,
    language: options.language || 'English',
  };

  const response = await client.request('/v1/audio/speech/stream', {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });

  return collectStreamAsPcm(response);
}

function concatenatePcmChunks(chunks: readonly Buffer[], silenceMs: number): Buffer {
  if (chunks.length === 0) return Buffer.alloc(0);

  const silence = silenceMs > 0 ? generateSilence(silenceMs) : null;
  const parts: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    parts.push(chunks[i]);
    if (silence && i < chunks.length - 1) {
      parts.push(silence);
    }
  }

  const totalPcmSize = parts.reduce((sum, part) => sum + part.length, 0);
  return Buffer.concat([createWavHeader(totalPcmSize), ...parts]);
}

function estimateDurationMs(wavBuffer: Buffer): number {
  const WAV_HEADER_SIZE = 44;
  const bytesPerSecond = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const dataSize = Math.max(0, wavBuffer.length - WAV_HEADER_SIZE);
  return Math.round((dataSize / bytesPerSecond) * 1000);
}
