import { PendingTransaction } from 'pages/Portfolio/components/SwiftSendModal'
import { useCallback, useEffect, useMemo, useState } from 'react'

const SWIFT_PENDING_TRANSACTIONS_KEY = 'swift-pending-transactions'

function getStoredTransactions(): PendingTransaction[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const stored = localStorage.getItem(SWIFT_PENDING_TRANSACTIONS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function useSwiftPendingTransactions() {
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>(getStoredTransactions)

  // Sync to localStorage when state changes
  useEffect(() => {
    localStorage.setItem(SWIFT_PENDING_TRANSACTIONS_KEY, JSON.stringify(pendingTransactions))
  }, [pendingTransactions])

  const addPendingTransaction = useCallback((transaction: PendingTransaction) => {
    setPendingTransactions((prev: PendingTransaction[]) => [transaction, ...prev])
  }, [])

  const removePendingTransaction = useCallback((transactionId: string) => {
    setPendingTransactions((prev: PendingTransaction[]) =>
      prev.filter((tx: PendingTransaction) => tx.id !== transactionId),
    )
  }, [])

  const clearPendingTransactions = useCallback(() => {
    setPendingTransactions([])
  }, [])

  return useMemo(
    () => ({
      pendingTransactions,
      addPendingTransaction,
      removePendingTransaction,
      clearPendingTransactions,
    }),
    [pendingTransactions, addPendingTransaction, removePendingTransaction, clearPendingTransactions],
  )
}
