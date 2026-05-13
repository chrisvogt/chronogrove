import crypto from 'crypto'

import type { Request } from 'express'

interface CookieOptions {
  httpOnly?: boolean
  sameSite?: 'lax' | 'strict'
  secure?: boolean
}

interface CsrfTokenState {
  secret: string
  token: string
  validate: (req: Request, token: string | undefined) => boolean
}

const SECRET_LENGTH = 18
/** Unpredictable salt prefix length in characters (hex: two chars per random byte). */
const TOKEN_SALT_RANDOM_BYTES = 5
const TOKEN_SALT_LENGTH = TOKEN_SALT_RANDOM_BYTES * 2

function createSaltPrefix(): string {
  return crypto.randomBytes(TOKEN_SALT_RANDOM_BYTES).toString('hex')
}

function tokenize(salt: string, secret: string): string {
  return salt + crypto.createHmac('sha256', secret).update(salt).digest('base64')
}

export function createCookieBackedCsrfImpl(cookieOptions: CookieOptions) {
  return {
    create(req: Request, secretKey: string): CsrfTokenState {
      const existingSecret = req.cookies?.[secretKey]
      const secret = existingSecret || crypto.randomBytes(SECRET_LENGTH).toString('base64')

      if (!existingSecret) {
        req.res?.cookie(secretKey, secret, cookieOptions)
      }

      const token = tokenize(createSaltPrefix(), secret)

      return {
        secret,
        token,
        validate(currentReq: Request, submittedToken: string | undefined): boolean {
          if (typeof submittedToken !== 'string') {
            return false
          }

          const requestSecret = currentReq.cookies?.[secretKey]
          if (!requestSecret) {
            return false
          }

          const expectedToken = tokenize(submittedToken.slice(0, TOKEN_SALT_LENGTH), requestSecret)
          const submittedBuffer = Buffer.from(submittedToken)
          const expectedBuffer = Buffer.from(expectedToken)

          if (submittedBuffer.length !== expectedBuffer.length) {
            return false
          }

          return crypto.timingSafeEqual(submittedBuffer, expectedBuffer)
        },
      }
    },
  }
}
