import type { Request, Response, NextFunction } from 'express'
import { logger } from 'firebase-functions'

interface RateLimitRecord {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitRecord>()

const rateLimiter = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || (req.socket?.remoteAddress ?? 'unknown')
    const now = Date.now()

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      })
    } else {
      // `has(key)` guarantees `get(key)` returns the record for a native Map.
      const record = rateLimitStore.get(key) as RateLimitRecord
      if (now > record.resetTime) {
        record.count = 1
        record.resetTime = now + windowMs
      } else {
        record.count++
      }

      if (record.count > maxRequests) {
        logger.warn(`Rate limit exceeded for IP: ${key}`)
        res.status(429).json({
          ok: false,
          error: 'Too many requests. Please try again later.',
        })
        return
      }
    }

    next()
  }
}

export default rateLimiter
