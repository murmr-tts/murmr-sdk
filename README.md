# @murmr/sdk

Official Node.js SDK for the [murmr](https://murmr.dev) TTS API. Zero runtime dependencies, TypeScript-first.

## Install

```bash
npm install @murmr/sdk
```

## Quick Start

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({ apiKey: 'your-api-key' });

// Generate speech with a saved voice
const audio = await client.speech.create({
  input: 'Hello from murmr!',
  voice: 'voice_abc123',
});

// Generate speech with VoiceDesign
const designed = await client.voices.design({
  input: 'Hello from murmr!',
  voice_description: 'A warm, friendly female voice',
});
```

## Long-Form Audio

Generate audio from text of any length with automatic chunking, retries, and progress reporting:

```typescript
const result = await client.speech.createLongForm({
  input: longArticleText,
  voice: 'voice_abc123',
  onProgress: ({ current, total, percent }) => {
    console.log(`Chunk ${current}/${total} (${percent}%)`);
  },
});

fs.writeFileSync('output.wav', result.audio);
```

## Async / Webhook Mode

```typescript
const job = await client.speech.create({
  input: 'Hello!',
  voice: 'voice_abc123',
  webhook_url: 'https://your-app.com/webhook',
});

// Or poll for completion
const status = await client.jobs.waitForCompletion(job.id);
```

## Voice Management

```typescript
// List saved voices
const { voices } = await client.voices.list();

// Save a new voice
const saved = await client.voices.save({
  name: 'My Voice',
  audio: audioBuffer,
  description: 'A warm narrator voice',
});

// Delete a voice
await client.voices.delete('voice_abc123');
```

## Requirements

- Node.js 18+
- No runtime dependencies (uses native `fetch`)

## License

MIT
