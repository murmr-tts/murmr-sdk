import type { MurmrClient } from '../client';
import type { VoiceDesignOptions, VoiceSaveOptions, VoiceListResponse, SavedVoice } from '../types';
import { MurmrError } from '../errors';

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

    const response = await this.client.request('/v1/voices/design/batch', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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
