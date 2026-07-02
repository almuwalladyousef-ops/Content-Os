import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Opens the vault Kanban board served by the home server. Keeps HOME_SERVER_URL
 * server-side — the dashboard "Board" tile just links here and this 302s to the
 * mini. If the home server isn't configured, bounce back to the dashboard.
 */
export async function GET(req: Request) {
  const base = process.env.HOME_SERVER_URL
  if (!base) return NextResponse.redirect(new URL('/?board_error=not_configured', req.url))
  return NextResponse.redirect(`${base.replace(/\/+$/, '')}/`)
}
