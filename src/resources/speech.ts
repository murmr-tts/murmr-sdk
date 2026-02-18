import type { MurmrClient } from '../client';
import type { SpeechCreateOptions, SpeechStreamOptions, AsyncJobResponse, AudioStreamChunk, LongFormOptions, LongFormResult } from '../types';
import { MurmrError } from '../errors';
import { createLongForm } from '../long-form';
import { parseSSEStream } from '../streaming';

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

    const response = await this.client.request('/v1/audio/speech', {
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
   * Stream speech from text using a saved voice.
   * Returns an async generator of PCM audio chunks.
   *
   * Usage:
   *   const stream = await client.speech.stream({ input: 'Hello', voice: 'voice_xxx' });
   *   for await (const chunk of stream) {
   *     if (chunk.audio || chunk.chunk) {
   *       const pcm = Buffer.from((chunk.audio || chunk.chunk)!, 'base64');
   *     }
   *   }
   */
  async stream(options: SpeechStreamOptions): Promise<AsyncGenerator<AudioStreamChunk>> {
    if (!options.input?.trim()) {
      throw new MurmrError('input text is required and cannot be empty');
    }
    if (!options.voice?.trim()) {
      throw new MurmrError('voice ID is required');
    }

    const voiceFields = options.voice_clone_prompt
      ? { voice_clone_prompt: options.voice_clone_prompt }
      : { voice: options.voice };

    const body = {
      input: options.input,
      ...voiceFields,
      language: options.language || 'English',
    };

    const response = await this.client.request('/v1/audio/speech/stream', {
      method: 'POST',
      headers: { 'Accept': 'text/event-stream' },
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
