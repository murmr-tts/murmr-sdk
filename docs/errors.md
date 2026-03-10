# Errors

murmr uses standard HTTP status codes and structured error responses. This guide covers every error code, common causes, retry strategies, and WebSocket close codes.

## Error Response Format

### Standard Errors

Most errors return a JSON body with a simple `error` string:

```json
{
  "error": "Text exceeds maximum length of 4096 characters"
}
```

### Rate Limit Errors (429)

Rate limit errors use an OpenAI-compatible structured format with additional metadata in headers:

```json
{
  "error": {
    "type": "rate_limit_exceeded",
    "code": "concurrent_limit",
    "message": "Too many concurrent requests. Your plan allows 5 concurrent requests."
  }
}
```

Headers on 429 responses:

| Header | Description |
|--------|-------------|
| `X-Concurrent-Limit` | Maximum concurrent requests allowed |
| `X-Concurrent-Active` | Current number of in-flight requests |

## HTTP Status Codes

### 400 Bad Request

The request is malformed or contains invalid parameters.

**Common causes:**
- Missing `text` or `input` field
- Text exceeds 4,096 characters
- Missing `voice` and `voice_description`
- Invalid `response_format` value
- `voice_description` exceeds 500 characters

**Solution:** Validate input before sending. The SDK throws `MurmrError` with a descriptive message.

```typescript
import { MurmrClient, MurmrError } from '@murmr/sdk';

const client = new MurmrClient({ apiKey: process.env.MURMR_API_KEY! });

try {
  await client.speech.stream({ input: '', voice: 'voice_abc123' });
} catch (error) {
  if (error instanceof MurmrError && error.status === 400) {
    console.error('Bad request:', error.message);
  }
}
```

### 401 Unauthorized

Authentication failed.

**Common causes:**
- Missing `Authorization` header
- Invalid API key format
- Expired or revoked API key
- Using a test key in production (or vice versa)

**Solution:** Verify your API key is correct and active. The SDK sets the header automatically.

### 404 Not Found

The requested resource does not exist.

**Common causes:**
- Voice ID does not exist (`voice_xxx`)
- Voice belongs to a different user account
- Job ID not found or expired
- Invalid endpoint path

**Solution:** Verify the resource ID. Use `client.voices.list()` to check available voices.

### 405 Method Not Allowed

Wrong HTTP method for the endpoint.

**Solution:** Check the [API reference](https://murmr.dev/en/docs/speech) for the correct method (POST, GET, DELETE).

### 410 Gone

The resource existed but has been removed.

**Common causes:**
- Job result expired (jobs are retained for 1 hour after completion)

**Solution:** Re-submit the request. For batch jobs, retrieve results promptly or use webhooks.

### 429 Rate Limited

You have exceeded a rate limit. There are several sub-types:

| Code | Description | Solution |
|------|-------------|----------|
| `monthly_limit` | Monthly character quota exceeded | Upgrade plan or wait for reset |
| `concurrent_limit` | Too many in-flight requests | Wait for active requests to complete |
| `voice_save_limit` | Saved voice limit reached | Delete unused voices or upgrade |

```typescript
import { MurmrClient, MurmrError } from '@murmr/sdk';

const client = new MurmrClient({ apiKey: process.env.MURMR_API_KEY! });

try {
  await client.speech.stream({ input: 'Hello', voice: 'voice_abc123' });
} catch (error) {
  if (error instanceof MurmrError && error.status === 429) {
    console.error(`Rate limited: ${error.code}`);
    if (error.concurrentLimit) {
      console.error(`Active: ${error.concurrentActive}/${error.concurrentLimit}`);
    }
  }
}
```

### 500 Internal Server Error

An unexpected error occurred on the server.

**Solution:** Retry with exponential backoff. If persistent, contact support.

### 502 Bad Gateway

The API gateway could not reach the backend.

**Solution:** Retry after a short delay. Usually transient.

### 503 Service Unavailable

The backend is temporarily unavailable (scaling up, maintenance).

**Solution:** Retry with backoff. Check [status.murmr.dev](https://status.murmr.dev) for outages.

### 504 Gateway Timeout

The backend did not respond in time.

**Common causes:**
- Very long text (close to 4,096 characters)
- Backend under heavy load

**Solution:** Retry. For long text, use streaming or long-form generation.

## SDK Error Classes

### MurmrError

Base error class for all API errors.

```typescript
class MurmrError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly type?: string;
  readonly concurrentLimit?: number;
  readonly concurrentActive?: number;
}
```

### MurmrChunkError

Thrown when a chunk fails during long-form generation. Extends `MurmrError`.

```typescript
class MurmrChunkError extends MurmrError {
  readonly chunkIndex: number;
  readonly completedChunks: number;
  readonly totalChunks: number;
}
```

## Retry Logic

Implement exponential backoff for transient errors (429, 500, 502, 503, 504).

```typescript
import { MurmrClient, MurmrError } from '@murmr/sdk';

const client = new MurmrClient({ apiKey: process.env.MURMR_API_KEY! });

async function generateWithRetry(
  input: string,
  voice: string,
  maxRetries: number = 3,
): Promise<Buffer> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const stream = await client.speech.stream({ input, voice });
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        const audio = chunk.audio || chunk.chunk;
        if (audio) chunks.push(Buffer.from(audio, 'base64'));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof MurmrError) {
        const retryable = [429, 500, 502, 503, 504].includes(error.status ?? 0);
        if (!retryable || attempt === maxRetries) throw error;

        const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
        console.log(`Retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Unreachable');
}
```

## WebSocket Close Codes

| Code | Meaning | Retryable |
|------|---------|-----------|
| 4001 | Authentication failed | No |
| 4002 | Plan does not include realtime | No |
| 4003 | Too many concurrent connections | Yes (after delay) |
| 4004 | Invalid message format | No (fix message) |
| 4005 | Server error | Yes (with backoff) |

## Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| All requests return 401 | API key issue | Verify key in environment variable |
| Intermittent 502/503 | Backend scaling | Retry with backoff |
| 429 with `concurrent_limit` | Too many parallel calls | Reduce concurrency or queue requests |
| 429 with `monthly_limit` | Usage exhausted | Upgrade plan or wait for monthly reset |
| Stream cuts off mid-audio | Network interruption | Check connection, retry |
| Empty audio returned | Empty input text | Validate input is non-empty |

## See Also

- [Authentication](https://murmr.dev/en/docs/authentication) -- API key setup and plans
- [Rate Limits](https://murmr.dev/en/docs/rate-limits) -- Detailed limit tables
- [Long-Form Audio](https://murmr.dev/en/docs/long-form) -- Resume after MurmrChunkError
- [Realtime WebSocket](https://murmr.dev/en/docs/realtime) -- WebSocket-specific errors
