import { describe, it, expect, vi } from 'vitest';
import { MurmrClient } from '../src/client';
import { MurmrChunkError } from '../src/errors';
import { createWavHeader } from '../src/audio-concat';

function makeFakeWav(pcmBytes: number): ArrayBuffer {
  const header = createWavHeader(pcmBytes);
  const pcm = Buffer.alloc(pcmBytes, 0x42);
  const wav = Buffer.concat([header, pcm]);
  return wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
}

function mockHeaders(entries: Record<string, string> = {}): { get(name: string): string | null } {
  return { get: (name: string) => entries[name] ?? null };
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
    const requestMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
    });

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
    expect(result.format).toBe('wav');
    expect(result.characterCount).toBeGreaterThan(0);
    expect(requestMock).toHaveBeenCalledTimes(result.totalChunks);
  });

  it('calls onProgress for each chunk', async () => {
    const requestMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
    });

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
      return Promise.resolve({
        ok: true,
        headers: mockHeaders(),
        arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
      });
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

  it('passes correct parameters to API', async () => {
    const requestMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
    });

    const client = createMockClient(requestMock);

    await client.speech.createLongForm({
      input: 'Test text.',
      voice: 'voice_abc123',
      language: 'Japanese',
      response_format: 'mp3',
    });

    const [path, options] = requestMock.mock.calls[0];
    expect(path).toBe('/v1/audio/speech/batch');
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.voice_clone_prompt).toBe('voice_abc123');
    expect(body.language).toBe('Japanese');
    expect(body.response_format).toBe('mp3');
  });

  it('startFromChunk skips first N chunks', async () => {
    const requestMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
    });

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
    const requestMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
    });

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
      return Promise.resolve({
        ok: true,
        headers: mockHeaders(),
        arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
      });
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
    const resumeMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      arrayBuffer: () => Promise.resolve(makeFakeWav(480)),
    });
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
});
