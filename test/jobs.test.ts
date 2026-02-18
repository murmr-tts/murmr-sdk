import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MurmrClient } from '../src/client';
import { MurmrError } from '../src/errors';
import type { JobStatus } from '../src/types';

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

describe('JobsResource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get()', () => {
    it('calls correct endpoint /v1/jobs/{id}', async () => {
      const jobStatus: JobStatus = {
        id: 'job_abc123',
        status: 'processing',
        created_at: '2026-02-18T00:00:00Z',
        completed_at: null,
        error: null,
      };

      const requestMock = vi.fn().mockResolvedValue(createJsonResponse(jobStatus));
      const client = createMockClient(requestMock);

      vi.useRealTimers();
      const result = await client.jobs.get('job_abc123');

      expect(requestMock).toHaveBeenCalledWith('/v1/jobs/job_abc123', { method: 'GET' });
      expect(result).toEqual(jobStatus);
    });

    it('validates jobId format - empty string', async () => {
      const client = createMockClient(vi.fn());

      vi.useRealTimers();
      await expect(client.jobs.get('')).rejects.toThrow(MurmrError);
      await expect(client.jobs.get('')).rejects.toThrow('Invalid jobId');
    });

    it('validates jobId format - special characters', async () => {
      const client = createMockClient(vi.fn());

      vi.useRealTimers();
      await expect(client.jobs.get('job@123')).rejects.toThrow(MurmrError);
      await expect(client.jobs.get('job/123')).rejects.toThrow(MurmrError);
    });

    it('accepts valid jobId with hyphens and underscores', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({ id: 'job-abc_123', status: 'queued', created_at: '', completed_at: null, error: null }),
      );
      const client = createMockClient(requestMock);

      vi.useRealTimers();
      await client.jobs.get('job-abc_123');
      expect(requestMock).toHaveBeenCalledWith('/v1/jobs/job-abc_123', { method: 'GET' });
    });
  });

  describe('waitForCompletion()', () => {
    it('returns on completed status', async () => {
      const completedStatus: JobStatus = {
        id: 'job_123',
        status: 'completed',
        created_at: '2026-02-18T00:00:00Z',
        completed_at: '2026-02-18T00:00:05Z',
        error: null,
        audio_base64: 'dGVzdA==',
      };

      const requestMock = vi.fn().mockResolvedValue(createJsonResponse(completedStatus));
      const client = createMockClient(requestMock);

      vi.useRealTimers();
      const result = await client.jobs.waitForCompletion('job_123');
      expect(result).toEqual(completedStatus);
      expect(result.status).toBe('completed');
    });

    it('throws on failed status', async () => {
      const failedStatus: JobStatus = {
        id: 'job_123',
        status: 'failed',
        created_at: '2026-02-18T00:00:00Z',
        completed_at: null,
        error: 'Model error: out of memory',
      };

      const requestMock = vi.fn().mockResolvedValue(createJsonResponse(failedStatus));
      const client = createMockClient(requestMock);

      vi.useRealTimers();
      await expect(
        client.jobs.waitForCompletion('job_123'),
      ).rejects.toThrow(MurmrError);
      await expect(
        client.jobs.waitForCompletion('job_123'),
      ).rejects.toThrow('Model error: out of memory');
    });

    it('throws with JOB_FAILED code on failure', async () => {
      const failedStatus: JobStatus = {
        id: 'job_123',
        status: 'failed',
        created_at: '2026-02-18T00:00:00Z',
        completed_at: null,
        error: 'Something failed',
      };

      const requestMock = vi.fn().mockResolvedValue(createJsonResponse(failedStatus));
      const client = createMockClient(requestMock);

      vi.useRealTimers();
      try {
        await client.jobs.waitForCompletion('job_123');
        expect.fail('Should have thrown');
      } catch (err) {
        const murmrErr = err as MurmrError;
        expect(murmrErr.code).toBe('JOB_FAILED');
      }
    });

    it('throws generic message when error field is null', async () => {
      const failedStatus: JobStatus = {
        id: 'job_123',
        status: 'failed',
        created_at: '2026-02-18T00:00:00Z',
        completed_at: null,
        error: null,
      };

      const requestMock = vi.fn().mockResolvedValue(createJsonResponse(failedStatus));
      const client = createMockClient(requestMock);

      vi.useRealTimers();
      await expect(
        client.jobs.waitForCompletion('job_123'),
      ).rejects.toThrow('Job failed');
    });

    it('polls until completion', async () => {
      let callCount = 0;
      const requestMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve(createJsonResponse({
            id: 'job_123',
            status: 'processing',
            created_at: '2026-02-18T00:00:00Z',
            completed_at: null,
            error: null,
          }));
        }
        return Promise.resolve(createJsonResponse({
          id: 'job_123',
          status: 'completed',
          created_at: '2026-02-18T00:00:00Z',
          completed_at: '2026-02-18T00:00:10Z',
          error: null,
          audio_base64: 'dGVzdA==',
        }));
      });

      const client = createMockClient(requestMock);

      // Run with real timers since we need the setTimeout to actually fire
      vi.useRealTimers();
      const result = await client.jobs.waitForCompletion('job_123', {
        pollIntervalMs: 1000,
      });

      expect(result.status).toBe('completed');
      expect(requestMock).toHaveBeenCalledTimes(3);
    });

    it('times out after deadline', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({
          id: 'job_123',
          status: 'processing',
          created_at: '2026-02-18T00:00:00Z',
          completed_at: null,
          error: null,
        }),
      );

      const client = createMockClient(requestMock);

      // Use a very small timeout to ensure it triggers quickly
      vi.useRealTimers();
      await expect(
        client.jobs.waitForCompletion('job_123', {
          pollIntervalMs: 1000,
          timeoutMs: 50,
        }),
      ).rejects.toThrow('Job polling timed out');
    });

    it('throws with TIMEOUT code', async () => {
      const requestMock = vi.fn().mockResolvedValue(
        createJsonResponse({
          id: 'job_123',
          status: 'processing',
          created_at: '2026-02-18T00:00:00Z',
          completed_at: null,
          error: null,
        }),
      );

      const client = createMockClient(requestMock);

      vi.useRealTimers();
      try {
        await client.jobs.waitForCompletion('job_123', {
          pollIntervalMs: 1000,
          timeoutMs: 50,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        const murmrErr = err as MurmrError;
        expect(murmrErr.code).toBe('TIMEOUT');
      }
    });

    it('calls onPoll callback on each poll', async () => {
      let callCount = 0;
      const requestMock = vi.fn().mockImplementation(() => {
        callCount++;
        const status = callCount >= 2 ? 'completed' : 'processing';
        return Promise.resolve(createJsonResponse({
          id: 'job_123',
          status,
          created_at: '2026-02-18T00:00:00Z',
          completed_at: status === 'completed' ? '2026-02-18T00:00:05Z' : null,
          error: null,
        }));
      });

      const client = createMockClient(requestMock);
      const pollStatuses: string[] = [];

      vi.useRealTimers();
      await client.jobs.waitForCompletion('job_123', {
        pollIntervalMs: 1000,
        onPoll: (status) => {
          pollStatuses.push(status.status);
        },
      });

      expect(pollStatuses).toEqual(['processing', 'completed']);
    });

    it('validates jobId format', async () => {
      const client = createMockClient(vi.fn());

      vi.useRealTimers();
      await expect(
        client.jobs.waitForCompletion(''),
      ).rejects.toThrow('Invalid jobId');

      await expect(
        client.jobs.waitForCompletion('job@invalid'),
      ).rejects.toThrow('Invalid jobId');
    });

    it('enforces minimum poll interval of 1000ms', async () => {
      let callCount = 0;
      const requestMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 2) {
          return Promise.resolve(createJsonResponse({
            id: 'job_123',
            status: 'completed',
            created_at: '',
            completed_at: '',
            error: null,
          }));
        }
        return Promise.resolve(createJsonResponse({
          id: 'job_123',
          status: 'processing',
          created_at: '',
          completed_at: null,
          error: null,
        }));
      });

      const client = createMockClient(requestMock);

      vi.useRealTimers();
      const start = Date.now();
      await client.jobs.waitForCompletion('job_123', {
        pollIntervalMs: 100, // Below minimum, should be clamped to 1000
      });
      const elapsed = Date.now() - start;

      // Should have waited at least ~1000ms (the minimum) between polls
      expect(elapsed).toBeGreaterThanOrEqual(900);
    });
  });
});
