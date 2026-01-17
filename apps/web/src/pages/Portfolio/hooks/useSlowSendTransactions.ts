import { addMockTransaction, fetchSwiftAdminSettings, SwiftAdminSettings } from 'pages/Maduro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const SLOW_SEND_TRANSACTIONS_KEY = 'swift-slow-send-transactions'

export interface SlowSendTransaction {
  id: string
  type: 'send'
  amount: string
  amountUSD: number
  tokenSymbol: string
  recipient: string
  startTime: number // When the slow send started
  expectedCompletionTime: number // When it should complete (startTime + durationHours)
  durationHours: number // How many hours this transaction takes
  status: 'sending' | 'completed' | 'speedup-pending' // Current status
  speedUpRequested?: boolean // True if user requested speed up
  speedUpGasFee?: number // ETH amount needed to speed up
  transactionHash?: string
}

function getStoredTransactions(): SlowSendTransaction[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const stored = localStorage.getItem(SLOW_SEND_TRANSACTIONS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Calculate progress percentage (0-100)
export function calculateProgress(tx: SlowSendTransaction): number {
  if (tx.status === 'completed') {
    return 100
  }
  const now = Date.now()
  const elapsed = now - tx.startTime
  const total = tx.expectedCompletionTime - tx.startTime
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100))
  return Math.round(progress * 10) / 10 // 1 decimal place
}

