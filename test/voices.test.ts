import { describe, it, expect, vi } from 'vitest';
import { MurmrClient } from '../src/client';
import { MurmrError } from '../src/errors';

function createMockClient(
  requestFn: (path: string, options: RequestInit) => Promise<Response>,
): MurmrClient {
  const client = new MurmrClient({ apiKey: 'test-key', baseUrl: 'https://test.example.com' });
  vi.spyOn(client, 'request').mockImplementation(requestFn as Parameters<typeof vi.spyOn>[0]);
  return client;
}

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

describe('VoicesResource', () => {
  describe('design()', () => {
    it('calls /v1/voices/design with correct body', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.voices.design({
        input: 'Hello world',
        voice_description: 'A warm female voice',
      });

      const [path, options] = requestMock.mock.calls[0];
      expect(path).toBe('/v1/voices/design');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.text).toBe('Hello world');
      expect(body.voice_description).toBe('A warm female voice');
      expect(body.language).toBe('English');
      expect(body.input).toBeUndefined();
    });

    it('sends custom language', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.voices.design({
        input: 'Bonjour',
        voice_description: 'A calm narrator',
        language: 'French',
      });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.language).toBe('French');
    });

    it('parses SSE and returns WAV buffer', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      const result = await client.voices.design({
        input: 'Hello',
        voice_description: 'A warm voice',
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // WAV file starts with RIFF header
      expect(result.toString('ascii', 0, 4)).toBe('RIFF');
      expect(result.toString('ascii', 8, 12)).toBe('WAVE');
    });

    it('returns WAV with correct PCM data from SSE', async () => {
      const pcmSize = 960;
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(pcmSize));
      const client = createMockClient(requestMock);

      const result = await client.voices.design({
        input: 'Hello',
        voice_description: 'A warm voice',
      });

      // WAV header is 44 bytes, PCM data follows
      expect(result.length).toBe(44 + pcmSize);
      // Verify PCM data is the fill byte 0x42
      const pcmData = result.subarray(44);
      expect(pcmData.every(byte => byte === 0x42)).toBe(true);
    });

    it('handles multi-chunk SSE stream', async () => {
      const pcm1 = Buffer.alloc(240, 0x41);
      const pcm2 = Buffer.alloc(240, 0x43);
      const sseData = [
        `data: {"audio":"${pcm1.toString('base64')}","chunk_index":0}\n`,
        `data: {"audio":"${pcm2.toString('base64')}","chunk_index":1}\n`,
        `data: {"done":true,"total_chunks":2}\n`,
        '',
      ].join('\n');

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      });
      const response = new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

      const requestMock = vi.fn().mockResolvedValue(response);
      const client = createMockClient(requestMock);

      const result = await client.voices.design({
        input: 'Hello',
        voice_description: 'A warm voice',
      });

      // 44 byte header + 240 + 240 bytes PCM
      expect(result.length).toBe(44 + 480);
      expect(result.toString('ascii', 0, 4)).toBe('RIFF');
    });

    it('validates empty input', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.voices.design({ input: '', voice_description: 'A warm voice' }),
      ).rejects.toThrow(MurmrError);
      await expect(
        client.voices.design({ input: '', voice_description: 'A warm voice' }),
      ).rejects.toThrow('input text is required');
    });

    it('validates input exceeding 4096 characters', async () => {
      const client = createMockClient(vi.fn());
      const longInput = 'a'.repeat(4097);

      await expect(
        client.voices.design({ input: longInput, voice_description: 'A warm voice' }),
      ).rejects.toThrow('4096 character limit');
    });

    it('validates voice_description is required', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.voices.design({ input: 'Hello', voice_description: '' }),
      ).rejects.toThrow(MurmrError);
      await expect(
        client.voices.design({ input: 'Hello', voice_description: '' }),
      ).rejects.toThrow('voice_description is required');
    });

    it('validates voice_description is not whitespace-only', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.voices.design({ input: 'Hello', voice_description: '   ' }),
      ).rejects.toThrow('voice_description is required');
    });

    it('sets Accept header to text/event-stream', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.voices.design({
        input: 'Hello',
        voice_description: 'A warm voice',
      });

      const headers = requestMock.mock.calls[0][1].headers;
      expect(headers).toEqual({ Accept: 'text/event-stream' });
    });
  });

  describe('designStream()', () => {
    it('calls /v1/voices/design/stream with correct body', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.voices.designStream({
        input: 'Hello world',
        voice_description: 'A calm narrator',
      });

      const [path, options] = requestMock.mock.calls[0];
      expect(path).toBe('/v1/voices/design/stream');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.text).toBe('Hello world');
      expect(body.voice_description).toBe('A calm narrator');
      expect(body.language).toBe('English');
    });

    it('validates empty input', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.voices.designStream({ input: '', voice_description: 'A warm voice' }),
      ).rejects.toThrow(MurmrError);
    });

    it('validates input exceeding 4096 characters', async () => {
      const client = createMockClient(vi.fn());
      const longInput = 'a'.repeat(4097);

      await expect(
        client.voices.designStream({ input: longInput, voice_description: 'A warm voice' }),
      ).rejects.toThrow('4096 character limit');
    });

    it('validates voice_description is required', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.voices.designStream({ input: 'Hello', voice_description: '' }),
      ).rejects.toThrow('voice_description is required');
    });

    it('returns an async generator that yields chunks', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      const stream = await client.voices.designStream({
        input: 'Hello',
        voice_description: 'A warm voice',
      });

      const chunks: unknown[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(2);
      expect(chunks[0]).toHaveProperty('audio');
      expect(chunks[1]).toHaveProperty('done', true);
    });

    it('sends custom language', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.voices.designStream({
        input: 'Hallo',
        voice_description: 'A warm voice',
        language: 'German',
      });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.language).toBe('German');
    });
  });

  describe('list()', () => {
    it('calls GET /v1/voices', async () => {
      const mockResponse = {
        voices: [
          { id: 'voice_abc123def456', name: 'My Voice', description: 'A warm voice', language: 'en', language_name: 'English', audio_preview_url: null, created_at: '2025-01-01T00:00:00Z' },
        ],
        saved_count: 1,
        saved_limit: 10,
        total: 1,
      };
      const requestMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );
      const client = createMockClient(requestMock);

      const result = await client.voices.list();

      expect(requestMock).toHaveBeenCalledWith('/v1/voices');
      expect(result.voices).toHaveLength(1);
      expect(result.voices[0].name).toBe('My Voice');
      expect(result.saved_count).toBe(1);
      expect(result.saved_limit).toBe(10);
    });

    it('handles empty voice list', async () => {
      const mockResponse = { voices: [], saved_count: 0, saved_limit: 3, total: 0 };
      const requestMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );
      const client = createMockClient(requestMock);

      const result = await client.voices.list();
      expect(result.voices).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('save()', () => {
    it('calls POST /v1/voices with correct body', async () => {
      const mockResponse = {
        id: 'voice_abc123def456',
        name: 'Test Voice',
        language: 'English',
        description: 'A warm voice',
        prompt_size_bytes: 1024,
        created_at: '2025-01-01T00:00:00Z',
        success: true,
        has_audio_preview: true,
      };
      const requestMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 201 }),
      );
      const client = createMockClient(requestMock);

      const audio = Buffer.from('fake-audio-data');
      const result = await client.voices.save({
        name: 'Test Voice',
        audio,
        description: 'A warm voice',
      });

      const [path, options] = requestMock.mock.calls[0];
      expect(path).toBe('/v1/voices');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.name).toBe('Test Voice');
      expect(body.audio).toBe(audio.toString('base64'));
      expect(body.description).toBe('A warm voice');
      expect(body.language).toBe('English');
      expect(result.success).toBe(true);
    });

    it('encodes Uint8Array audio as base64', async () => {
      const mockResponse = { id: 'voice_abc', name: 'V', language: 'en', description: 'd', prompt_size_bytes: 0, created_at: '', success: true, has_audio_preview: false };
      const requestMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 201 }),
      );
      const client = createMockClient(requestMock);

      const audio = new Uint8Array([1, 2, 3, 4]);
      await client.voices.save({ name: 'V', audio, description: 'd' });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.audio).toBe(Buffer.from(audio).toString('base64'));
    });

    it('validates empty name', async () => {
      const client = createMockClient(vi.fn());
      await expect(
        client.voices.save({ name: '', audio: Buffer.from('x'), description: 'desc' }),
      ).rejects.toThrow('name is required');
    });

    it('validates name length over 50 chars', async () => {
      const client = createMockClient(vi.fn());
      await expect(
        client.voices.save({ name: 'a'.repeat(51), audio: Buffer.from('x'), description: 'desc' }),
      ).rejects.toThrow('50 characters');
    });

    it('validates empty audio', async () => {
      const client = createMockClient(vi.fn());
      await expect(
        client.voices.save({ name: 'Test', audio: Buffer.alloc(0), description: 'desc' }),
      ).rejects.toThrow('audio is required');
    });

    it('validates empty description', async () => {
      const client = createMockClient(vi.fn());
      await expect(
        client.voices.save({ name: 'Test', audio: Buffer.from('x'), description: '' }),
      ).rejects.toThrow('description is required');
    });
  });

  describe('delete()', () => {
    it('calls DELETE /v1/voices/:id', async () => {
      const mockResponse = { success: true, id: 'voice_abc123def456', message: 'Voice "Test" deleted' };
      const requestMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );
      const client = createMockClient(requestMock);

      const result = await client.voices.delete('voice_abc123def456');

      const [path, options] = requestMock.mock.calls[0];
      expect(path).toBe('/v1/voices/voice_abc123def456');
      expect(options.method).toBe('DELETE');
      expect(result.success).toBe(true);
    });

    it('validates voice ID format', async () => {
      const client = createMockClient(vi.fn());
      await expect(
        client.voices.delete(''),
      ).rejects.toThrow(MurmrError);
    });
  });
});
