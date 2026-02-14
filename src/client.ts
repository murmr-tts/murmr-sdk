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
      try {
        const errorBody = await response.json() as { error?: string };
        errorMessage = errorBody.error || `Request failed with status ${response.status}`;
      } catch {
        errorMessage = `Request failed with status ${response.status}`;
      }
      throw new MurmrError(errorMessage, { status: response.status });
    }

    return response;
  }
}
