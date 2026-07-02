import { GoogleGenerativeAI } from '@google/generative-ai'
import { VideoAnalysis } from './types'

const SYSTEM_PROMPT = `You are a viral video content analyst with deep expertise in short-form video performance. You analyze transcripts to identify exactly why videos succeed or fail — with the precision and depth of professional content intelligence tools like Sandcastles.

You understand:
- Hook patterns that retain vs lose viewers in the first 3 seconds
- Format archetypes and why certain structures outperform others
- Narrative pacing and emotional arc that drives watch-through
- What makes content shareable, saveable, and comment-worthy
- Retention psychology and where drop-off occurs`

const USER_PROMPT = (transcript: string) => `Analyze this video transcript deeply. Return ONLY valid JSON — no markdown, no explanation, just the JSON object.

The JSON must match this exact schema:
{
  "hook": {
    "category": "string (e.g. curiosity gap, contrarian reframe, personal story, listicle, how-to, social proof, fear/urgency, humor)",
    "template": "string (the storytelling template used, e.g. 'Most people think X but actually Y', 'I tried X for Y days and here's what happened')",
    "strength": "strong | medium | weak",
    "assessment": "string (specific reasoning about why this hook works or fails)"
  },
  "format": "string (e.g. talking head, tutorial, storytime, reaction, voiceover B-roll, interview, day-in-life)",
  "narrative_structure": {
    "opening": "string (what happens in the first ~20% of the video)",
    "middle": "string (how the content develops and delivers value)",
    "closing": "string (how the video ends and what CTA or payoff is delivered)",
    "pacing": "string (assessment of pacing — too fast, well-calibrated, too slow, builds tension well, etc.)"
  },
  "main_topic": "string",
  "subtopics": ["array of strings"],
  "virality_factors": ["array: specific reasons this content could go viral — shareability, relatability, novelty, controversy, emotional resonance, etc."],
  "retention_risk": {
    "risk_level": "high | medium | low",
    "drop_off_points": ["array: specific moments or patterns likely to cause viewer drop-off"],
    "reasoning": "string (explanation of retention risk)"
  },
  "suggested_improvements": ["array: specific, actionable improvements to increase performance"],
  "overall_assessment": "string (2-3 sentence overall verdict on the video's potential and what would make it significantly better)"
}

Transcript:
${transcript}`

export async function analyzeTranscript(transcript: string, apiKey: string): Promise<VideoAnalysis> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  })

  const result = await model.generateContent(USER_PROMPT(transcript))
  const text = result.response.text()

  // Strip markdown code blocks if present
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  return JSON.parse(cleaned) as VideoAnalysis
}
