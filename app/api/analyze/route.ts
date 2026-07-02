import { NextRequest, NextResponse } from 'next/server'
import { analyzeTranscript } from '@/lib/gemini'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Analysis not configured (set GEMINI_API_KEY).' }, { status: 400 })

  try {
    const { transcript } = await req.json()
    if (!transcript) return NextResponse.json({ error: 'No transcript provided' }, { status: 400 })

    const analysis = await analyzeTranscript(transcript, apiKey)
    return NextResponse.json({ analysis })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
