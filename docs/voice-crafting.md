# Crafting Voice Descriptions

VoiceDesign creates voices from natural language descriptions. This guide shows you what works, using examples directly from the [Qwen3-TTS documentation](https://github.com/QwenLM/Qwen3-TTS).

## What You Can Control

According to the [Qwen3-TTS technical report](https://arxiv.org/abs/2601.15621), VoiceDesign supports "speech generation driven by natural language instructions for flexible control over timbre, emotion, and prosody."

### Demographics

- Age (elderly, young, 17 years old)
- Gender (male, female)

### Vocal Qualities

- Pitch (high-pitched, deep)
- Timbre (warm, bright, mystical)
- Vocal range (tenor, bass)

### Emotion and Mood

- Emotional states (excited, incredulous, joyful)
- Layered emotions (panic + incredulity)

### Delivery Style

- Speaking pace (slowly, quickly, measured)
- Energy level (enthusiastic, calm)
- Personality (confident, gentle, playful)

### Context and Purpose

- Use case hints (for bedtime stories)
- Character archetypes (wizard, CEO)

## Official Examples

These examples come directly from the [Qwen3-TTS GitHub repository](https://github.com/QwenLM/Qwen3-TTS). They demonstrate the style and level of detail that works well.

| Description | Use Case |
|-------------|----------|
| "A wise elderly wizard with a deep, mystical voice. Speaks slowly and deliberately with gravitas." | Fantasy narrator, audiobook |
| "Excited teenage girl, high-pitched voice with lots of energy and enthusiasm. Speaking quickly." | Energetic character, animation |
| "Professional male CEO voice, confident and authoritative, measured pace" | Business content, corporate |
| "Warm grandmother voice, gentle and soothing, perfect for bedtime stories" | Children's content, storytelling |
| "Speak in an incredulous tone, but with a hint of panic beginning to creep into your voice." | Emotional acting, drama |
| "Male, 17 years old, tenor range, gaining confidence - deeper breath support now, though vowels still tighten when nervous" | Age-specific character |

### Chinese Example

> "体现撒娇稚嫩的萝莉女声，音调偏高且起伏明显，营造出黏人、做作又刻意卖萌的听觉效果。"
>
> Translation: A coquettish, immature young female voice with high pitch and obvious fluctuations, creating a clingy, affected, and deliberately cute auditory effect.

## Patterns That Work

Analyzing the official examples reveals consistent patterns for effective descriptions.

### What Official Examples Include

- **Character archetypes** -- wizard, CEO, grandmother
- **Specific ages** -- elderly, teenage, 17 years old
- **Emotional layers** -- incredulous + panic
- **Pace descriptors** -- slowly, quickly, measured
- **Purpose hints** -- for bedtime stories
- **Vocal range** -- tenor, high-pitched

### What to Avoid

- Celebrity references ("like Morgan Freeman")
- Specific accent requests ("British accent")
- Technical audio specifications ("16kHz sample rate")
- Contradictory traits ("deep high-pitched voice")
- Overly long descriptions (keep under 500 chars)

The model does not support accent or nationality control via voice descriptions. Use the `language` parameter instead to control the output language.

## Building Effective Descriptions

The official examples suggest a pattern: combine character + age + emotion + delivery. Here's how to construct your own:

```
[Character/Role] + [Age/Demographics] + [Vocal Quality] + [Emotional State] + [Delivery Style]

Examples:
"Professional male CEO voice" + "confident and authoritative" + "measured pace"
"Wise elderly wizard" + "deep, mystical voice" + "speaks slowly" + "with gravitas"
"Excited teenage girl" + "high-pitched" + "lots of energy" + "speaking quickly"
```

You don't need all elements. The wizard example works because "wizard" already implies age and mystical qualities. Let the model infer what you don't specify.

## Using Descriptions with the SDK

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const wav = await client.voices.design({
  input: 'Once upon a time, in a land far away...',
  voice_description: 'A wise elderly wizard with a deep, mystical voice. Speaks slowly and deliberately with gravitas.',
  language: 'English',
});

writeFileSync('wizard.wav', wav);
```

## Supported Languages

VoiceDesign supports 10 languages for both the description and the output speech:

Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian

## Quick Reference

### Do

- Use character archetypes when appropriate
- Be specific about age when it matters
- Layer emotions for nuanced performances
- Include purpose hints for context
- Describe pace and energy level

### Avoid

- Celebrity impersonation requests
- Contradictory traits
- Technical audio specifications
- Descriptions over 500 characters

## Sources

- [arXiv Technical Report](https://arxiv.org/abs/2601.15621) -- Performance metrics, training details
- [GitHub Repository](https://github.com/QwenLM/Qwen3-TTS) -- Official examples, API documentation
- [HuggingFace Model Card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign) -- Supported languages, model specifications

## See Also

- [Voice Design API](./voicedesign.md) -- Complete API reference
- [Style Instructions](./style-instructions.md) -- Control delivery through voice descriptions
- [Languages](./languages.md) -- Supported languages and cross-lingual synthesis
