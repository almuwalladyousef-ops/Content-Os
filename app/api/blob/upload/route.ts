import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
