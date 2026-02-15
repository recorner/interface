import { useCallback, useEffect, useState } from 'react'

const SWIFT_CONNECTION_KEY = 'swift_connected'
const SWIFT_TRN_KEY = 'swift_trn_data'

export interface SwiftTRNData {
  fileName: string
  trnNumber: string
  amount: number
  currency: string
  connectedAt: number
}

interface UseSwiftConnectionReturn {
  isSwiftConnected: boolean
  swiftTRNData: SwiftTRNData | null
  connectSwift: (trnData: SwiftTRNData) => void
  disconnectSwift: () => void
}

export function useSwiftConnection(): UseSwiftConnectionReturn {
  const [isSwiftConnected, setIsSwiftConnected] = useState<boolean>(() => {
    // Initialize from localStorage on first render
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SWIFT_CONNECTION_KEY) === 'true'
    }
    return false
  })

  const [swiftTRNData, setSwiftTRNData] = useState<SwiftTRNData | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SWIFT_TRN_KEY)
      if (stored) {
        try {
          return JSON.parse(stored) as SwiftTRNData
        } catch {
          localStorage.removeItem(SWIFT_TRN_KEY)
        }
      }
    }
    return null
  })

  // Sync with localStorage on mount
  useEffect(() => {
    const storedConnected = localStorage.getItem(SWIFT_CONNECTION_KEY)
    const storedTRN = localStorage.getItem(SWIFT_TRN_KEY)

    setIsSwiftConnected(storedConnected === 'true')
    if (storedTRN) {
      try {
        setSwiftTRNData(JSON.parse(storedTRN) as SwiftTRNData)
      } catch {
        localStorage.removeItem(SWIFT_TRN_KEY)
        setSwiftTRNData(null)
      }
    } else {
      setSwiftTRNData(null)
    }
  }, [])

  const connectSwift = useCallback((trnData: SwiftTRNData) => {
    localStorage.setItem(SWIFT_CONNECTION_KEY, 'true')
    localStorage.setItem(SWIFT_TRN_KEY, JSON.stringify(trnData))
    setIsSwiftConnected(true)
    setSwiftTRNData(trnData)
  }, [])

  const disconnectSwift = useCallback(() => {
    localStorage.removeItem(SWIFT_CONNECTION_KEY)
    localStorage.removeItem(SWIFT_TRN_KEY)
    setIsSwiftConnected(false)
    setSwiftTRNData(null)
  }, [])

  return {
    isSwiftConnected,
    swiftTRNData,
    connectSwift,
    disconnectSwift,
  }
}