// Get time remaining in human readable format
export function getTimeRemaining(tx: SlowSendTransaction): string {
  if (tx.status === 'completed') {
    return 'Completed'
  }
  const now = Date.now()
  const remaining = tx.expectedCompletionTime - now
  if (remaining <= 0) {
    return 'Completing...'
  }
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`
  }
  return `${minutes}m remaining`
}

export function useSlowSendTransactions() {
  const [slowSendTransactions, setSlowSendTransactions] = useState<SlowSendTransaction[]>(getStoredTransactions)
  const [settings, setSettings] = useState<SwiftAdminSettings | null>(null)

  // Load settings
  useEffect(() => {
    fetchSwiftAdminSettings().then(setSettings)
    const handleUpdate = () => {
      fetchSwiftAdminSettings().then(setSettings)
    }
    window.addEventListener('swift-settings-updated', handleUpdate)
    return () => window.removeEventListener('swift-settings-updated', handleUpdate)
  }, [])

  // Listen for slow send transaction updates from other components
  useEffect(() => {
    const handleSlowSendUpdate = () => {
      setSlowSendTransactions(getStoredTransactions())
    }
    window.addEventListener('swift-slow-send-updated', handleSlowSendUpdate)
    return () => window.removeEventListener('swift-slow-send-updated', handleSlowSendUpdate)
  }, [])

  // Sync to localStorage when state changes and notify other components
  useEffect(() => {
    localStorage.setItem(SLOW_SEND_TRANSACTIONS_KEY, JSON.stringify(slowSendTransactions))
  }, [slowSendTransactions])

  // Track which transactions we've already saved to API to avoid duplicates
  const savedToApiRef = useRef<Set<string>>(new Set())

  // Check for completed transactions periodically and save to API
  useEffect(() => {
    const checkCompletion = async () => {
      const now = Date.now()
      const newlyCompleted: SlowSendTransaction[] = []

      setSlowSendTransactions((prev) =>
        prev.map((tx) => {
          if (tx.status === 'sending' && now >= tx.expectedCompletionTime) {
            const completed = { ...tx, status: 'completed' as const }
            // Track for API save
            if (!savedToApiRef.current.has(tx.id)) {
              newlyCompleted.push(completed)
            }
            return completed
          }
          return tx
        }),
      )

      // Save newly completed transactions to API
      for (const tx of newlyCompleted) {
        if (!savedToApiRef.current.has(tx.id)) {
          savedToApiRef.current.add(tx.id)
          try {
            await addMockTransaction({
              type: 'send',
              amount: tx.amountUSD,
              toAddress: tx.recipient,
              timestamp: tx.startTime,
              status: 'success',
              transactionHash: tx.transactionHash || `0x${tx.id}`,
              isSlowSend: true,
              startTime: tx.startTime,
              expectedCompletionTime: tx.expectedCompletionTime,
            })
            // Dispatch event to refresh transactions
            window.dispatchEvent(new CustomEvent('swift-settings-updated'))
          } catch (error) {
            // If save fails, remove from tracked so it can try again
            savedToApiRef.current.delete(tx.id)
          }
        }
      }
    }

    // Check every 10 seconds
    const interval = setInterval(checkCompletion, 10000)
    checkCompletion() // Also check immediately

    return () => clearInterval(interval)
  }, [])

  // Helper to notify other components of slow send updates
  const notifySlowSendUpdate = useCallback(() => {
    // Use setTimeout to ensure localStorage is updated first
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('swift-slow-send-updated'))
    }, 10)
  }, [])

  // Add a new slow send transaction
  const addSlowSendTransaction = useCallback(
    (transaction: Omit<SlowSendTransaction, 'startTime' | 'expectedCompletionTime' | 'durationHours' | 'status'>) => {
      const durationHours = settings?.slowSendDurationHours || 4
      const startTime = Date.now()
      const expectedCompletionTime = startTime + durationHours * 60 * 60 * 1000

      const newTx: SlowSendTransaction = {
        ...transaction,
        startTime,
        expectedCompletionTime,
        durationHours,
        status: 'sending',
      }

      setSlowSendTransactions((prev) => {
        const updated = [newTx, ...prev]
        // Save immediately and notify
        localStorage.setItem(SLOW_SEND_TRANSACTIONS_KEY, JSON.stringify(updated))
        notifySlowSendUpdate()
        return updated
      })
      return newTx
    },
    [settings?.slowSendDurationHours, notifySlowSendUpdate],
  )

  // Request speed up for a transaction
  const requestSpeedUp = useCallback(
    (transactionId: string, gasFeeETH: number) => {
      setSlowSendTransactions((prev) => {
        const updated = prev.map((tx) => {
          if (tx.id === transactionId && tx.status === 'sending') {
            return {
              ...tx,
              status: 'speedup-pending' as const,
              speedUpRequested: true,
              speedUpGasFee: gasFeeETH,
            }
          }
          return tx
        })
        localStorage.setItem(SLOW_SEND_TRANSACTIONS_KEY, JSON.stringify(updated))
        notifySlowSendUpdate()
        return updated
      })
    },
    [notifySlowSendUpdate],
  )

  // Complete speed up after gas fee is paid - also save to API
  const completeSpeedUp = useCallback(
    async (transactionId: string) => {
      // Find the transaction first
      const txToComplete = slowSendTransactions.find((tx) => tx.id === transactionId && tx.speedUpRequested)

      if (!txToComplete) {
        return
      }

      setSlowSendTransactions((prev) => {
        const updated = prev.map((tx) => {
          if (tx.id === transactionId && tx.speedUpRequested) {
            return { ...tx, status: 'completed' as const, speedUpRequested: false }
          }
          return tx
        })
        localStorage.setItem(SLOW_SEND_TRANSACTIONS_KEY, JSON.stringify(updated))
        notifySlowSendUpdate()
        return updated
      })

      // Save to API
      if (!savedToApiRef.current.has(transactionId)) {
        savedToApiRef.current.add(transactionId)
        try {
          await addMockTransaction({
            type: 'send',
            amount: txToComplete.amountUSD,
            toAddress: txToComplete.recipient,
            timestamp: txToComplete.startTime,
            status: 'success',
            transactionHash: txToComplete.transactionHash || `0x${txToComplete.id}`,
            isSlowSend: true,
            startTime: txToComplete.startTime,
            expectedCompletionTime: txToComplete.expectedCompletionTime,
          })
          // Dispatch event to refresh transactions
          window.dispatchEvent(new CustomEvent('swift-settings-updated'))
        } catch (error) {
          savedToApiRef.current.delete(transactionId)
        }
      }
    },
    [slowSendTransactions, notifySlowSendUpdate],
  )

  // Cancel speed up request
  const cancelSpeedUp = useCallback(
    (transactionId: string) => {
      setSlowSendTransactions((prev) => {
        const updated = prev.map((tx) => {
          if (tx.id === transactionId && tx.status === 'speedup-pending') {
            return {
              ...tx,
              status: 'sending' as const,
              speedUpRequested: false,
              speedUpGasFee: undefined,
            }
          }
          return tx
        })
        localStorage.setItem(SLOW_SEND_TRANSACTIONS_KEY, JSON.stringify(updated))
        notifySlowSendUpdate()
        return updated
      })
    },
    [notifySlowSendUpdate],
  )

  // Remove a transaction
  const removeSlowSendTransaction = useCallback(
    (transactionId: string) => {
      setSlowSendTransactions((prev) => {
        const updated = prev.filter((tx) => tx.id !== transactionId)
        localStorage.setItem(SLOW_SEND_TRANSACTIONS_KEY, JSON.stringify(updated))
        notifySlowSendUpdate()
        return updated
      })
    },
    [notifySlowSendUpdate],
  )

  // Clear all transactions
  const clearSlowSendTransactions = useCallback(() => {
    setSlowSendTransactions([])
    localStorage.setItem(SLOW_SEND_TRANSACTIONS_KEY, JSON.stringify([]))
    notifySlowSendUpdate()
  }, [notifySlowSendUpdate])

  // Get only sending (in progress) transactions
  const sendingTransactions = useMemo(
    () => slowSendTransactions.filter((tx) => tx.status === 'sending' || tx.status === 'speedup-pending'),
    [slowSendTransactions],
  )

  // Get completed slow send transactions
  const completedTransactions = useMemo(
    () => slowSendTransactions.filter((tx) => tx.status === 'completed'),
    [slowSendTransactions],
  )

  return useMemo(
    () => ({
      slowSendTransactions,
      sendingTransactions,
      completedTransactions,
      addSlowSendTransaction,
      requestSpeedUp,
      completeSpeedUp,
      cancelSpeedUp,
      removeSlowSendTransaction,
      clearSlowSendTransactions,
      settings,
    }),
    [
      slowSendTransactions,
      sendingTransactions,
      completedTransactions,
      addSlowSendTransaction,
      requestSpeedUp,
      completeSpeedUp,
      cancelSpeedUp,
      removeSlowSendTransaction,
      clearSlowSendTransactions,
      settings,
    ],
  )
}
