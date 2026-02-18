import { describe, it, expect, vi } from 'vitest';
import { MurmrClient } from '../src/client';
import { MurmrError, MurmrChunkError } from '../src/errors';

function createMockSSEResponse(pcmBytes: number): Response {
  const pcm = Buffer.alloc(pcmBytes, 0x42);
  const base64 = pcm.toString('base64');
  const sseData = `data: {"audio":"${base64}","chunk_index":0}\n\ndata: {"done":true,"total_chunks":1}\n\n`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sseData));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createMockClient(
  requestFn: (path: string, options: RequestInit) => Promise<Response>,
): MurmrClient {
  const client = new MurmrClient({ apiKey: 'test-key', baseUrl: 'https://test.example.com' });
  vi.spyOn(client, 'request').mockImplementation(requestFn as Parameters<typeof vi.spyOn>[0]);
  return client;
}

describe('createLongForm', () => {
  it('generates and concatenates chunks', async () => {
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client = createMockClient(requestMock);

    // Text long enough to require 2 chunks at 100 char limit
    const text = Array.from({ length: 5 }, (_, i) =>
      `This is sentence number ${i + 1} in the test.`,
    ).join(' ');

    const result = await client.speech.createLongForm({
      input: text,
      voice: 'voice_abc123',
      chunkSize: 100,
      silenceBetweenChunksMs: 0,
    });

    expect(result.audio.length).toBeGreaterThan(0);
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
    expect(result.characterCount).toBeGreaterThan(0);
    expect(requestMock).toHaveBeenCalledTimes(result.totalChunks);

    // Result should be a valid WAV file
    expect(result.audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(result.audio.toString('ascii', 8, 12)).toBe('WAVE');
  });

  it('calls onProgress for each chunk', async () => {
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client = createMockClient(requestMock);
    const progressCalls: Array<{ current: number; total: number; percent: number }> = [];

    const text = 'First sentence here. Second sentence here. Third sentence here.';

    await client.speech.createLongForm({
      input: text,
      voice: 'voice_abc123',
      chunkSize: 100,
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    const last = progressCalls[progressCalls.length - 1];
    expect(last.current).toBe(last.total);
    expect(last.percent).toBe(100);
  });

  it('retries failed chunks with exponential backoff', async () => {
    let callCount = 0;
    const requestMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error('Temporary failure'));
      }
      return Promise.resolve(createMockSSEResponse(480));
    });

    const client = createMockClient(requestMock);

    const result = await client.speech.createLongForm({
      input: 'Short text.',
      voice: 'voice_abc123',
      maxRetries: 3,
    });

    expect(result.totalChunks).toBe(1);
    expect(requestMock).toHaveBeenCalledTimes(3); // 2 failures + 1 success
  });

  it('throws MurmrChunkError after all retries fail', async () => {
    const requestMock = vi.fn().mockRejectedValue(new Error('Permanent failure'));
    const client = createMockClient(requestMock);

    await expect(
      client.speech.createLongForm({
        input: 'Some text here.',
        voice: 'voice_abc123',
        maxRetries: 2,
      }),
    ).rejects.toThrow(MurmrChunkError);

    // 1 original + 2 retries = 3
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  it('includes chunk metadata in MurmrChunkError', async () => {
    const requestMock = vi.fn().mockRejectedValue(new Error('Permanent failure'));
    const client = createMockClient(requestMock);

    try {
      await client.speech.createLongForm({
        input: 'Some text here.',
        voice: 'voice_abc123',
        maxRetries: 0,
      });
      expect.fail('Should have thrown');
    } catch (err) {
      const chunkErr = err as MurmrChunkError;
      expect(chunkErr.chunkIndex).toBe(0);
      expect(chunkErr.completedChunks).toBe(0);
      expect(chunkErr.totalChunks).toBe(1);
    }
  });

  it('MurmrChunkError preserves MurmrError cause properties', async () => {
    const apiError = new MurmrError('rate limited', {
      status: 429,
      type: 'rate_limit_exceeded',
      code: 'RATE_LIMIT',
      concurrentLimit: 3,
      concurrentActive: 3,
    });
    const requestMock = vi.fn().mockRejectedValue(apiError);
    const client = createMockClient(requestMock);

    try {
      await client.speech.createLongForm({
        input: 'Some text here.',
        voice: 'voice_abc123',
        maxRetries: 0,
      });
      expect.fail('Should have thrown');
    } catch (err) {
      const chunkErr = err as MurmrChunkError;
      expect(chunkErr.status).toBe(429);
      expect(chunkErr.type).toBe('rate_limit_exceeded');
      expect(chunkErr.code).toBe('RATE_LIMIT');
      expect(chunkErr.concurrentLimit).toBe(3);
      expect(chunkErr.concurrentActive).toBe(3);
    }
  });

  it('returns empty result for empty input', async () => {
    const client = createMockClient(vi.fn());

    const result = await client.speech.createLongForm({
      input: '',
      voice: 'voice_abc123',
    });

    expect(result.audio.length).toBe(0);
    expect(result.totalChunks).toBe(0);
    expect(result.characterCount).toBe(0);
  });

  it('passes correct parameters to streaming endpoint', async () => {
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client = createMockClient(requestMock);

    await client.speech.createLongForm({
      input: 'Test text.',
      voice: 'voice_abc123',
      language: 'Japanese',
    });

    const [path, options] = requestMock.mock.calls[0];
    expect(path).toBe('/v1/audio/speech/stream');
    expect(options.method).toBe('POST');

    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.voice).toBe('voice_abc123');
    expect(body.language).toBe('Japanese');
    expect(body.text).toBe('Test text.');

    // Streaming endpoint uses Accept: text/event-stream
    expect(options.headers).toEqual({ Accept: 'text/event-stream' });
  });

  it('uses voice_clone_prompt instead of voice when provided', async () => {
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client = createMockClient(requestMock);

    await client.speech.createLongForm({
      input: 'Test text.',
      voice: 'voice_abc123',
      voice_clone_prompt: 'base64embeddings==',
    });

    const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
    expect(body.voice_clone_prompt).toBe('base64embeddings==');
    expect(body.voice).toBeUndefined();
  });

  it('result audio is a valid WAV file', async () => {
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client = createMockClient(requestMock);

    const result = await client.speech.createLongForm({
      input: 'Test text.',
      voice: 'voice_abc123',
    });

    // Verify RIFF header
    expect(result.audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(result.audio.toString('ascii', 8, 12)).toBe('WAVE');
    // Verify fmt chunk
    expect(result.audio.toString('ascii', 12, 16)).toBe('fmt ');
    // Verify data chunk
    expect(result.audio.toString('ascii', 36, 40)).toBe('data');
  });

  it('inserts silence between chunks', async () => {
    const pcmSize = 480;
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(pcmSize)),
    );
    const client = createMockClient(requestMock);

    // Text long enough to produce 2+ chunks at 100 char limit
    const text = Array.from({ length: 5 }, (_, i) =>
      `This is sentence number ${i + 1} in the test.`,
    ).join(' ');

    const resultNoSilence = await client.speech.createLongForm({
      input: text,
      voice: 'voice_abc123',
      chunkSize: 100,
      silenceBetweenChunksMs: 0,
    });

    const resultWithSilence = await client.speech.createLongForm({
      input: text,
      voice: 'voice_abc123',
      chunkSize: 100,
      silenceBetweenChunksMs: 400,
    });

    // With silence should be larger (400ms of silence at 24kHz, 16-bit = 19200 bytes)
    if (resultNoSilence.totalChunks > 1) {
      expect(resultWithSilence.audio.length).toBeGreaterThan(resultNoSilence.audio.length);
    }
  });

  it('startFromChunk skips first N chunks', async () => {
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client = createMockClient(requestMock);

    // Text that produces 3+ chunks at 100 char limit
    const text = Array.from({ length: 5 }, (_, i) =>
      `This is sentence number ${i + 1} in the test.`,
    ).join(' ');

    const result = await client.speech.createLongForm({
      input: text,
      voice: 'voice_abc123',
      chunkSize: 100,
      silenceBetweenChunksMs: 0,
      startFromChunk: 2,
    });

    // Should still report total chunks from the full text
    expect(result.totalChunks).toBeGreaterThanOrEqual(3);
    // But only generate audio for chunks after index 2
    expect(requestMock).toHaveBeenCalledTimes(result.totalChunks - 2);
  });

  it('startFromChunk reports progress for skipped chunks', async () => {
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client = createMockClient(requestMock);
    const progressCalls: Array<{ current: number; total: number; percent: number }> = [];

    const text = Array.from({ length: 5 }, (_, i) =>
      `This is sentence number ${i + 1} in the test.`,
    ).join(' ');

    const result = await client.speech.createLongForm({
      input: text,
      voice: 'voice_abc123',
      chunkSize: 100,
      silenceBetweenChunksMs: 0,
      startFromChunk: 2,
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    // Progress should be reported for ALL chunks (including skipped)
    expect(progressCalls.length).toBe(result.totalChunks);
    // First progress call should be for chunk 1 (skipped)
    expect(progressCalls[0].current).toBe(1);
    // Last progress call should reach 100%
    const last = progressCalls[progressCalls.length - 1];
    expect(last.current).toBe(last.total);
    expect(last.percent).toBe(100);
  });

  it('resume works with MurmrChunkError pattern', async () => {
    let callCount = 0;
    const failOnChunk2 = vi.fn().mockImplementation(() => {
      callCount++;
      // Fail on the 3rd API call (chunk index 2)
      if (callCount === 3) {
        return Promise.reject(new Error('Transient failure'));
      }
      return Promise.resolve(createMockSSEResponse(480));
    });

    const client = createMockClient(failOnChunk2);

    const text = Array.from({ length: 5 }, (_, i) =>
      `This is sentence number ${i + 1} in the test.`,
    ).join(' ');

    // First attempt: fails at chunk 2
    let chunkError: MurmrChunkError | null = null;
    try {
      await client.speech.createLongForm({
        input: text,
        voice: 'voice_abc123',
        chunkSize: 100,
        maxRetries: 0,
      });
    } catch (err) {
      chunkError = err as MurmrChunkError;
    }

    expect(chunkError).toBeInstanceOf(MurmrChunkError);
    expect(chunkError!.chunkIndex).toBe(2);
    expect(chunkError!.completedChunks).toBe(2);

    // Resume from the failed chunk
    const resumeMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(480)),
    );
    const client2 = createMockClient(resumeMock);

    const result = await client2.speech.createLongForm({
      input: text,
      voice: 'voice_abc123',
      chunkSize: 100,
      silenceBetweenChunksMs: 0,
      startFromChunk: chunkError!.completedChunks,
    });

    // Should only generate from chunk 2 onward
    expect(resumeMock).toHaveBeenCalledTimes(result.totalChunks - chunkError!.completedChunks);
    expect(result.totalChunks).toBeGreaterThanOrEqual(3);
  });

  it('durationMs estimate is reasonable', async () => {
    const pcmSize = 48000; // 1 second at 24kHz 16-bit mono
    const requestMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createMockSSEResponse(pcmSize)),
    );
    const client = createMockClient(requestMock);

    const result = await client.speech.createLongForm({
      input: 'Test text.',
      voice: 'voice_abc123',
      silenceBetweenChunksMs: 0,
    });

    // 48000 bytes / (24000 * 1 * 2) = 1.0 second = 1000ms
    expect(result.durationMs).toBe(1000);
  });
});
