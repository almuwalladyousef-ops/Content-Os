import { NextResponse } from 'next/server'

/**
 * Hands the browser the home-server address + shared secret for direct
 * large-file uploads. Personal single-user app — exposing the one shared
 * secret to the (only) user's browser is the accepted design.
 */
export async function GET() {
  return NextResponse.json({
    url: process.env.HOME_SERVER_URL || '',
    secret: process.env.HOME_SERVER_SECRET || '',
  })
}
