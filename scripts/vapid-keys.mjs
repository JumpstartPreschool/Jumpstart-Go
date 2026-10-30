// Prints a new VAPID key pair for web push. Run once: node scripts/vapid-keys.mjs
// Put VITE_VAPID_PUBLIC_KEY in .env.local (and the Cloudflare build); set VAPID_PRIVATE_KEY only as a push-send secret.
import { generateKeyPairSync } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = privateKey.export({ format: 'jwk' })
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url')
console.log(`VITE_VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${jwk.d}`)
