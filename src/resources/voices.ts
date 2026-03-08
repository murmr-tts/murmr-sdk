import type { MurmrClient } from '../client';
import type {
  VoiceDesignOptions,
  VoiceDesignStreamOptions,
  AudioStreamChunk,
  VoiceListResponse,
  VoiceSaveOptions,
  VoiceSaveResponse,
  VoiceDeleteResponse,
  ExtractEmbeddingsOptions,
  ExtractEmbeddingsResponse,
} from '../types';
import { MurmrError } from '../errors';
import { parseSSEStream, collectStreamAsWav } from '../streaming';
import { validateInput, validateId } from '../validate';

export class VoicesResource {
  constructor(private readonly client: MurmrClient) {}

  /**
   * Generate speech with a natural language voice description.
   *
   * Sends the text to the VoiceDesign endpoint, collects the SSE stream,
   * and returns a complete WAV buffer (24kHz, mono, 16-bit PCM).
   *
   * @example
   * ```ts
   * const wav = await client.voices.design({
   *   input: 'Hello, world!',
   *   voice_description: 'A warm, friendly female voice',
   * });
   * fs.writeFileSync('output.wav', wav);
   * ```
   */
  async design(options: VoiceDesignOptions): Promise<Buffer> {
    validateInput(options.input);
    if (!options.voice_description?.trim()) {
      throw new MurmrError('voice_description is required');
    }

    const body = {
      text: options.input,
      voice_description: options.voice_description,
      language: options.language || 'English',
    };

    const response = await this.client.request('/v1/voices/design', {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });

    return collectStreamAsWav(response);
  }

  /**
   * Stream speech with a natural language voice description.
   *
   * Returns an async generator of PCM audio chunks (base64-encoded,
   * 24kHz, mono, 16-bit).
   *
   * @example
   * ```ts
   * const stream = await client.voices.designStream({
   *   input: 'Hello, world!',
   *   voice_description: 'A calm male narrator',
   * });
   * for await (const chunk of stream) {
   *   if (chunk.audio || chunk.chunk) {
   *     const pcm = Buffer.from((chunk.audio || chunk.chunk)!, 'base64');
   *     // process PCM data
   *   }
   * }
   * ```
   */
  async designStream(
    options: VoiceDesignStreamOptions,
  ): Promise<AsyncGenerator<AudioStreamChunk>> {
    validateInput(options.input);
    if (!options.voice_description?.trim()) {
      throw new MurmrError('voice_description is required');
    }

    const body = {
      text: options.input,
      voice_description: options.voice_description,
      language: options.language || 'English',
    };

    const response = await this.client.request('/v1/voices/design/stream', {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });

    return parseSSEStream(response);
  }

  /**
   * List saved voices for the authenticated user.
   */
  async list(): Promise<VoiceListResponse> {
    const response = await this.client.request('/v1/voices');
    return (await response.json()) as VoiceListResponse;
  }

  /**
   * Save a voice from audio for reuse with saved-voice endpoints.
   * The audio should be a WAV buffer from a VoiceDesign generation.
   */
  async save(options: VoiceSaveOptions): Promise<VoiceSaveResponse> {
    if (!options.name?.trim()) {
      throw new MurmrError('name is required');
    }
    if (options.name.trim().length > 50) {
      throw new MurmrError('name must be 50 characters or fewer');
    }
    if (!options.description?.trim()) {
      throw new MurmrError('description is required');
    }
    if (!options.audio || options.audio.length === 0) {
      throw new MurmrError('audio is required');
    }
    if (!options.ref_text?.trim()) {
      throw new MurmrError('ref_text is required (transcript of the reference audio)');
    }

    const audioBase64 = Buffer.from(options.audio).toString('base64');

    const response = await this.client.request('/v1/voices', {
      method: 'POST',
      body: JSON.stringify({
        name: options.name,
        audio: audioBase64,
        description: options.description,
        language: options.language || 'English',
        ref_text: options.ref_text,
      }),
    });
    return (await response.json()) as VoiceSaveResponse;
  }

  /**
   * Delete a saved voice by ID.
   */
  async delete(voiceId: string): Promise<VoiceDeleteResponse> {
    validateId(voiceId, 'voiceId');
    const response = await this.client.request(`/v1/voices/${voiceId}`, {
      method: 'DELETE',
    });
    return (await response.json()) as VoiceDeleteResponse;
  }

  /**
   * Extract voice embeddings from audio.
   *
   * Returns portable embedding data that can be stored in your own database
   * and passed via `voice_clone_prompt` in any TTS request — no saved voice
   * ID needed.
   *
   * @example
   * ```ts
   * const { prompt_data } = await client.voices.extractEmbeddings({
   *   audio: wavBuffer,
   *   ref_text: 'The transcript of the audio.',
   * });
   * // Store prompt_data in your database, then use it:
   * const stream = await client.speech.stream({
   *   input: 'Hello!',
   *   voice: 'unused',
   *   voice_clone_prompt: prompt_data,
   * });
   * ```
   */
  async extractEmbeddings(
    options: ExtractEmbeddingsOptions,
  ): Promise<ExtractEmbeddingsResponse> {
    if (!options.audio || options.audio.length === 0) {
      throw new MurmrError('audio is required');
    }
    if (!options.ref_text?.trim()) {
      throw new MurmrError('ref_text is required (transcript of the reference audio)');
    }

    const audioBase64 = Buffer.from(options.audio).toString('base64');

    const response = await this.client.request('/v1/voices/extract-embeddings', {
      method: 'POST',
      body: JSON.stringify({
        audio: audioBase64,
        ref_text: options.ref_text,
      }),
    });

    const result = (await response.json()) as {
      success?: boolean;
      prompt_data?: string;
      prompt_size_bytes?: number;
      error?: string;
    };

    if (!result.prompt_data) {
      throw new MurmrError(result.error || 'Failed to extract embeddings');
    }

    return {
      prompt_data: result.prompt_data,
      prompt_size_bytes: result.prompt_size_bytes ?? 0,
    };
  }
}
