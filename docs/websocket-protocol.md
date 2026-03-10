# WebSocket Protocol

Full protocol reference for the real-time WebSocket endpoint. Covers authentication, message types, binary mode, text buffering, and close codes.

## Connection

```
wss://api.murmr.dev/v1/realtime
```

After connecting, send a `config` message with your API key within **10 seconds**. The server responds with `config_ack` immediately -- you can start sending text right away while auth completes in the background.

> **Parallel Authentication:** The server sends `config_ack` before auth completes, saving ~200ms. Text sent during auth is queued and processed once the API key is validated. If auth fails, queued text is discarded and the connection closes with code `4002`.

> **Plan Requirement:** WebSocket is available on **Realtime** and **Scale** plans only. Other plans receive close code `4002` with a message indicating the required plan.

## Client to Server Messages

### config

First message after connecting. Authenticates and configures the voice.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `"config"` | Yes | -- | Message type. |
| `api_key` | `string` | Yes | -- | Your murmr API key (`murmr_sk_live_...` or `murmr_sk_test_...`). |
| `voice_description` | `string` | No | -- | VoiceDesign description (e.g., "A warm, friendly voice"). Use this OR `voice`/`voice_clone_prompt`. |
| `voice` | `string` | No | -- | Saved voice ID (e.g., `voice_abc123`). Requires `voice_clone_prompt`. |
| `voice_clone_prompt` | `string` | No | -- | Base64-encoded voice prompt data from saved voice. Alternative to `voice_description`. |
| `language` | `string` | No | `Auto` | Full language name: English, Spanish, Portuguese, German, French, Italian, Chinese, Japanese, Korean, Russian, or "Auto". |

```json
// VoiceDesign mode
{
  "type": "config",
  "api_key": "murmr_sk_live_xxx",
  "voice_description": "A warm, professional narrator, calm and measured",
  "language": "English"
}

// Saved voice mode
{
  "type": "config",
  "api_key": "murmr_sk_live_xxx",
  "voice_clone_prompt": "BASE64_PROMPT_DATA...",
  "language": "English"
}
```

### text

Send text to synthesize. Text is buffered server-side and generated at natural boundaries.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"text"` | Yes | Message type. |
| `text` | `string` | Yes | Text to synthesize. Can be a single token or full sentence. |

```json
{"type": "text", "text": "Hello, "}
```

### flush

Force immediate generation of all buffered text. Send this after the last text message to generate any remaining content.

```json
{"type": "flush"}
```

### binary_mode

Opt into raw PCM binary frames instead of base64 JSON. Saves ~50-100ms per chunk. Send after receiving `config_ack`.

```json
{"type": "binary_mode"}
```

### ping

Application-level keepalive. Server responds with `pong`.

```json
{"type": "ping"}
```

## Server to Client Messages

### config_ack

Sent immediately after receiving `config`. Signals that the connection is accepted and text can be sent. Auth continues in the background.

```json
{
  "type": "config_ack",
  "session_id": "a1b2c3d4"
}
```

### binary_mode_ack

Confirms binary mode is enabled. Subsequent audio arrives as raw binary WebSocket frames.

```json
{
  "type": "binary_mode_ack",
  "sample_rate": 24000,
  "format": "pcm_s16le"
}
```

### audio (JSON mode)

Audio chunk with base64-encoded PCM. In binary mode, audio arrives as raw binary frames instead (no JSON wrapper).

```json
{
  "type": "audio",
  "chunk": "SGVsbG8gV29ybGQh...",
  "sample_rate": 24000,
  "format": "pcm_s16le"
}
```

### binary frame (binary mode)

Raw PCM bytes as a binary WebSocket frame. No JSON parsing needed -- the entire frame payload is audio data (24kHz, 16-bit, mono, little-endian).

### done

Sent when all audio for the current generation has been delivered. Always sent as a JSON text frame, even in binary mode.

```json
{
  "type": "done",
  "total_chunks": 5,
  "duration_ms": 2500,
  "first_chunk_latency_ms": 460
}
```

### error

Sent when an error occurs. Non-fatal errors (rate limit on a single generation) keep the connection open. Fatal errors close the connection.

```json
{
  "type": "error",
  "message": "All slots occupied, try again shortly",
  "code": 4006
}
```

### pong

Response to a `ping` message.

```json
{"type": "pong"}
```

## Text Buffering

Text is accumulated server-side and flushed at natural boundaries for better prosody. This is critical for LLM integration where tokens arrive one at a time.

| Rule | Condition | Behavior |
|------|-----------|----------|
| Sentence boundary | Buffer >= 50 chars + sentence end (.!? + space) | Flush up to boundary |
| Clause boundary | Buffer >= 50 chars + clause end (,;: + space) | Flush up to boundary |
| Force flush | Buffer >= 200 chars | Flush entire buffer (or at best boundary) |
| Explicit flush | Client sends `{"type":"flush"}` | Flush immediately, any size |
| Buffer limit | Buffer would exceed 4096 chars | Error -- buffer overflow |

> **Multiple generations per session:** A single WebSocket connection supports multiple text-to-audio cycles. Send text, receive audio + done, then send more text. The voice configuration persists for the entire session.

## Binary Mode

Binary mode eliminates base64 encoding overhead for lower latency. Audio arrives as raw binary WebSocket frames; control messages (done, error, pong) remain as JSON text frames.

```
// 1. Connect and configure
-> {"type": "config", "api_key": "...", "voice_description": "..."}
<- {"type": "config_ack", "session_id": "a1b2c3d4"}

