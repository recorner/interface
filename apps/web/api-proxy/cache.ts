import { getAllSettings, getWhitelist } from './database'

// ─── In-memory cache with TTL ────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class ServerCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private defaultTTL: number

  constructor(defaultTTLMs = 5000) {
    this.defaultTTL = defaultTTLMs
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    })
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

// Singleton cache instance
export const cache = new ServerCache(5000) // 5 second default TTL

// ─── Cache keys ──────────────────────────────────────────────────────────────

export const CacheKeys = {
  SETTINGS: 'settings:all',
  WHITELIST: 'whitelist:data',
  TRANSACTIONS: 'transactions:all',
  ACCESS_LOGS: 'logs:recent',
  TELEGRAM_CONFIG: 'telegram:config',
} as const

// ─── Cached getters ──────────────────────────────────────────────────────────

export function getCachedSettings(): Record<string, unknown> {
  const cached = cache.get<Record<string, unknown>>(CacheKeys.SETTINGS)
  if (cached) {
    return cached
  }
  const settings = getAllSettings()
  cache.set(CacheKeys.SETTINGS, settings)
  return settings
}

export function getCachedWhitelist() {
  const cached = cache.get<ReturnType<typeof getWhitelist>>(CacheKeys.WHITELIST)
  if (cached) {
    return cached
  }
  const whitelist = getWhitelist()
  cache.set(CacheKeys.WHITELIST, whitelist)
  return whitelist
}

// ─── Cache invalidation helpers ──────────────────────────────────────────────

export function invalidateSettingsCache(): void {
  cache.invalidate(CacheKeys.SETTINGS)
  cache.invalidate(CacheKeys.TELEGRAM_CONFIG)
}

export function invalidateWhitelistCache(): void {
  cache.invalidate(CacheKeys.WHITELIST)
}

export function invalidateTransactionsCache(): void {
  cache.invalidate(CacheKeys.TRANSACTIONS)
}

export function invalidateLogsCache(): void {
  cache.invalidate(CacheKeys.ACCESS_LOGS)
}
