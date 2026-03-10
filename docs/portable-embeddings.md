# Portable Voice Embeddings

Extract voice identity as a compact embedding. Store in your own database. Use via `voice_clone_prompt` in any TTS request.

## What are Portable Embeddings?

Voice embeddings are compact representations (~50-200KB) of a voice's identity. Extract them once, store them anywhere, and pass them inline with TTS requests. No dependency on murmr's saved voices storage.

This is the recommended pattern for production apps that manage multiple users or need full control over voice data.

### When to use this pattern

- **Multi-tenant apps** -- each user has their own voices, managed in your database
- **Edge deployments** -- cache embeddings locally for low-latency voice selection
- **Cross-platform** -- same voice across web, mobile, and IoT devices
- **Data sovereignty** -- embeddings stay in your infrastructure, not ours

## 3-Step Workflow

### 1. Extract embeddings

Send reference audio to the extract endpoint. You get back a base64-encoded embedding that captures the voice's identity.

```typescript
import { MurmrClient } from '@murmr/sdk';
import { readFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const { prompt_data, prompt_size_bytes } = await client.voices.extractEmbeddings({
  audio: readFileSync('reference.wav'),
  ref_text: 'The transcript of the audio.',
});
// Store prompt_data in your database
```

### 2. Store in your database

The embedding is a base64 string. Store it in any database alongside your user data.

```sql
CREATE TABLE voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  prompt_data TEXT NOT NULL,  -- base64-encoded embedding
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. Use in TTS requests

Pass the embedding inline via `voice_clone_prompt`. No voice ID needed -- the voice identity travels with the request.

```typescript
// Retrieve prompt_data from your database
const voice = await db.query('SELECT prompt_data FROM voices WHERE id = $1', [voiceId]);

const stream = await client.speech.stream({
  input: 'Hello from a portable voice!',
  voice: 'inline',
  voice_clone_prompt: voice.prompt_data,
  language: 'English',
});
```

## Extract Embeddings API

`POST /v1/voices/extract-embeddings`

Extract voice identity from reference audio. Returns a base64-encoded embedding suitable for storage and reuse.

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audio` | `string` | Yes | Base64-encoded WAV audio to extract the voice embedding from. |
| `ref_text` | `string` | Yes | Transcript of the reference audio. Required for accurate embedding extraction. |

> The SDK accepts `Buffer` or `Uint8Array` for the `audio` parameter and base64-encodes it automatically.

### Response

```json
{
  "prompt_data": "base64-encoded-embedding-string...",
  "prompt_size_bytes": 51200,
  "success": true
}
```

### cURL Example

```bash
curl -X POST "https://api.murmr.dev/v1/voices/extract-embeddings" \
  -H "Authorization: Bearer $MURMR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "audio": "<base64-encoded-wav>",
    "ref_text": "The transcript of the audio."
  }'
```

## Saved Voices vs Portable Embeddings

Both approaches use the same underlying voice technology. The difference is where the embedding lives and how you reference it.

| | Saved Voices | Portable Embeddings |
|---|---|---|
| Storage | murmr manages | You manage |
| Access | `voice` ID (e.g. `voice_abc123`) | `voice_clone_prompt` (inline data) |
| Multi-tenant | One user per API key | Unlimited users per API key |
| Portability | Locked to murmr account | Store anywhere, use anywhere |
| Best for | Single-user apps, prototyping | Multi-tenant apps, production |

## See Also

- [Voice Management](./voices.md) -- Save, list, and delete voices on murmr
- [Speech Generation](./speech.md) -- Generate audio with saved voice IDs
- [Voice Design](./voicedesign.md) -- Create voices from natural language descriptions
