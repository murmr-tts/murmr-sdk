# Voice Design

Voice Design lets you describe any voice in natural language and generate speech in a single request. No pre-recorded samples, no voice IDs -- just describe what you want and murmr creates it.

## How It Works

The Voice Design endpoint (`POST /v1/voices/design`) accepts a text prompt and a voice description. It supports three modes:

1. **Streaming (SSE)** -- `POST /v1/voices/design/stream` returns audio chunks via Server-Sent Events as they are generated.
2. **Sync batch** -- `POST /v1/voices/design` without a `webhook_url` returns a complete WAV audio response (HTTP 200).
3. **Async batch** -- `POST /v1/voices/design` with a `webhook_url` returns a job ID (HTTP 202) and delivers the result to your webhook when ready. Poll status with `GET /v1/jobs/{jobId}`.

The SDK provides two methods: `design()` collects the full stream into a WAV buffer, and `designStream()` yields chunks as they arrive.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize. Max 4,096 characters. |
| `voice_description` | string | Yes | Natural language description of the desired voice. Max 500 characters. |
| `language` | string | No | Language name. SDK defaults to `English`; raw API defaults to `Auto`. See [Languages](https://murmr.dev/en/docs/languages). |
| `input` | string | -- | Alias for `text`. The SDK uses `input`. |
| `webhook_url` | string | No | HTTPS URL for async delivery. When provided, the API returns HTTP 202 with a job ID instead of audio. |
| `response_format` | string | No | Audio format for batch mode: `mp3`, `opus`, `aac`, `flac`, `wav` (default), `pcm`. |

> **Note:** The `instruct` parameter is not available for Voice Design. It only works with saved voices via `/v1/audio/speech` -- see the [Speech guide](https://murmr.dev/en/docs/speech) for details.

## SDK: Complete WAV

The `design()` method streams the audio internally and returns a complete WAV buffer (24kHz, mono, 16-bit PCM).

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const wav = await client.voices.design({
  input: 'The quick brown fox jumps over the lazy dog.',
  voice_description: 'A deep, resonant male voice with a slow, deliberate pace',
  language: 'English',
});

writeFileSync('voicedesign.wav', wav);
```

## SDK: Streaming Chunks

For lower latency, use `designStream()` to process audio chunks as they are generated.

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const stream = await client.voices.designStream({
  input: 'Streaming voice design delivers faster time to first audio.',
  voice_description: 'A warm, friendly female voice with natural inflection',
});

const pcmChunks: Buffer[] = [];

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    pcmChunks.push(Buffer.from(audioData, 'base64'));
  }
  if (chunk.first_chunk_latency_ms) {
    console.log(`First chunk in ${chunk.first_chunk_latency_ms}ms`);
  }
  if (chunk.done) {
    console.log(`Complete: ${chunk.total_chunks} chunks in ${chunk.total_time_ms}ms`);
  }
}
```

## SSE Event Format

The streaming response uses Server-Sent Events. Each event contains a JSON payload:

**Audio chunk:**
```
data: {"chunk":"<base64 PCM>","chunk_index":0,"sample_rate":24000,"format":"pcm_s16le"}
```

**Completion event:**
```
data: {"done":true,"total_chunks":42,"total_time_ms":3250}
```

See the [Streaming guide](https://murmr.dev/en/docs/streaming) for the full field reference.

## Batch Mode (Sync)

You can also call the Voice Design endpoint without SSE streaming. When no `Accept: text/event-stream` header is sent, the API returns a complete audio file as binary data (HTTP 200).

```bash
curl -X POST https://api.murmr.dev/v1/voices/design \
  -H "Authorization: Bearer $MURMR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from batch voice design.",
    "voice_description": "A calm, professional male narrator",
    "language": "English",
    "response_format": "mp3"
  }' \
  --output voicedesign.mp3
```

## Batch Mode (Async with Webhook)

For long-running requests or background processing, provide a `webhook_url`. The API returns HTTP 202 with a job ID immediately, and delivers the result to your webhook when generation is complete.

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Submit async job
const response = await fetch('https://api.murmr.dev/v1/voices/design', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.MURMR_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'Generate this in the background.',
    voice_description: 'A cheerful young woman with an American accent',
    language: 'English',
    webhook_url: 'https://your-server.com/webhooks/tts',
  }),
});

// Response: 202 with job metadata
const job = await response.json();
console.log(job.id);     // "job_abc123..."
console.log(job.status); // "queued"

// Poll for status (or wait for webhook delivery)
const status = await client.jobs.get(job.id);
```

## cURL Example (Streaming)

```bash
curl -X POST https://api.murmr.dev/v1/voices/design \
  -H "Authorization: Bearer $MURMR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "text": "Hello from murmr voice design.",
    "voice_description": "A cheerful young woman with an American accent",
    "language": "English"
  }'
```

## Voice Description Best Practices

Good voice descriptions are specific about tone, pace, gender, age, and accent. Vague descriptions produce inconsistent results.

### Good Descriptions

| Description | Why It Works |
|-------------|-------------|
| "A deep, resonant male voice with a slow, deliberate pace and a slight Southern drawl" | Specific about pitch, pace, and accent |
| "A young woman with a bright, energetic tone, speaking quickly with a London accent" | Covers age, energy, speed, and locale |
| "A calm, authoritative male narrator in his 50s, like a documentary voiceover" | Uses relatable reference for style |
| "A warm grandmother reading a bedtime story, soft and gentle with pauses" | Evokes a specific emotional quality |

### Bad Descriptions

| Description | Problem |
|-------------|---------|
| "A nice voice" | Too vague -- no actionable characteristics |
| "Make it sound professional" | "Professional" is subjective and underspecified |
| "Voice #3 from the other API" | References external systems murmr cannot interpret |
| "LOUD AND FAST AND EXCITING" | Describes delivery style, not voice characteristics |

### Tips

- **Be specific about gender, age, and accent.** "A 30-year-old British woman" is better than "a female voice."
- **Describe the voice, not the emotion.** "A deep, gravelly baritone" gives better results than "an angry voice."
- **Use familiar archetypes.** "Like a late-night radio host" conveys tone, pace, and register effectively.
- **Keep it under 200 characters.** The API accepts up to 500, but concise descriptions produce more consistent results.

## Saving a Designed Voice

Each Voice Design call generates a unique voice. To reuse the same voice, save it:

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const inputText = 'This is the reference audio for my saved voice.';

const wav = await client.voices.design({
  input: inputText,
  voice_description: 'A confident male tech presenter, mid-30s, American',
});

const saved = await client.voices.save({
  name: 'Tech Presenter',
  description: 'Confident male, mid-30s, American, for product demos',
  audio: wav,
  ref_text: inputText,
  language: 'English',
});

console.log(`Saved as ${saved.id} -- use this ID in future requests`);
```

Once saved, use the voice ID with `client.speech.create()` or `client.speech.stream()` for consistent output. See the [Voices guide](https://murmr.dev/en/docs/voices) for the full voice management workflow.

## See Also

- [Speech Generation](https://murmr.dev/en/docs/speech) -- Generate with saved voices
- [Voices](https://murmr.dev/en/docs/voices) -- Save, list, and delete voices
- [Streaming](https://murmr.dev/en/docs/streaming) -- SSE format and playback
- [Languages](https://murmr.dev/en/docs/languages) -- Supported languages and cross-lingual synthesis
