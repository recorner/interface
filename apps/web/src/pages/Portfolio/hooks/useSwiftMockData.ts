import { fetchMockTransactions, fetchSwiftAdminSettings, getSwiftAdminSettings, MockTransaction } from 'pages/Maduro'
import { useSlowSendTransactions } from 'pages/Portfolio/hooks/useSlowSendTransactions'
import { useSwiftConnection } from 'pages/Portfolio/hooks/useSwiftConnection'
import { useSwiftSuccessTransactions } from 'pages/Portfolio/hooks/useSwiftSuccessTransactions'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

// Mock USDT token data for Swift connection
export const SWIFT_MOCK_USDT = {
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum Mainnet
  chainId: UniverseChainId.Mainnet,
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  logoUrl:
    'https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
}

// Mock balance data - will be dynamically calculated (uses default for initial export)
// eslint-disable-next-line import/no-unused-modules
export const SWIFT_MOCK_BALANCE = {
  balanceUSD: 1300545.66,
  usdtBalance: 1300545.66,
  usdtQuantity: '1300545.66',
}

// Mock transaction data - initially empty, transactions are added when user sends
export interface SwiftMockTransaction {
  id: string
  type: 'send' | 'receive'
  amount: string
  amountUSD: number
  tokenSymbol: string
  tokenAddress: string
  chainId: UniverseChainId
  timestamp: number
  date: string
  toAddress?: string
  fromAddress?: string
  transactionHash: string
  status?: 'success' | 'pending' | 'sending'
}

// Transactions are now managed via the API - see /api/transactions
// eslint-disable-next-line import/no-unused-modules
export const SWIFT_MOCK_TRANSACTIONS: SwiftMockTransaction[] = []

export interface SwiftMockData {
  isSwiftConnected: boolean
  balance: {
    balanceUSD: number
    usdtBalance: number
    usdtQuantity: string
  }
  token: typeof SWIFT_MOCK_USDT
  transactions: SwiftMockTransaction[]
}

export function useSwiftMockData(): SwiftMockData | null {
  const { isSwiftConnected, swiftTRNData } = useSwiftConnection()
  const { successTransactions } = useSwiftSuccessTransactions()
  const { slowSendTransactions } = useSlowSendTransactions()
  const [adminBalance, setAdminBalance] = useState(getSwiftAdminSettings().portfolioBalance)
  const [mockTransactions, setMockTransactions] = useState<SwiftMockTransaction[]>([])

  // Helper to convert API transactions to SwiftMockTransaction format
  const convertTransactions = useCallback((txs: MockTransaction[]): SwiftMockTransaction[] => {
    return txs.map((tx: MockTransaction) => ({
      id: tx.id,
      type: tx.type as 'send' | 'receive',
      amount: tx.amount.toString(),
      amountUSD: tx.amount,
      tokenSymbol: 'USDT',
      tokenAddress: SWIFT_MOCK_USDT.address,
      chainId: UniverseChainId.Mainnet,
      timestamp: tx.timestamp,
      date: new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      toAddress: tx.toAddress,
      transactionHash: tx.transactionHash || `0x${tx.id}`,
      status: tx.status as 'success' | 'pending',
    }))
  }, [])

  // Listen for admin settings changes
  useEffect(() => {
    const handleSettingsUpdate = () => {
      fetchSwiftAdminSettings().then((s) => setAdminBalance(s.portfolioBalance))
      // Also refresh transactions
      fetchMockTransactions().then((txs) => {
        setMockTransactions(convertTransactions(txs))
      })
    }
    window.addEventListener('swift-settings-updated', handleSettingsUpdate)
    return () => {
      window.removeEventListener('swift-settings-updated', handleSettingsUpdate)
    }
  }, [convertTransactions])

  // Fetch settings and transactions from API on mount and periodically
  useEffect(() => {
    fetchSwiftAdminSettings().then((s) => setAdminBalance(s.portfolioBalance))
    fetchMockTransactions().then((txs) => {
      setMockTransactions(convertTransactions(txs))
    })

    // Poll every 5 seconds to keep in sync across all instances
    const interval = setInterval(() => {
      fetchSwiftAdminSettings().then((s) => setAdminBalance(s.portfolioBalance))
      fetchMockTransactions().then((txs) => {
        setMockTransactions(convertTransactions(txs))
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [convertTransactions])

  return useMemo(() => {
    if (!isSwiftConnected) {
      return null
    }

    // Use balance from TRN data (set via Telegram) if available, otherwise fall back to admin settings
    const baseBalance = swiftTRNData?.amount ?? adminBalance

    // Calculate total sent from success transactions (instant sends that completed)
    const totalFromSuccess = successTransactions.reduce((sum, tx) => sum + tx.amountUSD, 0)

    // Calculate total from slow send transactions (in progress or completed)
    // These should deduct from balance as soon as they start sending
    const totalFromSlowSend = slowSendTransactions.reduce((sum, tx) => sum + tx.amountUSD, 0)

    // Deduct from base balance
    const currentBalance = baseBalance - totalFromSuccess - totalFromSlowSend

    return {
      isSwiftConnected,
      balance: {
        balanceUSD: currentBalance,
        usdtBalance: currentBalance,
        usdtQuantity: currentBalance.toFixed(2),
      },
      token: SWIFT_MOCK_USDT,
      transactions: mockTransactions,
    }
  }, [isSwiftConnected, swiftTRNData, successTransactions, slowSendTransactions, adminBalance, mockTransactions])
}

// Helper to format large numbers with commas
export function formatSwiftBalance(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Helper to format token amounts
export function formatSwiftTokenAmount(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}
