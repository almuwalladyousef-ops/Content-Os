import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/groq'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Transcription not configured (set GROQ_API_KEY).' }, { status: 400 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const transcript = await transcribeAudio(buffer, file.name, apiKey)

    return NextResponse.json({ transcript })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
