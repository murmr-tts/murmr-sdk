import type { AudioStreamChunk } from './types';

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
