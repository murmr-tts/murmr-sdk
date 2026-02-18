import type { MurmrClient } from '../client';
import type {
  VoiceDesignOptions,
  VoiceDesignStreamOptions,
  AudioStreamChunk,
} from '../types';
import { MurmrError } from '../errors';
import { parseSSEStream, collectStreamAsWav } from '../streaming';
import { validateInput } from '../validate';

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
}
