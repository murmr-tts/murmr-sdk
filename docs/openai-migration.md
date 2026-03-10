# OpenAI Migration Guide

murmr is designed as a drop-in replacement for OpenAI's Text-to-Speech API. If you are using OpenAI TTS today, you can switch to murmr with minimal code changes while gaining access to natural voice descriptions, more languages, and lower cost per character.

## Quick Migration

### Before (OpenAI)

```typescript
import OpenAI from 'openai';
import { writeFileSync } from 'node:fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.audio.speech.create({
  model: 'tts-1',
  voice: 'nova',
  input: 'Hello, this is a test.',
});

const buffer = Buffer.from(await response.arrayBuffer());
writeFileSync('output.mp3', buffer);
```

### After (murmr with Voice Design)

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Describe the voice you want instead of picking from a fixed list
const wav = await client.voices.design({
  input: 'Hello, this is a test.',
  voice_description: 'A warm, friendly female voice similar to a podcast host',
});

writeFileSync('output.wav', wav);
```

### After (murmr with Saved Voice)

For a workflow closer to OpenAI's fixed voice model, save a voice once and reuse it by ID:

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.create({
  input: 'Hello, this is a test.',
  voice: 'voice_abc123', // Your saved voice ID
  response_format: 'mp3',
});

if (isSyncResponse(result)) {
  writeFileSync('output.mp3', Buffer.from(await result.arrayBuffer()));
}
```

## Voice Strategy

OpenAI provides 6 fixed voices (`alloy`, `echo`, `fable`, `nova`, `onyx`, `shimmer`). murmr lets you create unlimited custom voices.

**Recommended migration path:**

1. Use Voice Design to describe the voice you want
2. Generate a reference audio sample
3. Save the voice for a persistent ID
4. Use the saved voice ID in all subsequent requests

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// One-time setup: create and save your voices
const voices = [
  {
    name: 'Nova Replacement',
    description: 'A warm, friendly female voice, mid-20s, American',
    refText: 'This is a reference recording for the Nova replacement voice.',
  },
  {
    name: 'Onyx Replacement',
    description: 'A deep, authoritative male voice, mid-40s, neutral accent',
    refText: 'This is a reference recording for the Onyx replacement voice.',
  },
];

for (const v of voices) {
  const wav = await client.voices.design({
    input: v.refText,
    voice_description: v.description,
  });

  const saved = await client.voices.save({
    name: v.name,
    description: v.description,
    audio: wav,
    ref_text: v.refText,
  });

  console.log(`${v.name}: ${saved.id}`);
}
```

## Key Differences

| Feature | OpenAI TTS | murmr |
|---------|-----------|-------|
| Voice selection | 6 fixed voices by name | Unlimited custom voices via description or saved IDs |
| Batch response | 200 with audio bytes | 200 with audio bytes (default) or 202 async with `webhook_url` |
| Streaming | Proprietary chunked response | Standard SSE (`text/event-stream`) |
| Audio formats | mp3, opus, aac, flac, wav, pcm | mp3, opus, aac, flac, wav, pcm |
| WebSocket realtime | Yes (separate API) | Yes (`/v1/realtime`) |
| Languages | Auto-detect only | 10 languages with explicit `language` parameter |
| Long-form | Manual chunking required | Built-in `createLongForm()` with auto-chunking |
| Max text length | 4,096 characters | 4,096 characters (unlimited via long-form) |
| Auth | `Authorization: Bearer sk-...` | `Authorization: Bearer murmr_sk_live_...` |
| Base URL | `https://api.openai.com/v1` | `https://api.murmr.dev` |

## REST API Comparison

### OpenAI (cURL)

```bash
curl https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "voice": "nova",
    "input": "Hello world"
  }' \
  --output output.mp3
```

### murmr (cURL)

```bash
curl https://api.murmr.dev/v1/audio/speech \
  -H "Authorization: Bearer $MURMR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "voice": "voice_abc123",
    "response_format": "mp3"
  }' \
  --output output.mp3
```

### Differences to Note

- murmr uses `text` (or `input` as alias) instead of `input` only
- No `model` parameter -- murmr automatically uses the best model
- `voice` accepts a saved voice ID (e.g., `voice_abc123`) rather than a name
- The `language` parameter is available for explicit language control

## OpenAI SDK Compatibility Note

If you are using the OpenAI Node.js SDK pointed at murmr's base URL, be aware that the batch endpoint may return HTTP 202 (async) instead of 200 (sync) depending on the request. The OpenAI SDK expects 200 and may not handle 202 responses correctly. Use the `@murmr/sdk` package for full compatibility.

```typescript
// This may not work correctly for all request types:
import OpenAI from 'openai';
const openai = new OpenAI({
  apiKey: process.env.MURMR_API_KEY,
  baseURL: 'https://api.murmr.dev/v1',
});

// Use the murmr SDK instead:
import { MurmrClient } from '@murmr/sdk';
const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});
```

## See Also

- [Quickstart](https://murmr.dev/en/docs/quickstart) -- Full getting started guide
- [Voice Design](https://murmr.dev/en/docs/voicedesign) -- Create custom voices with descriptions
- [Voices](https://murmr.dev/en/docs/voices) -- Save and manage voices
- [Speech Generation](https://murmr.dev/en/docs/speech) -- Batch and streaming endpoints
- [Languages](https://murmr.dev/en/docs/languages) -- Supported languages
