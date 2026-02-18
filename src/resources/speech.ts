import type { MurmrClient } from '../client';
import type {
  SpeechCreateOptions,
  SpeechStreamOptions,
  AsyncJobResponse,
  AudioStreamChunk,
  LongFormOptions,
  LongFormResult,
  JobStatus,
} from '../types';
import { MurmrError } from '../errors';
import { createLongForm } from '../long-form';
import { parseSSEStream } from '../streaming';
import { validateInput } from '../validate';

export interface CreateAndWaitOptions extends SpeechCreateOptions {
  /** Polling interval in milliseconds (minimum 1000). Default: 3000 */
  pollIntervalMs?: number;
  /** Maximum time to wait in milliseconds. Default: 900000 (15 min) */
  timeoutMs?: number;
  /** Called after each poll with the current job status */
  onPoll?: (status: JobStatus) => void;
}

export class SpeechResource {
  constructor(private readonly client: MurmrClient) {}

  /**
   * Submit a batch speech generation job using a saved voice.
   * Always returns an `AsyncJobResponse` with a job ID for polling.
   *
   * Use `createAndWait()` for a convenience method that polls until completion.
   *
   * @example
   * ```ts
   * const job = await client.speech.create({ input: 'Hello', voice: 'voice_xxx' });
   * console.log(job.id); // poll with client.jobs.get(job.id)
   * ```
   */
  async create(options: SpeechCreateOptions): Promise<AsyncJobResponse> {
    validateInput(options.input);

    if (!options.voice?.trim()) {
      throw new MurmrError('voice ID is required');
    }

    if (options.webhook_url) {
      try {
        const url = new URL(options.webhook_url);
        if (url.protocol !== 'https:') {
          throw new MurmrError('webhook_url must use HTTPS');
        }
      } catch (err) {
        if (err instanceof MurmrError) throw err;
        throw new MurmrError('webhook_url is not a valid URL');
      }
    }

    const voiceFields = options.voice_clone_prompt
      ? { voice_clone_prompt: options.voice_clone_prompt }
      : { voice: options.voice };

    const body = {
      text: options.input,
      ...voiceFields,
      language: options.language || 'English',
      response_format: options.response_format || 'wav',
      ...(options.webhook_url && { webhook_url: options.webhook_url }),
    };

    const response = await this.client.request('/v1/audio/speech', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return (await response.json()) as AsyncJobResponse;
  }

  /**
   * Submit a batch speech generation job and wait for completion.
   * Combines `create()` with `client.jobs.waitForCompletion()`.
   *
   * Returns the completed `JobStatus` which includes `audio_base64` with the
   * generated audio data.
   *
   * @example
   * ```ts
   * const result = await client.speech.createAndWait({
   *   input: 'Hello world',
   *   voice: 'voice_xxx',
   *   onPoll: (status) => console.log(status.status),
   * });
   * const audioBuffer = Buffer.from(result.audio_base64!, 'base64');
   * ```
   */
  async createAndWait(options: CreateAndWaitOptions): Promise<JobStatus> {
    const { pollIntervalMs, timeoutMs, onPoll, ...createOptions } = options;
    const job = await this.create(createOptions);

    return this.client.jobs.waitForCompletion(job.id, {
      pollIntervalMs,
      timeoutMs,
      onPoll,
    });
  }

  /**
   * Stream speech from text using a saved voice.
   * Returns an async generator of PCM audio chunks via SSE.
   *
   * @example
   * ```ts
   * const stream = await client.speech.stream({ input: 'Hello', voice: 'voice_xxx' });
   * for await (const chunk of stream) {
   *   if (chunk.audio || chunk.chunk) {
   *     const pcm = Buffer.from((chunk.audio || chunk.chunk)!, 'base64');
   *   }
   * }
   * ```
   */
  async stream(options: SpeechStreamOptions): Promise<AsyncGenerator<AudioStreamChunk>> {
    validateInput(options.input);

    if (!options.voice?.trim()) {
      throw new MurmrError('voice ID is required');
    }

    const voiceFields = options.voice_clone_prompt
      ? { voice_clone_prompt: options.voice_clone_prompt }
      : { voice: options.voice };

    const body = {
      text: options.input,
      ...voiceFields,
      language: options.language || 'English',
    };

    const response = await this.client.request('/v1/audio/speech/stream', {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });

    return parseSSEStream(response);
  }

  /**
   * Generate long-form audio from text of any length.
   * Handles chunking, retries, progress reporting, and concatenation.
   */
  async createLongForm(options: LongFormOptions): Promise<LongFormResult> {
    return createLongForm(this.client, options);
  }
}
