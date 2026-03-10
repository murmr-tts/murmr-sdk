# Streaming

murmr delivers audio via Server-Sent Events (SSE) for low-latency playback. First chunk latency is typically under 450ms. This guide covers the SSE format, streaming endpoints, browser playback, and Node.js usage patterns.

## Streaming Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/audio/speech/stream` | POST | Stream with a saved voice |
| `/v1/voices/design` | POST | Stream with a voice description |
| `/v1/voices/design/stream` | POST | Stream with a voice description (explicit stream path) |

All streaming endpoints return `text/event-stream` responses with base64-encoded PCM audio chunks.

## Audio Specifications

| Property | Value |
|----------|-------|
| Sample rate | 24,000 Hz |
| Bit depth | 16-bit |
| Channels | Mono (1) |
| Encoding | PCM signed 16-bit little-endian (`pcm_s16le`) |
| Chunk encoding | Base64 |

## SSE Event Format

Each SSE event is a `data:` line containing a JSON object.

### Audio Chunk Event

```
data: {"chunk":"<base64 PCM data>","chunk_index":0,"sample_rate":24000,"format":"pcm_s16le"}
```

### Completion Event

```
data: {"done":true,"total_chunks":42,"total_time_ms":3250,"first_chunk_latency_ms":380}
```

### Field Reference

| Field | Type | Present In | Description |
|-------|------|-----------|-------------|
| `audio` | string | Audio chunks | Base64-encoded PCM data |
| `chunk` | string | Audio chunks | Alias for `audio` (some endpoints use this) |
| `chunk_index` | number | Audio chunks | Zero-based index of the chunk |
| `sample_rate` | number | Audio chunks | Always `24000` |
| `format` | string | Audio chunks | Always `pcm_s16le` |
| `first_chunk_latency_ms` | number | First audio chunk | Time to first byte in milliseconds |
| `done` | boolean | Completion | `true` when stream is complete |
| `total_chunks` | number | Completion | Total audio chunks sent |
| `total_time_ms` | number | Completion | Total generation time |
| `error` | string | Error events | Error message if generation failed mid-stream |

## Node.js: Stream to File

```typescript
import { MurmrClient, collectStreamAsWav } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Option 1: Collect entire stream as WAV
const stream = await client.voices.designStream({
  input: 'Collect the full stream into a WAV file.',
  voice_description: 'A professional female narrator',
});

// Manual collection with progress tracking
const pcmChunks: Buffer[] = [];

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    pcmChunks.push(Buffer.from(audioData, 'base64'));
  }
  if (chunk.first_chunk_latency_ms) {
    console.log(`TTFC: ${chunk.first_chunk_latency_ms}ms`);
  }
}

// Build WAV manually using SDK utilities
import { createWavHeader } from '@murmr/sdk';

const pcm = Buffer.concat(pcmChunks);
const wav = Buffer.concat([createWavHeader(pcm.length), pcm]);
writeFileSync('output.wav', wav);
```

## Browser: Web Audio API Playback

Stream audio directly to the browser for real-time playback. This example uses the Web Audio API with a proxy endpoint on your server.

```typescript
// Browser-side code
async function playStream(text: string): Promise<void> {
  const audioContext = new AudioContext({ sampleRate: 24000 });
  let nextStartTime = audioContext.currentTime;

  const response = await fetch('/api/tts/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const event = JSON.parse(trimmed.slice(6));
      const audioData = event.audio || event.chunk;
      if (!audioData) continue;

      // Decode base64 PCM to Float32
      const raw = Uint8Array.from(atob(audioData), (c) => c.charCodeAt(0));
      const int16 = new Int16Array(raw.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      // Schedule audio buffer for gapless playback
      const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(nextStartTime);
      nextStartTime += audioBuffer.duration;
    }
  }
}
```

## Batch vs Streaming Comparison

| Feature | Batch (`/v1/audio/speech`) | Streaming (`/v1/audio/speech/stream`) |
|---------|---------------------------|--------------------------------------|
| Latency | Seconds (full generation) | ~450ms to first chunk |
| Response | Complete audio file | SSE with PCM chunks |
| Formats | wav, mp3, opus, aac, flac, pcm | PCM only (24kHz, 16-bit, mono) |
| Max text | 4,096 characters | 4,096 characters |
| Webhook support | Yes | No |
| Best for | File generation, async workflows | Real-time playback, interactive apps |

## Error Handling in Streams

Errors can occur before the stream starts (HTTP error status) or mid-stream (error event in SSE).

```typescript
import { MurmrClient, MurmrError } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

try {
  const stream = await client.speech.stream({
    input: 'Handle errors gracefully.',
    voice: 'voice_abc123',
  });

  for await (const chunk of stream) {
    if (chunk.error) {
      console.error(`Stream error: ${chunk.error}`);
      break;
    }

    const audioData = chunk.audio || chunk.chunk;
    if (audioData) {
      // Process audio
    }
  }
} catch (error) {
  if (error instanceof MurmrError) {
    console.error(`API error ${error.status}: ${error.message}`);
  }
}
```

## See Also

- [Speech Generation](https://murmr.dev/en/docs/speech) -- Batch and streaming endpoints
- [Voice Design](https://murmr.dev/en/docs/voicedesign) -- Streaming with voice descriptions
- [Realtime WebSocket](https://murmr.dev/en/docs/realtime) -- Even lower latency with WebSocket
- [Audio Formats](https://murmr.dev/en/docs/audio-formats) -- PCM specifications and conversion
