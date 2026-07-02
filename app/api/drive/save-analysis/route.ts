import { NextRequest, NextResponse } from 'next/server'
import { getPersonalAccount } from '@/lib/accounts'
import { ensureFolderStructure, writeJsonFile, writeTextFile } from '@/lib/drive'

export async function POST(req: NextRequest) {
  const account = await getPersonalAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })

  try {
    const { transcript, analysis, name, timestamp } = await req.json()
    const { analysisId, transcriptsId } = await ensureFolderStructure(account.accessToken)

    const analysisFileId = await writeJsonFile(
      account.accessToken,
      analysisId,
      `${name}-${timestamp}-analysis.json`,
      analysis
    )

    const transcriptFileId = await writeTextFile(
      account.accessToken,
      transcriptsId,
      `${name}-${timestamp}-transcript.txt`,
      transcript
    )

    return NextResponse.json({ analysisFileId, transcriptFileId })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
