import crypto from 'crypto'

export function verifySignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
