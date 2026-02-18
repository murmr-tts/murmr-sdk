import { describe, it, expect, vi } from 'vitest';
import { MurmrClient } from '../src/client';
import { MurmrError } from '../src/errors';
import type { AsyncJobResponse, JobStatus } from '../src/types';

function createMockClient(
  requestFn: (path: string, options: RequestInit) => Promise<Response>,
): MurmrClient {
  const client = new MurmrClient({ apiKey: 'test-key', baseUrl: 'https://test.example.com' });
  vi.spyOn(client, 'request').mockImplementation(requestFn as Parameters<typeof vi.spyOn>[0]);
  return client;
}

function createJsonResponse(data: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  } as unknown as Response;
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

describe('SpeechResource', () => {
  describe('create()', () => {
    it('returns AsyncJobResponse from JSON response', async () => {
      const jobResponse: AsyncJobResponse = {
        id: 'job_abc123',
        status: 'queued',
        created_at: '2026-02-18T00:00:00Z',
      };

      const client = createMockClient(() => Promise.resolve(createJsonResponse(jobResponse)));
      const result = await client.speech.create({
        input: 'Hello world',
        voice: 'voice_xxx',
      });

      expect(result).toEqual(jobResponse);
      expect(result.id).toBe('job_abc123');
      expect(result.status).toBe('queued');
    });

    it('validates empty input', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.create({ input: '', voice: 'voice_xxx' }),
      ).rejects.toThrow(MurmrError);
      await expect(
        client.speech.create({ input: '', voice: 'voice_xxx' }),
      ).rejects.toThrow('input text is required');
    });

    it('validates input exceeding 4096 characters', async () => {
      const client = createMockClient(vi.fn());
      const longInput = 'a'.repeat(4097);

      await expect(
        client.speech.create({ input: longInput, voice: 'voice_xxx' }),
      ).rejects.toThrow(MurmrError);
      await expect(
        client.speech.create({ input: longInput, voice: 'voice_xxx' }),
      ).rejects.toThrow('4096 character limit');
    });

    it('validates voice is required', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.create({ input: 'Hello', voice: '' }),
      ).rejects.toThrow(MurmrError);
      await expect(
        client.speech.create({ input: 'Hello', voice: '' }),
      ).rejects.toThrow('voice ID is required');
    });

    it('validates voice is required when whitespace-only', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.create({ input: 'Hello', voice: '   ' }),
      ).rejects.toThrow('voice ID is required');
    });

    it('validates webhook_url is HTTPS', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.create({
          input: 'Hello',
          voice: 'voice_xxx',
          webhook_url: 'http://example.com/webhook',
        }),
      ).rejects.toThrow('webhook_url must use HTTPS');
    });

    it('validates webhook_url is a valid URL', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.create({
          input: 'Hello',
          voice: 'voice_xxx',
          webhook_url: 'not-a-url',
        }),
      ).rejects.toThrow('webhook_url is not a valid URL');
    });

    it('accepts valid HTTPS webhook_url', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({ id: 'job_123', status: 'queued', created_at: '2026-02-18T00:00:00Z' }),
      );
      const client = createMockClient(requestMock);

      await client.speech.create({
        input: 'Hello',
        voice: 'voice_xxx',
        webhook_url: 'https://example.com/webhook',
      });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.webhook_url).toBe('https://example.com/webhook');
    });

    it('sends text field mapped from options.input', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({ id: 'job_123', status: 'queued', created_at: '2026-02-18T00:00:00Z' }),
      );
      const client = createMockClient(requestMock);

      await client.speech.create({ input: 'Hello world', voice: 'voice_xxx' });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.text).toBe('Hello world');
      expect(body.input).toBeUndefined();
    });

    it('uses voice_clone_prompt when provided', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({ id: 'job_123', status: 'queued', created_at: '2026-02-18T00:00:00Z' }),
      );
      const client = createMockClient(requestMock);

      await client.speech.create({
        input: 'Hello',
        voice: 'voice_xxx',
        voice_clone_prompt: 'base64data==',
      });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.voice_clone_prompt).toBe('base64data==');
      expect(body.voice).toBeUndefined();
    });

    it('sends voice when voice_clone_prompt is not provided', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({ id: 'job_123', status: 'queued', created_at: '2026-02-18T00:00:00Z' }),
      );
      const client = createMockClient(requestMock);

      await client.speech.create({ input: 'Hello', voice: 'voice_xxx' });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.voice).toBe('voice_xxx');
      expect(body.voice_clone_prompt).toBeUndefined();
    });

    it('sends correct endpoint and default parameters', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({ id: 'job_123', status: 'queued', created_at: '2026-02-18T00:00:00Z' }),
      );
      const client = createMockClient(requestMock);

      await client.speech.create({ input: 'Hello', voice: 'voice_xxx' });

      const [path, options] = requestMock.mock.calls[0];
      expect(path).toBe('/v1/audio/speech');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.language).toBe('English');
      expect(body.response_format).toBe('wav');
    });

    it('sends custom language and response_format', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({ id: 'job_123', status: 'queued', created_at: '2026-02-18T00:00:00Z' }),
      );
      const client = createMockClient(requestMock);

      await client.speech.create({
        input: 'Bonjour',
        voice: 'voice_xxx',
        language: 'French',
        response_format: 'mp3',
      });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.language).toBe('French');
      expect(body.response_format).toBe('mp3');
    });
  });

  describe('stream()', () => {
    it('calls correct endpoint /v1/audio/speech/stream', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.speech.stream({ input: 'Hello', voice: 'voice_xxx' });

      const [path, options] = requestMock.mock.calls[0];
      expect(path).toBe('/v1/audio/speech/stream');
      expect(options.method).toBe('POST');
    });

    it('sends text field not input', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.speech.stream({ input: 'Hello world', voice: 'voice_xxx' });

      const body = JSON.parse(requestMock.mock.calls[0][1].body as string);
      expect(body.text).toBe('Hello world');
      expect(body.input).toBeUndefined();
    });

    it('validates empty input', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.stream({ input: '', voice: 'voice_xxx' }),
      ).rejects.toThrow(MurmrError);
    });

    it('validates input exceeding 4096 characters', async () => {
      const client = createMockClient(vi.fn());
      const longInput = 'a'.repeat(4097);

      await expect(
        client.speech.stream({ input: longInput, voice: 'voice_xxx' }),
      ).rejects.toThrow('4096 character limit');
    });

    it('validates voice is required', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.stream({ input: 'Hello', voice: '' }),
      ).rejects.toThrow('voice ID is required');
    });

    it('sets Accept header to text/event-stream', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      await client.speech.stream({ input: 'Hello', voice: 'voice_xxx' });

      const headers = requestMock.mock.calls[0][1].headers;
      expect(headers).toEqual({ Accept: 'text/event-stream' });
    });

    it('returns an async generator that yields chunks', async () => {
      const requestMock = vi.fn().mockResolvedValue(createMockSSEResponse(480));
      const client = createMockClient(requestMock);

      const stream = await client.speech.stream({ input: 'Hello', voice: 'voice_xxx' });
      const chunks: unknown[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(2);
      expect(chunks[0]).toHaveProperty('audio');
      expect(chunks[1]).toHaveProperty('done', true);
    });
  });

  describe('createAndWait()', () => {
    it('calls create then polls via client.jobs.waitForCompletion', async () => {
      const jobResponse: AsyncJobResponse = {
        id: 'job_abc123',
        status: 'queued',
        created_at: '2026-02-18T00:00:00Z',
      };

      const completedStatus: JobStatus = {
        id: 'job_abc123',
        status: 'completed',
        created_at: '2026-02-18T00:00:00Z',
        completed_at: '2026-02-18T00:00:05Z',
        error: null,
        audio_base64: 'dGVzdA==',
        content_type: 'audio/wav',
        response_format: 'wav',
      };

      const requestMock = vi.fn().mockResolvedValue(createJsonResponse(jobResponse));
      const client = createMockClient(requestMock);
      const waitSpy = vi.spyOn(client.jobs, 'waitForCompletion').mockResolvedValue(completedStatus);

      const result = await client.speech.createAndWait({
        input: 'Hello world',
        voice: 'voice_xxx',
        pollIntervalMs: 1000,
        timeoutMs: 30000,
      });

      expect(result).toEqual(completedStatus);
      expect(waitSpy).toHaveBeenCalledWith('job_abc123', {
        pollIntervalMs: 1000,
        timeoutMs: 30000,
        onPoll: undefined,
      });
    });

    it('passes onPoll callback to waitForCompletion', async () => {
      const jobResponse: AsyncJobResponse = {
        id: 'job_456',
        status: 'queued',
        created_at: '2026-02-18T00:00:00Z',
      };

      const completedStatus: JobStatus = {
        id: 'job_456',
        status: 'completed',
        created_at: '2026-02-18T00:00:00Z',
        completed_at: '2026-02-18T00:00:05Z',
        error: null,
      };

      const requestMock = vi.fn().mockResolvedValue(createJsonResponse(jobResponse));
      const client = createMockClient(requestMock);
      const onPoll = vi.fn();
      vi.spyOn(client.jobs, 'waitForCompletion').mockResolvedValue(completedStatus);

      await client.speech.createAndWait({
        input: 'Hello',
        voice: 'voice_xxx',
        onPoll,
      });

      const waitCall = vi.mocked(client.jobs.waitForCompletion).mock.calls[0];
      expect(waitCall[1]?.onPoll).toBe(onPoll);
    });

    it('validates input before making request', async () => {
      const client = createMockClient(vi.fn());

      await expect(
        client.speech.createAndWait({ input: '', voice: 'voice_xxx' }),
      ).rejects.toThrow('input text is required');
    });
  });
});
