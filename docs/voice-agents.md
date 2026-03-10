# Voice Agents

Build conversational voice agents by streaming LLM tokens directly into murmr's WebSocket API. Text goes in, audio comes out -- sub-600ms end-to-end.

## Architecture

A voice agent pipes LLM output tokens into murmr as they arrive. murmr buffers text to natural boundaries, generates speech, and streams audio back to the client for playback.

```
User speaks
    |
    v
+---------+     +----------+     +---------------+     +----------+
|  STT /  |---->|   LLM    |---->|  murmr WS     |---->|  Audio   |
|  Input  |     | (stream) |     |  /v1/realtime  |     | Playback |
+---------+     +----------+     +---------------+     +----------+
                  tokens            audio chunks
                  as they           as they're
                  arrive            generated
```

> **Plan requirement:** WebSocket access requires the **Realtime** ($49/mo) or **Scale** ($99/mo) plan.

## Integration Example

This example connects an OpenAI chat completion stream to murmr's WebSocket. As the LLM generates tokens, they're forwarded to murmr for speech synthesis.

```typescript
import OpenAI from "openai";
import WebSocket from "ws";

const openai = new OpenAI();

// 1. Connect to murmr WebSocket
const ws = new WebSocket("wss://api.murmr.dev/v1/realtime");

ws.on("open", () => {
  // 2. Send config (auth + voice setup)
  ws.send(JSON.stringify({
    type: "config",
    api_key: process.env.MURMR_API_KEY,
    voice_description: "A calm, professional female voice",
    language: "English",
  }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === "config_ack") {
    // 3. Start LLM stream after config acknowledged
    streamLLMResponse(ws);
  }

  if (msg.type === "audio") {
    // 5. Play audio chunk (base64 PCM, 24kHz mono 16-bit)
    const pcm = Buffer.from(msg.chunk, "base64");
    playAudio(pcm);
  }

  if (msg.type === "done") {
    console.log(`Audio complete: ${msg.duration_ms}ms`);
  }
});

async function streamLLMResponse(ws: WebSocket) {
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Explain quantum computing briefly" }],
    stream: true,
  });

  // 4. Forward each token to murmr
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) {
      ws.send(JSON.stringify({ type: "text", text: token }));
    }
  }

  // Signal end of text
  ws.send(JSON.stringify({ type: "flush" }));
}
```

## Text Buffering

murmr doesn't generate audio for every token. It buffers incoming text and triggers generation at natural speech boundaries for optimal quality.

| Rule | Condition | Behavior |
|------|-----------|----------|
| Force flush | Buffer >= 200 chars | Generates immediately at best available boundary |
| Sentence flush | Buffer >= 50 chars + sentence end (.!?) | Generates at sentence boundary |
| Clause flush | Buffer >= 50 chars + clause end (,;:) | Generates at clause boundary |
| Explicit flush | Client sends `{"type":"flush"}` | Generates all buffered text immediately |

This means you can send tokens one at a time -- murmr accumulates them and generates speech when it has a meaningful phrase. You don't need to batch tokens yourself.

> **When to flush:** Send `{"type":"flush"}` when the LLM finishes its response. This ensures the final words are spoken even if they don't end with punctuation. Without a flush, trailing text like "Thank you" (no period, under 50 chars) stays buffered.

## Binary Mode

By default, audio chunks are base64-encoded inside JSON messages. Binary mode sends raw PCM frames as WebSocket binary messages instead, saving ~50ms per chunk from encoding overhead.

```typescript
// Opt into binary mode after config_ack
ws.send(JSON.stringify({ type: "binary_mode" }));

// Server responds with:
// { type: "binary_mode_ack", sample_rate: 24000, format: "pcm_s16le" }

// Audio now arrives as raw binary frames instead of JSON
ws.on("message", (data, isBinary) => {
  if (isBinary) {
    // Raw PCM: 24kHz, mono, 16-bit signed little-endian
    playAudio(data as Buffer);
  } else {
    // JSON messages (done, error, pong) still arrive as text
    const msg = JSON.parse(data.toString());
    // ...
  }
});
```

> Use binary mode when latency matters most -- voice agents, interactive demos, real-time conversations. JSON mode is fine for applications where you need metadata with each chunk.

## Parallel Auth Flow

murmr uses a parallel authentication flow to minimize startup latency. When you send the `config` message, the server:

1. Immediately sends `config_ack` -- you can start sending text right away
2. Validates your API key in the background (~200ms)
3. If text arrives before auth completes, it's queued and processed as soon as auth succeeds
4. If auth fails, the connection closes with code `4002`

This saves ~200ms compared to waiting for auth before sending text. Your LLM can start generating immediately after `config_ack`.

## Handling Interruptions

In a conversational agent, the user may interrupt while audio is still playing. Handle this client-side:

```typescript
// When user starts speaking (interrupt detected):

// 1. Stop audio playback
audioPlayer.stop();

// 2. Close the current WebSocket connection
ws.close();

// 3. Open a new connection for the next response
const newWs = new WebSocket("wss://api.murmr.dev/v1/realtime");
// ... configure and start new LLM stream
```

Each WebSocket connection handles one conversation turn. When interrupted, close and reconnect. The server cancels any in-progress generation on disconnect.

## Latency Expectations

| Metric | Typical Value | Notes |
|--------|---------------|-------|
| Server TTFC | ~550ms | Time from text received to first audio chunk generated |
| Client TTFC | ~600-700ms | Includes network round-trip |
| Binary mode savings | ~50ms | Skips base64 encoding overhead |
| Auth overhead | ~0ms | Parallel auth -- no blocking wait |
| Subsequent chunks | ~80ms apart | Continuous generation after first chunk |

Total voice agent latency = LLM TTFT + murmr TTFC + network. With a fast LLM (~300ms TTFT) and murmr (~600ms TTFC), expect ~900ms from user input to first audio -- well under the 1-second threshold for natural conversation.

## Best Practices

**Use saved voices for consistency.** Pass `voice` (saved voice ID) or `voice_clone_prompt` in the config message instead of `voice_description`. Saved voices produce consistent audio across turns. VoiceDesign may vary slightly each time.

**Send tokens immediately.** Don't wait for complete sentences from the LLM. Send each token as it arrives. murmr's text buffer handles accumulation and boundary detection.

**Always send a final flush.** After the LLM stream ends, send `{"type":"flush"}` to ensure any remaining buffered text is generated. Without this, the last partial sentence may be silent.

**Monitor the done message.** The `done` message includes `first_chunk_latency_ms` and `duration_ms`. Log these to monitor performance in production.

## See Also

- [WebSocket Protocol](./websocket-protocol.md) -- Complete message type reference
- [Browser Client](./browser-client.md) -- Browser-side WebSocket with Web Audio API
- [Voice Management](./voices.md) -- Save and manage consistent voices
- [Rate Limits](./rate-limits.md) -- WebSocket connection and generation limits
