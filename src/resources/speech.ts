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

/**
 * Result of `speech.create()`.
 *
 * - Without `webhook_url` (default): sync mode → returns a `Response` with binary audio.
 *   Use `.arrayBuffer()`, `.blob()`, or `.body` to consume the audio.
 * - With `webhook_url`: async mode → returns `AsyncJobResponse` with a job ID for polling.
 */
export type SpeechCreateResult = Response | AsyncJobResponse;

/**
 * Type guard: returns true if the result is a sync audio Response.
 */
export function isSyncResponse(result: SpeechCreateResult): result is Response {
  return result instanceof Response;
}

/**
 * Type guard: returns true if the result is an async job response.
 */
export function isAsyncResponse(result: SpeechCreateResult): result is AsyncJobResponse {
  return !(result instanceof Response) && 'id' in result && 'status' in result;
}

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
   * Generate speech from text using a saved voice.
   *
   * **Default (sync):** Returns a `Response` with binary audio bytes (HTTP 200).
   * Matches OpenAI's `/v1/audio/speech` contract.
   *
   * **With `webhook_url`:** Returns `AsyncJobResponse` with a job ID (HTTP 202).
   * Poll with `client.jobs.get(job.id)`.
   *
   * @example
   * ```ts
   * // Sync (default) — get audio directly
   * const response = await client.speech.create({ input: 'Hello', voice: 'voice_xxx' });
   * if (isSyncResponse(response)) {
   *   const audioBuffer = await response.arrayBuffer();
   * }
   *
   * // Async (webhook) — get job ID
   * const job = await client.speech.create({
   *   input: 'Hello', voice: 'voice_xxx', webhook_url: 'https://...'
   * });
   * if (isAsyncResponse(job)) {
   *   console.log(job.id);
   * }
   * ```
   */
  async create(options: SpeechCreateOptions): Promise<SpeechCreateResult> {
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

    // Sync mode (200): return raw Response with audio bytes
    if (response.status === 200) {
      return response;
    }

    // Async mode (202): parse job ID
    return (await response.json()) as AsyncJobResponse;
  }

  /**
   * Generate speech and wait for the audio result.
   *
   * If the server returns audio synchronously (default), returns immediately
   * as a completed `JobStatus`. If async (webhook_url), polls until completion.
   *
   * @example
   * ```ts
   * const result = await client.speech.createAndWait({
   *   input: 'Hello world',
   *   voice: 'voice_xxx',
   *   onPoll: (status) => console.log(status.status),
   * });
   * if (result.audio_base64) {
   *   const audioBuffer = Buffer.from(result.audio_base64, 'base64');
   * }
   * ```
   */
  async createAndWait(options: CreateAndWaitOptions): Promise<JobStatus | Response> {
    const { pollIntervalMs, timeoutMs, onPoll, ...createOptions } = options;
    const result = await this.create(createOptions);

    // Sync response — audio already available
    if (isSyncResponse(result)) {
      return result;
    }

    // Async response — poll until completion
    return this.client.jobs.waitForCompletion(result.id, {
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
