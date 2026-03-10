# Style Instructions

Control how voices deliver your content using natural language descriptions. With VoiceDesign, you describe the emotion, pace, and tone directly in the `voice_description` field.

## How Style Works

Style control happens through the `voice_description` parameter in VoiceDesign. Write what you want the voice to sound like -- including personality, emotion, pace, and delivery -- and the model will adjust accordingly.

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const wav = await client.voices.design({
  input: 'Welcome to the future of AI.',
  voice_description: 'An excited male narrator, dramatic delivery, building anticipation',
  language: 'English',
});
```

> **VoiceDesign vs Saved Voices:** Style instructions are part of VoiceDesign's `voice_description`. When you find a style you like, save the voice via the [Voices API](./voices.md) to reuse it with a stable `voice_xxx` ID in the `/v1/audio/speech` endpoint.

## Style Examples

Include these descriptors in your `voice_description` to shape delivery. Mix and match from different categories for more specific results.

### Professional

For business and formal content:

- calm and professional
- confident and authoritative
- clear and measured
- formal and precise

### Emotional

Express feelings and energy:

- excited and enthusiastic
- sympathetic and caring
- urgent and intense
- joyful and upbeat

### Pace

Control speaking speed:

- speak slowly and deliberately
- rapid and energetic delivery
- natural conversational pace
- thoughtful pauses between phrases

### Tone

Set the overall character:

- warm and friendly
- serious and formal
- playful and light
- mysterious and intriguing

## Combining Styles

For more nuanced delivery, combine multiple descriptors in a single voice description. The model understands complex, layered instructions:

| Description | Effect |
|-------------|--------|
| "A warm, friendly woman speaking at a relaxed pace, with occasional pauses for emphasis" | Combines character, tone (warm), pace (relaxed), and technique (pauses) |
| "Professional male narrator, approachable, clear enunciation, confident delivery" | Balances formality with accessibility |
| "A mysterious storyteller with a deep voice, slow build-up, dramatic pauses" | Creates narrative arc through character + delivery style |
| "Excited news anchor announcing breaking news, urgent but clear" | Uses role-play style instruction |

## Voice Descriptions by Use Case

These `voice_description` values combine character and style for common use cases. Try them in the [Playground](https://murmr.dev/en/dashboard/playground), then save the ones you like for reuse.

- **Product Demo:** "A clear, professional male voice, enthusiastic but measured, highlighting key features"
- **Meditation Guide:** "A warm, soothing female voice, calm and gentle, very slow pace, whisper-like quality"
- **Movie Trailer:** "A deep, powerful male voice with gravitas, epic and dramatic, building intensity"
- **Kids Educational:** "A bright, energetic young woman, playful and animated, speaking clearly, fun and engaging"
- **Podcast Intro:** "A friendly, conversational male voice, natural delivery, welcoming host energy"

## Tips for Effective Descriptions

**Be descriptive, not prescriptive.** Describe the feeling you want ("warm and inviting") rather than technical instructions ("lower pitch by 10%").

**Include both character and delivery.** The best descriptions combine who the speaker is ("elderly wizard") with how they speak ("slowly and deliberately"). See the [Voice Crafting Guide](./voice-crafting.md) for more patterns.

**Keep it under 500 characters.** 2-3 descriptors usually work better than long, complex instructions. Focus on the most important characteristics.

**Test in the Playground.** Experiment with different descriptions in the [Voice Playground](https://murmr.dev/en/dashboard/playground) before committing to your application code.

## Save and Reuse Voices

Once you find a voice description that captures the right style, save it as a reusable voice. This gives you a consistent `voice_xxx` ID for production use:

```typescript
// 1. Design with style descriptors
const wav = await client.voices.design({
  input: 'This is my reference audio.',
  voice_description: 'A calm, professional narrator, measured pace, clear enunciation',
  language: 'English',
});

// 2. Save the voice
const saved = await client.voices.save({
  name: 'Professional Narrator',
  description: 'Calm male narrator, measured pace',
  audio: wav,
  ref_text: 'This is my reference audio.',
});

// 3. Use in production
const stream = await client.speech.stream({
  input: 'Your content here.',
  voice: saved.id,
});
```

Saved voices capture the style from your description -- every generation with that voice ID will have the same character and delivery.

## See Also

- [Voice Crafting Guide](./voice-crafting.md) -- Detailed patterns for effective voice descriptions
- [Text Formatting](./text-formatting.md) -- How newlines and formatting affect prosody
- [Voice Design API](./voicedesign.md) -- Full API reference for voice creation
