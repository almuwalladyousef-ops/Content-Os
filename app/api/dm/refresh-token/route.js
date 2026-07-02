import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/dm/driveDB'
import { refreshLongLivedToken } from '@/lib/instagram'

// Called daily by the home-server heartbeat (Bearer CRON_SECRET). Refreshes
// every stored Instagram Login long-lived token for another ~60 days. Runs
// unguarded when CRON_SECRET is unset (personal single-user app).
export async function POST(req) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '')
  if (process.env.CRON_SECRET && auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = await readDB()
  const storedTokens = db.storedTokens || {}
  const results = []
  let changed = false

  for (const [key, record] of Object.entries(storedTokens)) {
    const token = record?.token
    if (!token || !token.startsWith('IGA')) continue

    try {
      const refreshed = await refreshLongLivedToken(token)
      if (!refreshed.access_token) {
        results.push({ key, ok: false, error: refreshed.error?.message ?? 'no access_token returned' })
        continue
      }

      const expiresAt = refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null
      storedTokens[key] = {
        ...record,
        token: refreshed.access_token,
        meta: { ...(record.meta || {}), expiresAt },
        updatedAt: new Date().toISOString(),
      }
      changed = true
      db.tokenLog = db.tokenLog || []
      db.tokenLog.push({
        token: refreshed.access_token,
        expiryDate: expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : null,
        refreshedAt: new Date().toISOString(),
      })
      results.push({ key, ok: true, expiresAt })
    } catch (err) {
      results.push({ key, ok: false, error: err.message })
    }
  }

  if (changed) {
    db.storedTokens = storedTokens
    await writeDB(db)
  }

  return NextResponse.json({ success: true, refreshed: results })
}
