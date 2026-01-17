import { useCallback, useEffect, useState } from 'react'

const COINGECKO_ETH_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
const PRICE_REFRESH_INTERVAL = 30000 // 30 seconds

interface EthPriceState {
  price: number
  isLoading: boolean
  lastUpdated: number
}

// Cache to share price across components
let priceCache: EthPriceState = {
  price: 3640, // Default fallback
  isLoading: false,
  lastUpdated: 0,
}

export function useRealTimeEthPrice(): EthPriceState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<EthPriceState>(priceCache)

  const fetchPrice = useCallback(async () => {
    // Skip if recently fetched (within 10 seconds)
    if (Date.now() - priceCache.lastUpdated < 10000 && priceCache.price > 0) {
      setState(priceCache)
      return
    }

    setState((prev) => ({ ...prev, isLoading: true }))

    try {
      const response = await fetch(COINGECKO_ETH_URL)
      if (response.ok) {
        const data = await response.json()
        const ethPrice = data?.ethereum?.usd

        if (ethPrice && typeof ethPrice === 'number') {
          priceCache = {
            price: ethPrice,
            isLoading: false,
            lastUpdated: Date.now(),
          }
          setState(priceCache)
          return
        }
      }
    } catch {
      // Silently fail - use cached price
    }

    // If fetch fails, use cached price
    setState((prev) => ({ ...prev, isLoading: false }))
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchPrice()
  }, [fetchPrice])

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(fetchPrice, PRICE_REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchPrice])

  return {
    ...state,
    refetch: fetchPrice,
  }
}

// Simple function to get cached price (non-hook version for calculations)
export function getCachedEthPrice(): number {
  return priceCache.price || 3640
}