// 2. Enable binary mode
-> {"type": "binary_mode"}
<- {"type": "binary_mode_ack", "sample_rate": 24000, "format": "pcm_s16le"}

// 3. Send text
-> {"type": "text", "text": "Hello, world!"}
-> {"type": "flush"}

// 4. Receive audio
<- [binary frame: raw PCM bytes]
<- [binary frame: raw PCM bytes]
<- {"type": "done", "total_chunks": 2, "duration_ms": 1200, "first_chunk_latency_ms": 460}
```

> **Detecting frame type:** In binary mode, check the WebSocket frame type to distinguish audio from control messages. Binary frames contain PCM audio. Text frames contain JSON (done, error, pong).

## Close Codes

| Code | Name | Description |
|------|------|-------------|
| 1001 | GOING_AWAY | Server shutting down gracefully |
| 4001 | AUTH_TIMEOUT | No config message received within 10 seconds |
| 4002 | AUTH_FAILED | Invalid API key or plan does not include WebSocket |
| 4003 | INVALID_MESSAGE | Malformed JSON or unexpected message type |
| 4004 | RATE_LIMITED | Too many concurrent connections or generations |
| 4005 | SERVER_ERROR | Internal server error |

## Rate Limits

| Limit | Default | Description |
|-------|---------|-------------|
| Concurrent connections | 10 per API key | Maximum open WebSocket connections |
| Generations per minute | 100 per API key | Sliding window, resets continuously |
| Global connections | 500 total | Server-wide connection cap |

Character usage on WebSocket counts against your plan's monthly character quota, same as HTTP endpoints.

## Testing with wscat

```bash
# Install
npm install -g wscat

# Connect
wscat -c wss://api.murmr.dev/v1/realtime

# Authenticate (paste and press Enter)
{"type":"config","api_key":"murmr_sk_live_xxx","voice_description":"A warm narrator","language":"English"}

# Wait for config_ack, then send text
{"type":"text","text":"Hello, world! This is a test of the WebSocket protocol."}
{"type":"flush"}

# You'll receive audio chunks (base64 JSON), then a done event
```

## Node.js Example

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://api.murmr.dev/v1/realtime');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'config',
    api_key: process.env.MURMR_API_KEY,
    voice_description: 'A warm, professional narrator',
    language: 'English',
  }));
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    // Binary mode: raw PCM audio
    const pcm = data as Buffer;
    // Process audio...
    return;
  }

  const msg = JSON.parse(data.toString());

  if (msg.type === 'config_ack') {
    // Optionally enable binary mode
    ws.send(JSON.stringify({ type: 'binary_mode' }));
  }

  if (msg.type === 'binary_mode_ack') {
    ws.send(JSON.stringify({ type: 'text', text: 'Hello from Node.js!' }));
    ws.send(JSON.stringify({ type: 'flush' }));
  }

  if (msg.type === 'audio') {
    const pcm = Buffer.from(msg.chunk, 'base64');
    // Process audio...
  }

  if (msg.type === 'done') {
    console.log(`TTFC: ${msg.first_chunk_latency_ms}ms`);
    ws.close();
  }

  if (msg.type === 'error') {
    console.error(`Error: ${msg.message}`);
  }
});
```

## See Also

- [Browser Client](./browser-client.md) -- Web Audio playback, React hook, LLM integration
- [Streaming](./streaming.md) -- Simpler alternative for one-shot generation
- [Errors](./errors.md) -- HTTP error codes and handling
