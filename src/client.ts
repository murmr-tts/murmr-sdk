import type { MurmrClientOptions } from './types';
import { MurmrError } from './errors';
import { SpeechResource } from './resources/speech';
import { VoicesResource } from './resources/voices';
import { JobsResource } from './resources/jobs';

const DEFAULT_BASE_URL = 'https://api.murmr.dev';
const DEFAULT_TIMEOUT = 300_000;

export class MurmrClient {
  readonly speech: SpeechResource;
  readonly voices: VoicesResource;
  readonly jobs: JobsResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: MurmrClientOptions) {
    if (!options.apiKey) {
      throw new MurmrError('apiKey is required');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;

    this.speech = new SpeechResource(this);
    this.voices = new VoicesResource(this);
    this.jobs = new JobsResource(this);
  }

  /** @internal Used by resource classes. Not part of the public API. */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: options.signal || AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      let errorMessage: string;
      let errorType: string | undefined;
      let errorCode: string | undefined;
      let concurrentLimit: number | undefined;
      let concurrentActive: number | undefined;
      try {
        const errorBody = await response.json() as {
          error?: string | { type?: string; message?: string; code?: string; param?: string };
        };
        if (typeof errorBody.error === 'object' && errorBody.error !== null) {
          // OpenAI-format structured error
          errorMessage = errorBody.error.message || `Request failed with status ${response.status}`;
          errorType = errorBody.error.type;
          errorCode = errorBody.error.code ?? undefined;
          // Concurrent info now in headers
          concurrentLimit = parseInt(response.headers.get('X-Concurrent-Limit') || '0') || undefined;
          concurrentActive = parseInt(response.headers.get('X-Concurrent-Active') || '0') || undefined;
        } else {
          errorMessage = (errorBody.error as string) || `Request failed with status ${response.status}`;
        }
      } catch {
        errorMessage = `Request failed with status ${response.status}`;
      }
      throw new MurmrError(errorMessage, {
        status: response.status,
        type: errorType,
        code: errorCode,
        concurrentLimit,
        concurrentActive,
      });
    }

    return response;
  }
}
