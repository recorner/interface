import { SuccessTransaction } from 'pages/Portfolio/components/SwiftSendModal'
import { useCallback, useEffect, useMemo, useState } from 'react'

const SWIFT_SUCCESS_TRANSACTIONS_KEY = 'swift-success-transactions'

function getStoredTransactions(): SuccessTransaction[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const stored = localStorage.getItem(SWIFT_SUCCESS_TRANSACTIONS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function useSwiftSuccessTransactions() {
  const [successTransactions, setSuccessTransactions] = useState<SuccessTransaction[]>(getStoredTransactions)

  // Sync to localStorage when state changes
  useEffect(() => {
    localStorage.setItem(SWIFT_SUCCESS_TRANSACTIONS_KEY, JSON.stringify(successTransactions))
  }, [successTransactions])

  const addSuccessTransaction = useCallback((transaction: SuccessTransaction) => {
    setSuccessTransactions((prev: SuccessTransaction[]) => [transaction, ...prev])
  }, [])

  const removeSuccessTransaction = useCallback((transactionId: string) => {
    setSuccessTransactions((prev: SuccessTransaction[]) =>
      prev.filter((tx: SuccessTransaction) => tx.id !== transactionId),
    )
  }, [])

  const clearSuccessTransactions = useCallback(() => {
    setSuccessTransactions([])
  }, [])

  return useMemo(
    () => ({
      successTransactions,
      addSuccessTransaction,
      removeSuccessTransaction,
      clearSuccessTransactions,
    }),
    [successTransactions, addSuccessTransaction, removeSuccessTransaction, clearSuccessTransactions],
  )
}
