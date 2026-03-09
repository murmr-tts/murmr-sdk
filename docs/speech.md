# Speech Generation

Generate speech from text using a saved voice. murmr provides two speech endpoints: a batch endpoint that returns complete audio files, and a streaming endpoint that delivers audio chunks via Server-Sent Events (SSE) for low-latency playback.

## Batch Generation

`POST /v1/audio/speech` submits a batch job. By default it returns audio synchronously (HTTP 200). With a `webhook_url`, it returns a job ID (HTTP 202) for async processing.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize. Max 4,096 characters. |
| `voice` | string | Yes* | Saved voice ID (e.g., `voice_abc123`). |
| `voice_clone_prompt` | string | No | Base64-encoded embedding data. Overrides `voice` if both provided. |
| `language` | string | No | Language name. SDK defaults to `English`; raw API defaults to `Auto`. See [Languages](https://murmr.dev/en/docs/languages). |
| `response_format` | string | No | Output format: `mp3` (default), `opus`, `aac`, `flac`, `wav`, `pcm`. |
| `webhook_url` | string | No | HTTPS URL for async job delivery. |
| `input` | string | -- | Alias for `text`. The SDK uses `input`. |

> *Either `voice` or `voice_clone_prompt` is required. If you pass `voice_clone_prompt`, the `voice` parameter is ignored.

### SDK: Batch (Sync)

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.create({
  input: 'Hello from the murmr TTS API.',
  voice: 'voice_abc123',
  response_format: 'mp3',
});

if (isSyncResponse(result)) {
  const buffer = Buffer.from(await result.arrayBuffer());
  writeFileSync('output.mp3', buffer);
}
```

### SDK: Batch (Async with Webhook)

```typescript
import { MurmrClient, isAsyncResponse } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.create({
  input: 'This will be processed asynchronously.',
  voice: 'voice_abc123',
  webhook_url: 'https://yourapp.com/webhooks/tts',
});

if (isAsyncResponse(result)) {
  console.log(`Job submitted: ${result.id}`);
  // Your webhook handler will receive the audio when ready
}
```

### SDK: Batch (Poll Until Done)

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.createAndWait({
  input: 'Wait for the audio to be ready.',
  voice: 'voice_abc123',
  response_format: 'wav',
  onPoll: (status) => console.log(`Status: ${status.status}`),
});

if (isSyncResponse(result)) {
  const buffer = Buffer.from(await result.arrayBuffer());
  writeFileSync('output.wav', buffer);
} else if (result.audio_base64) {
  const buffer = Buffer.from(result.audio_base64, 'base64');
  writeFileSync('output.wav', buffer);
}
```

### cURL: Batch

```bash
curl -X POST https://api.murmr.dev/v1/audio/speech \
  -H "Authorization: Bearer $MURMR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from the murmr TTS API.",
    "voice": "voice_abc123",
    "response_format": "mp3"
  }' \
  --output output.mp3
```

## Streaming Generation

`POST /v1/audio/speech/stream` returns audio chunks via SSE as they are generated. First chunk latency is typically under 450ms.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize. Max 4,096 characters. |
| `voice` | string | Yes* | Saved voice ID. |
| `voice_clone_prompt` | string | No | Base64-encoded embedding data. Overrides `voice`. |
| `language` | string | No | Language name. SDK defaults to `English`; raw API defaults to `Auto`. |
| `input` | string | -- | Alias for `text`. The SDK uses `input`. |

> Streaming always returns raw PCM audio (24kHz, 16-bit, mono). The `response_format` parameter is not supported for streaming.

### SDK: Streaming

```typescript
import { MurmrClient, collectStreamAsWav } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Option 1: Process chunks as they arrive
const stream = await client.speech.stream({
  input: 'Stream audio for real-time playback.',
  voice: 'voice_abc123',
});

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    const pcm = Buffer.from(audioData, 'base64');
    // Send to audio player, write to file, etc.
  }
  if (chunk.done) {
    console.log(`Done in ${chunk.total_time_ms}ms`);
  }
}
```

### cURL: Streaming

```bash
curl -X POST https://api.murmr.dev/v1/audio/speech/stream \
  -H "Authorization: Bearer $MURMR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "text": "Stream audio for real-time playback.",
    "voice": "voice_abc123"
  }'
```

## Error Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 400 | Bad Request | Missing `text`, text exceeds 4,096 chars, invalid `response_format` |
| 401 | Unauthorized | Missing or invalid API key |
| 404 | Not Found | Voice ID does not exist or belongs to another user |
| 429 | Rate Limited | Monthly character limit exceeded or too many concurrent requests |

See the [Errors guide](https://murmr.dev/en/docs/errors) for detailed error handling.

## See Also

- [Voice Design](https://murmr.dev/en/docs/voicedesign) -- Generate with a voice description instead of a saved voice
- [Streaming](https://murmr.dev/en/docs/streaming) -- SSE format details and browser playback
- [Async Jobs](https://murmr.dev/en/docs/async-jobs) -- Polling and webhook patterns
- [Audio Formats](https://murmr.dev/en/docs/audio-formats) -- Format comparison and conversion
- [Long-Form Audio](https://murmr.dev/en/docs/long-form) -- Generate audio longer than 4,096 characters
