import crypto from 'crypto'

export function createHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  toleranceMs = 300000
): { valid: boolean; error?: string } {
  if (!signature) {
    return { valid: false, error: 'No signature provided' }
  }

  const [timestampPart, hashPart] = signature.split('.')
  if (!timestampPart || !hashPart) {
    return { valid: false, error: 'Invalid signature format' }
  }

  const timestamp = parseInt(timestampPart, 10)
  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp in signature' }
  }

  const now = Date.now()
  if (Math.abs(now - timestamp) > toleranceMs) {
    return { valid: false, error: 'Signature expired' }
  }

  const signedPayload = `${timestamp}.${payload}`
  const expectedHash = createHmacSignature(signedPayload, secret)

  const signatureBuffer = Buffer.from(hashPart, 'hex')
  const expectedBuffer = Buffer.from(expectedHash, 'hex')

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Signature mismatch' }
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, error: 'Signature verification failed' }
  }

  return { valid: true }
}

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}
