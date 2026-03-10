# Async Jobs

The batch endpoint (`/v1/audio/speech`) supports asynchronous job processing. By default, it returns audio synchronously (HTTP 200). With a `webhook_url`, it returns a job ID (HTTP 202) that you can poll or receive results via webhook.

## How It Works

1. **Submit** -- Send a POST to `/v1/audio/speech` with `webhook_url`. Receive a 202 response with a job ID.
2. **Queue** -- The job is queued for processing on the batch infrastructure.
3. **Poll or Webhook** -- Either poll `GET /v1/jobs/{jobId}` for status, or wait for the webhook delivery.
4. **Retrieve** -- Completed jobs include base64-encoded audio. Jobs expire after 1 hour.

## Submit a Job

### SDK: Async Submit

```typescript
import { MurmrClient, isAsyncResponse } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.create({
  input: 'Generate this audio asynchronously.',
  voice: 'voice_abc123',
  response_format: 'mp3',
  webhook_url: 'https://yourapp.com/webhooks/tts',
});

if (isAsyncResponse(result)) {
  console.log(`Job ID: ${result.id}`);
  console.log(`Status: ${result.status}`); // "queued"
  console.log(`Created: ${result.created_at}`);
}
```

### Submit Response (202)

```json
{
  "id": "job_a1b2c3d4e5f67890",
  "status": "queued",
  "created_at": "2026-03-01T12:00:00Z"
}
```

Job IDs follow the format `job_` followed by 16 hexadecimal characters.

## Poll for Status

`GET /v1/jobs/{jobId}`

### Job Statuses

| Status | HTTP | Response |
|--------|------|----------|
| `queued` | 200 | JSON with status |
| `processing` | 200 | JSON with status |
| `completed` | 200 | JSON with `audio_base64`, `content_type`, `response_format` |
| `failed` | 200 | JSON with `error` message |
| (expired) | 410 | Job result no longer available |

### SDK: Manual Polling

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const jobId = 'job_a1b2c3d4e5f67890';

const status = await client.jobs.get(jobId);

if (status.status === 'completed' && status.audio_base64) {
  const audio = Buffer.from(status.audio_base64, 'base64');
  writeFileSync(`output.${status.response_format || 'wav'}`, audio);
  console.log(`Duration: ${status.duration_ms}ms`);
}

if (status.status === 'failed') {
  console.error(`Job failed: ${status.error}`);
}
```

### SDK: Wait for Completion

The `waitForCompletion()` method polls automatically at a fixed interval (default 3 seconds):

```typescript
import { MurmrClient, MurmrError } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

try {
  const result = await client.jobs.waitForCompletion('job_a1b2c3d4e5f67890', {
    pollIntervalMs: 3000,  // Check every 3 seconds (minimum: 1000)
    timeoutMs: 900_000,    // Give up after 15 minutes
    onPoll: (status) => {
      console.log(`Status: ${status.status}`);
    },
  });

  if (result.audio_base64) {
    writeFileSync('output.wav', Buffer.from(result.audio_base64, 'base64'));
  }
} catch (error) {
  if (error instanceof MurmrError && error.code === 'JOB_FAILED') {
    console.error('Job failed:', error.message);
  }
  if (error instanceof MurmrError && error.code === 'TIMEOUT') {
    console.error('Polling timed out');
  }
}
```

### SDK: Submit and Wait (Convenience)

`createAndWait()` combines submission and polling into a single call:

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.createAndWait({
  input: 'Submit and wait for the result in one call.',
  voice: 'voice_abc123',
  response_format: 'mp3',
  onPoll: (s) => console.log(s.status),
});

// createAndWait returns Response (sync) or JobStatus (async)
if (isSyncResponse(result)) {
  writeFileSync('output.mp3', Buffer.from(await result.arrayBuffer()));
} else if (result.audio_base64) {
  writeFileSync('output.mp3', Buffer.from(result.audio_base64, 'base64'));
}
```

### cURL: Polling

```bash
# Submit
JOB_ID=$(curl -s -X POST https://api.murmr.dev/v1/audio/speech \
  -H "Authorization: Bearer $MURMR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Async job via cURL.",
    "voice": "voice_abc123",
    "webhook_url": "https://yourapp.com/hooks/tts"
  }' | jq -r '.id')

echo "Job: $JOB_ID"

# Poll
curl -s https://api.murmr.dev/v1/jobs/$JOB_ID \
  -H "Authorization: Bearer $MURMR_API_KEY" | jq '.status'
```

## Webhook Delivery

When a job completes (or fails), murmr sends a POST request to your `webhook_url`.

### Requirements

- URL must use **HTTPS** (HTTP is rejected)
- URL must be publicly accessible (no private IPs or localhost)
- Your endpoint must return a 2xx status within 10 seconds

### Success Payload

```json
{
  "id": "job_a1b2c3d4e5f67890",
  "status": "completed",
  "audio": "<base64-encoded audio>",
  "content_type": "audio/mpeg",
  "response_format": "mp3",
  "duration_ms": 4250,
  "total_time_ms": 6100
}
```

### Failure Payload

```json
{
  "id": "job_a1b2c3d4e5f67890",
  "status": "failed",
  "error": "Text exceeds maximum length"
}
```

### Webhook Handler Example

```typescript
import express from 'express';
import { writeFileSync } from 'node:fs';
import type { WebhookPayload } from '@murmr/sdk';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/webhooks/tts', (req, res) => {
  const payload = req.body as WebhookPayload;

  if (payload.status === 'completed' && payload.audio) {
    const audio = Buffer.from(payload.audio, 'base64');
    const ext = payload.response_format || 'wav';
    writeFileSync(`jobs/${payload.id}.${ext}`, audio);
    console.log(`Job ${payload.id} completed (${payload.duration_ms}ms)`);
  }

  if (payload.status === 'failed') {
    console.error(`Job ${payload.id} failed: ${payload.error}`);
  }

  res.sendStatus(200);
});

app.listen(3000);
```

## Job Lifecycle

```
submit (POST /v1/audio/speech) → 202 {id, status: "queued"}
    ↓
processing → status: "processing"
    ↓
completed → status: "completed", audio_base64 available
    ↓ (1 hour)
expired → 410 Gone
```

> Jobs are retained for 1 hour after completion. After that, polling returns `410 Gone`. Use webhooks or poll promptly to avoid missing results.

## See Also

- [Speech Generation](https://murmr.dev/en/docs/speech) -- Batch endpoint parameters
- [Audio Formats](https://murmr.dev/en/docs/audio-formats) -- Format options for batch jobs
- [Errors](https://murmr.dev/en/docs/errors) -- Error handling for failed jobs
- [Rate Limits](https://murmr.dev/en/docs/rate-limits) -- Concurrent request limits
