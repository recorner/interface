import { useCallback, useEffect, useMemo, useState } from 'react'

const SWIFT_FREE_SEND_USED_KEY = 'swift-free-send-used-wallets'

// Get list of wallets that have used their free send
function getWalletsWithUsedFreeSend(): string[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const stored = localStorage.getItem(SWIFT_FREE_SEND_USED_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function useSwiftFreeSend(walletAddress: string | undefined) {
  const [usedWallets, setUsedWallets] = useState<string[]>(getWalletsWithUsedFreeSend)

  // Sync to localStorage when state changes
  useEffect(() => {
    localStorage.setItem(SWIFT_FREE_SEND_USED_KEY, JSON.stringify(usedWallets))
  }, [usedWallets])

  // Check if current wallet has used their free send
  const hasUsedFreeSend = useMemo(() => {
    if (!walletAddress) {
      return false
    }
    return usedWallets.includes(walletAddress.toLowerCase())
  }, [walletAddress, usedWallets])

  // Mark wallet as having used their free send
  const markFreeSendUsed = useCallback(() => {
    if (!walletAddress) {
      return
    }
    const lowerAddress = walletAddress.toLowerCase()
    setUsedWallets((prev) => {
      if (prev.includes(lowerAddress)) {
        return prev
      }
      return [...prev, lowerAddress]
    })
  }, [walletAddress])

  // Check if an amount qualifies for free send (exactly 10 USDC)
  const isEligibleForFreeSend = useCallback(
    (amount: number) => {
      // Must be exactly 10 USDC and wallet hasn't used free send yet
      return amount === 10 && !hasUsedFreeSend
    },
    [hasUsedFreeSend],
  )

  return useMemo(
    () => ({
      hasUsedFreeSend,
      markFreeSendUsed,
      isEligibleForFreeSend,
    }),
    [hasUsedFreeSend, markFreeSendUsed, isEligibleForFreeSend],
  )
}
