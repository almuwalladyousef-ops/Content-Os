import { NextRequest } from 'next/server'

/**
 * Resolves the public origin used to build OAuth redirect URIs.
 * Prefers NEXTAUTH_URL (set this in production so it exactly matches what is
 * registered in each provider console), and otherwise falls back to the actual
 * request origin so local dev works with zero configuration.
 */
export function getBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXTAUTH_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  return req.nextUrl.origin
}
