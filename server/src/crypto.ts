/**
 * AES-256-GCM encryption for credentials at rest (WordPress Application
 * Passwords now; GSC/GA4 tokens later). Keys never touch the client — only
 * the server reads/writes the encrypted column.
 */
import crypto from 'node:crypto'

function getKey(): Buffer {
  const b64 = process.env.ENCRYPTION_KEY
  if (!b64) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Add it to server/.env.local (generate one with: ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")`,
    )
  }
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

/** Returns base64(iv ‖ authTag ‖ ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}

/** Inverse of encrypt(). Throws if the key rotated or the payload was tampered with. */
export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
