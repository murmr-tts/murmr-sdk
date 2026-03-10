# Voice Management

murmr lets you save voices for consistent, repeatable speech generation. This guide covers the full voice lifecycle: designing a voice, saving it, listing your voices, extracting embeddings, and deleting voices.

## Overview

There are two ways to use voices with murmr:

1. **Voice Design** -- Describe a voice in natural language each time. Great for prototyping, but each call produces a slightly different voice.
2. **Saved Voices** -- Generate once, save the voice, and reuse it by ID. Guarantees consistent output across all requests.

## Save a Voice

Saving a voice requires reference audio (a WAV buffer from a Voice Design call) and its transcript. The API extracts voice embeddings from the audio server-side.

`POST /v1/voices`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Display name (max 50 characters). |
| `audio` | string | Yes | Base64-encoded WAV audio. The SDK accepts `Buffer` or `Uint8Array` and encodes automatically. |
| `description` | string | Yes | Description of the voice for your reference. |
| `ref_text` | string | Yes | Transcript of the reference audio. Improves embedding quality. |
| `language` | string | No | Language name (default: `English`). |

### SDK Example

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Generate reference audio
const inputText = 'This is the reference recording for my new voice.';
const wav = await client.voices.design({
  input: inputText,
  voice_description: 'A soothing female narrator, mid-30s, neutral American accent',
});

// Save the voice
const saved = await client.voices.save({
  name: 'Soothing Narrator',
  description: 'Female narrator, mid-30s, neutral American, for audiobooks',
  audio: wav,
  ref_text: inputText,
  language: 'English',
});

console.log(`ID: ${saved.id}`);
console.log(`Embedding size: ${saved.prompt_size_bytes} bytes`);
```

### Response

```json
{
  "id": "voice_a1b2c3d4e5f6",
  "name": "Soothing Narrator",
  "language": "English",
  "description": "Female narrator, mid-30s, neutral American, for audiobooks",
  "prompt_size_bytes": 142380,
  "created_at": "2026-03-01T12:00:00Z",
  "success": true,
  "has_audio_preview": true
}
```

## List Saved Voices

`GET /v1/voices`

Returns all saved voices for your account along with plan limits.

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const { voices, saved_count, saved_limit } = await client.voices.list();

console.log(`Using ${saved_count}/${saved_limit} voice slots`);

for (const voice of voices) {
  console.log(`${voice.id}: ${voice.name} (${voice.language})`);
}
```

### Response

```json
{
  "voices": [
    {
      "id": "voice_a1b2c3d4e5f6",
      "name": "Soothing Narrator",
      "description": "Female narrator, mid-30s, neutral American, for audiobooks",
      "language": "English",
      "language_name": "English",
      "audio_preview_url": "https://...",
      "created_at": "2026-03-01T12:00:00Z"
    }
  ],
  "saved_count": 1,
  "saved_limit": 10,
  "total": 1
}
```

## Delete a Voice

`DELETE /v1/voices/:id`

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.voices.delete('voice_a1b2c3d4e5f6');
console.log(result.message); // "Voice deleted successfully"
```

## Extract Embeddings

`POST /v1/voices/extract-embeddings`

Extract portable voice embeddings from audio without saving the voice. The returned `prompt_data` can be stored in your own database and passed as `voice_clone_prompt` in any TTS request -- no saved voice ID needed, and it doesn't count against your saved voice limit.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audio` | `Buffer` or `Uint8Array` | Yes | WAV audio bytes. The SDK base64-encodes automatically. |
| `ref_text` | string | Yes | Transcript of the reference audio. Required for accurate embedding extraction. |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `prompt_data` | string | Base64-encoded voice embedding data. Pass this as `voice_clone_prompt` in TTS requests. |
| `prompt_size_bytes` | number | Size of the embedding data in bytes (typically 50-200KB). |

### Example

```typescript
import { MurmrClient } from '@murmr/sdk';
import { readFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const audioBuffer = readFileSync('reference.wav');

const { prompt_data, prompt_size_bytes } = await client.voices.extractEmbeddings({
  audio: audioBuffer,
  ref_text: 'The transcript of the reference audio goes here.',
});

console.log(`Embedding size: ${prompt_size_bytes} bytes`);

// Store prompt_data in your database, then use it in requests:
const stream = await client.speech.stream({
  input: 'Generate speech with the extracted embedding.',
  voice: 'unused', // Required field, but voice_clone_prompt takes precedence
  voice_clone_prompt: prompt_data,
});
```

> **When to use embeddings vs saved voices:** Use saved voices when you want murmr to store and manage the voice. Use extracted embeddings when you need to store voice data in your own system, or when you want to avoid the saved voice limit on your plan.

## Voice Limits by Plan

| Plan | Saved Voice Limit |
|------|-------------------|
| Free | 3 |
| Starter | 10 |
| Pro | 25 |
| Realtime | 50 |
| Scale | 100 |

Attempting to save a voice beyond your limit returns a `429` error. Delete unused voices or upgrade your plan to increase the limit.

## Full Workflow Example

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// 1. Design and save a voice
const refText = 'Welcome to our platform. We are glad to have you here.';
const wav = await client.voices.design({
  input: refText,
  voice_description: 'A professional male voice, clear diction, mid-40s',
});

const saved = await client.voices.save({
  name: 'Professional Male',
  description: 'Clear male voice, mid-40s, for onboarding flows',
  audio: wav,
  ref_text: refText,
});

// 2. Generate with the saved voice
const result = await client.speech.create({
  input: 'Your account has been created. Let us walk you through the setup.',
  voice: saved.id,
  response_format: 'mp3',
});

if (isSyncResponse(result)) {
  writeFileSync('onboarding.mp3', Buffer.from(await result.arrayBuffer()));
}

// 3. List voices to verify
const { voices } = await client.voices.list();
console.log(`Total voices: ${voices.length}`);
```

## See Also

- [Voice Design](https://murmr.dev/en/docs/voicedesign) -- Natural language voice descriptions
- [Speech Generation](https://murmr.dev/en/docs/speech) -- Using saved voices in TTS requests
- [Authentication](https://murmr.dev/en/docs/authentication) -- Plan limits and API keys
- [Rate Limits](https://murmr.dev/en/docs/rate-limits) -- Voice save limits by plan
