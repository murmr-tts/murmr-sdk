# Quickstart

Get started with the murmr TTS API in under 5 minutes. This guide walks you through installing the SDK, generating your first audio with a natural language voice description, streaming audio, saving a voice, and reusing it.

## Prerequisites

- **Node.js 18+** (uses native `fetch` and `AbortSignal.timeout`)
- A **murmr account** with an API key ([sign up at murmr.dev](https://murmr.dev))
- **TypeScript** (recommended) or JavaScript

## Install the SDK

```bash
npm install @murmr/sdk
```

Or with your preferred package manager:

```bash
pnpm add @murmr/sdk
yarn add @murmr/sdk
```

## Initialize the Client

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});
```

> **Never hardcode API keys.** Always use environment variables. See the [Authentication guide](https://murmr.dev/en/docs/authentication) for best practices.

## Generate Audio with Voice Design

Describe any voice in natural language and generate speech in a single call. The `design()` method returns a complete WAV buffer.

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const wav = await client.voices.design({
  input: 'Welcome to murmr. The most natural text-to-speech API.',
  voice_description: 'A warm, confident male narrator with a slight British accent',
  language: 'English',
});

writeFileSync('welcome.wav', wav);
console.log(`Saved ${wav.length} bytes to welcome.wav`);
```

## Stream Audio in Real Time

For lower latency, stream audio chunks as they are generated. The first chunk typically arrives in under 450ms.

```typescript
import { MurmrClient } from '@murmr/sdk';
import { createWriteStream } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const stream = await client.voices.designStream({
  input: 'Streaming delivers audio with minimal latency.',
  voice_description: 'A calm female voice, clear and articulate',
});

const file = createWriteStream('streamed.pcm');

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    file.write(Buffer.from(audioData, 'base64'));
  }
  if (chunk.done) {
    console.log(`Stream complete in ${chunk.total_time_ms}ms`);
  }
}

file.end();
```

> Streamed audio is raw PCM (24kHz, 16-bit, mono). Use `collectStreamAsWav()` to get a complete WAV buffer instead. See the [Streaming guide](https://murmr.dev/en/docs/streaming) for details.

## Save a Voice for Reuse

Once you find a voice you like, save it so you can generate consistent speech without re-describing the voice each time.

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Step 1: Generate audio with voice design
const inputText = 'This is my reference audio for saving a voice.';
const wav = await client.voices.design({
  input: inputText,
  voice_description: 'A friendly, upbeat female voice',
});

// Step 2: Save the voice
const saved = await client.voices.save({
  name: 'Friendly Female',
  description: 'A friendly, upbeat female voice for product demos',
  audio: wav,
  ref_text: inputText,
  language: 'English',
});

console.log(`Voice saved: ${saved.id}`);
// Output: Voice saved: voice_a1b2c3d4e5f6
```

## Generate with a Saved Voice

Use the saved voice ID for consistent, repeatable speech generation.

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Batch generation (returns complete audio)
const result = await client.speech.create({
  input: 'Every call with this voice ID sounds the same.',
  voice: 'voice_a1b2c3d4e5f6',
});

if (isSyncResponse(result)) {
  const buffer = Buffer.from(await result.arrayBuffer());
  writeFileSync('consistent.wav', buffer);
}

// Or stream for lower latency
const stream = await client.speech.stream({
  input: 'Streaming with a saved voice is just as easy.',
  voice: 'voice_a1b2c3d4e5f6',
});

for await (const chunk of stream) {
  if (chunk.audio || chunk.chunk) {
    // Process PCM audio chunk
  }
}
```

## Next Steps

| Topic | Description |
|-------|-------------|
| [Authentication](https://murmr.dev/en/docs/authentication) | API key management and security |
| [Voice Design](https://murmr.dev/en/docs/voicedesign) | Advanced voice description techniques |
| [Streaming](https://murmr.dev/en/docs/streaming) | SSE streaming deep dive |
| [Long-Form Audio](https://murmr.dev/en/docs/long-form) | Generate audio from text of any length |
| [Audio Formats](https://murmr.dev/en/docs/audio-formats) | WAV, MP3, Opus, and more |
| [Error Handling](https://murmr.dev/en/docs/errors) | Robust error handling patterns |
