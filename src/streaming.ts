import type { AudioStreamChunk } from './types';
import { createWavHeader } from './audio-concat';

/**
 * Parse an SSE response body into an async generator of AudioStreamChunk.
 *
 * Usage:
 *   const stream = parseSSEStream(response);
 *   for await (const chunk of stream) {
 *     if (chunk.audio) {
 *       const pcm = Buffer.from(chunk.audio, 'base64');
 *     }
 *     if (chunk.done) break;
 *   }
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<AudioStreamChunk> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          yield JSON.parse(trimmed.slice(6)) as AudioStreamChunk;
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Consume an SSE response stream and collect all PCM audio chunks into a single WAV buffer.
 *
 * The SSE stream contains base64-encoded PCM chunks (24kHz, mono, 16-bit).
 * This function decodes and concatenates them, then prepends a WAV header.
 */
export async function collectStreamAsWav(response: Response): Promise<Buffer> {
  const pcmParts: Buffer[] = [];

  for await (const chunk of parseSSEStream(response)) {
    const audioData = chunk.audio || chunk.chunk;
    if (audioData) {
      pcmParts.push(Buffer.from(audioData, 'base64'));
    }
  }

  if (pcmParts.length === 0) {
    return Buffer.alloc(0);
  }

  const pcm = Buffer.concat(pcmParts);
  const header = createWavHeader(pcm.length);
  return Buffer.concat([header, pcm]);
}

/**
 * Consume an SSE response stream and collect all PCM audio chunks into a raw PCM buffer.
 * No WAV header is prepended.
 */
export async function collectStreamAsPcm(response: Response): Promise<Buffer> {
  const pcmParts: Buffer[] = [];

  for await (const chunk of parseSSEStream(response)) {
    const audioData = chunk.audio || chunk.chunk;
    if (audioData) {
      pcmParts.push(Buffer.from(audioData, 'base64'));
    }
  }

  return pcmParts.length === 0 ? Buffer.alloc(0) : Buffer.concat(pcmParts);
}
