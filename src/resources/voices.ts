import type { MurmrClient } from '../client';
import type { VoiceDesignOptions, VoiceDesignStreamOptions, VoiceSaveOptions, VoiceListResponse, SavedVoice, AudioStreamChunk } from '../types';
import { MurmrError } from '../errors';
import { parseSSEStream } from '../streaming';

function validateId(id: string, label: string): void {
  if (!id || !/^[\w-]+$/.test(id)) {
    throw new MurmrError(`Invalid ${label}: must contain only alphanumeric characters, hyphens, or underscores`);
  }
}

// Note: /api/v1/ routes are served by the Next.js frontend (voice management)
// while /v1/ routes go through the Cloudflare Worker (TTS generation)

export class VoicesResource {
  constructor(private readonly client: MurmrClient) {}

  /** List all saved voices for the authenticated user */
  async list(): Promise<VoiceListResponse> {
    const response = await this.client.request('/api/v1/voices', { method: 'GET' });
    return await response.json() as VoiceListResponse;
  }

  /** Generate speech with a voice description (VoiceDesign) */
  async design(options: VoiceDesignOptions): Promise<Buffer> {
    if (!options.input?.trim()) {
      throw new MurmrError('input text is required and cannot be empty');
    }
    if (!options.voice_description?.trim()) {
      throw new MurmrError('voice_description is required');
    }

    const body = {
      text: options.input,
      voice_description: options.voice_description,
      language: options.language || 'English',
      response_format: options.response_format || 'wav',
    };

    const response = await this.client.request('/v1/voices/design', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Stream speech with a voice description (VoiceDesign).
   * Returns an async generator of PCM audio chunks.
   *
   * Usage:
   *   const stream = await client.voices.designStream({
   *     input: 'Hello',
   *     voice_description: 'A warm female voice',
   *   });
   *   for await (const chunk of stream) {
   *     if (chunk.audio || chunk.chunk) {
   *       const pcm = Buffer.from((chunk.audio || chunk.chunk)!, 'base64');
   *     }
   *   }
   */
  async designStream(options: VoiceDesignStreamOptions): Promise<AsyncGenerator<AudioStreamChunk>> {
    if (!options.input?.trim()) {
      throw new MurmrError('input text is required and cannot be empty');
    }
    if (!options.voice_description?.trim()) {
      throw new MurmrError('voice_description is required');
    }

    const body = {
      input: options.input,
      voice_description: options.voice_description,
      language: options.language || 'English',
    };

    const response = await this.client.request('/v1/voices/design/stream', {
      method: 'POST',
      headers: { 'Accept': 'text/event-stream' },
      body: JSON.stringify(body),
    });

    return parseSSEStream(response);
  }

  /** Save a generated voice for reuse */
  async save(options: VoiceSaveOptions): Promise<SavedVoice> {
    if (!options.name?.trim()) {
      throw new MurmrError('voice name is required');
    }

    const body = {
      name: options.name,
      audio: options.audio.toString('base64'),
      description: options.description,
      language: options.language || 'English',
    };

    const response = await this.client.request('/api/v1/voices', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return await response.json() as SavedVoice;
  }

  /** Delete a saved voice */
  async delete(voiceId: string): Promise<void> {
    validateId(voiceId, 'voiceId');
    await this.client.request(`/api/v1/voices/${voiceId}`, { method: 'DELETE' });
  }
}
