import type { MurmrClient } from '../client';
import type { JobStatus } from '../types';
import { MurmrError } from '../errors';

function validateId(id: string, label: string): void {
  if (!id || !/^[\w-]+$/.test(id)) {
    throw new MurmrError(`Invalid ${label}: must contain only alphanumeric characters, hyphens, or underscores`);
  }
}

const MIN_POLL_INTERVAL = 1000;

export class JobsResource {
  constructor(private readonly client: MurmrClient) {}

  /** Get the status of an async batch job */
  async get(jobId: string): Promise<JobStatus> {
    validateId(jobId, 'jobId');
    const response = await this.client.request(`/v1/jobs/${jobId}`, { method: 'GET' });
    return await response.json() as JobStatus;
  }

  /**
   * Poll for job completion. Resolves when job is completed or failed.
   * Throws on failure.
   */
  async waitForCompletion(
    jobId: string,
    options?: { pollIntervalMs?: number; timeoutMs?: number; onPoll?: (status: JobStatus) => void },
  ): Promise<JobStatus> {
    validateId(jobId, 'jobId');
    const pollInterval = Math.max(options?.pollIntervalMs ?? 3000, MIN_POLL_INTERVAL);
    const timeout = options?.timeoutMs ?? 900_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const status = await this.get(jobId);
      options?.onPoll?.(status);

      if (status.status === 'completed') {
        return status;
      }
      if (status.status === 'failed') {
        throw new MurmrError(
          status.error || 'Job failed',
          { code: 'JOB_FAILED' },
        );
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new MurmrError(
      'Job polling timed out',
      { code: 'TIMEOUT' },
    );
  }
}
