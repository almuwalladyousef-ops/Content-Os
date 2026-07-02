import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Suggestions not configured (set GEMINI_API_KEY).' }, { status: 400 })

  try {
    const { type, context } = await req.json()
    if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 })

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    if (type === 'captions') {
      const prompt = `Generate 3 engaging short-form video captions for social media (TikTok, Instagram Reels, YouTube Shorts). Each caption should be punchy, hook-driven, and under 150 characters. Return ONLY a JSON array of 3 strings, no markdown, no explanation.${context ? `\n\nContext/topic: ${context}` : ''}`
      const result = await model.generateContent(prompt)
      const text = result.response.text().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      const captions = JSON.parse(text)
      return NextResponse.json({ captions })
    }

    if (type === 'hashtags') {
      const prompt = `Generate 8 relevant hashtags for a short-form video. Mix trending and niche tags. Return ONLY a JSON array of 8 strings (each starting with #), no markdown, no explanation.${context ? `\n\nContext/topic: ${context}` : ''}`
      const result = await model.generateContent(prompt)
      const text = result.response.text().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      const hashtags = JSON.parse(text)
      return NextResponse.json({ hashtags })
    }

    if (type === 'youtube_title') {
      const prompt = `Generate 3 YouTube video titles optimized for Shorts. Each title must be under 60 characters, punchy, and click-worthy. Return ONLY a JSON array of 3 strings, no markdown, no explanation.${context ? `\n\nContext/topic: ${context}` : ''}`
      const result = await model.generateContent(prompt)
      const text = result.response.text().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      const titles = JSON.parse(text)
      return NextResponse.json({ titles })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
