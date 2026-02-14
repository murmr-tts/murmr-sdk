import type { MurmrClient } from '../client';
import type { SpeechCreateOptions, AsyncJobResponse, LongFormOptions, LongFormResult } from '../types';
import { MurmrError } from '../errors';
import { createLongForm } from '../long-form';

export class SpeechResource {
  constructor(private readonly client: MurmrClient) {}

  /**
   * Generate speech from text using a saved voice.
   * Returns audio as a Buffer, or an AsyncJobResponse if webhook_url is provided.
   */
  async create(options: SpeechCreateOptions): Promise<Buffer | AsyncJobResponse> {
    if (!options.input?.trim()) {
      throw new MurmrError('input text is required and cannot be empty');
    }
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

    const response = await this.client.request('/v1/audio/speech/batch', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (response.status === 202) {
      return await response.json() as AsyncJobResponse;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Generate long-form audio from text of any length.
   * Handles chunking, retries, progress reporting, and concatenation.
   */
  async createLongForm(options: LongFormOptions): Promise<LongFormResult> {
    return createLongForm(this.client, options);
  }
}
