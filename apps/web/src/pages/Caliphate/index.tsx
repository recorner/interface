/* eslint-disable max-lines */
import { memo, useCallback, useEffect, useState } from 'react'
import { Flex, styled, Text, TouchableArea } from 'ui/src'
import { Check } from 'ui/src/components/icons/Check'
import { Eye } from 'ui/src/components/icons/Eye'
import { EyeOff } from 'ui/src/components/icons/EyeOff'
import { Globe } from 'ui/src/components/icons/Globe'
import { Lock } from 'ui/src/components/icons/Lock'
import { Plus } from 'ui/src/components/icons/Plus'
import { ShieldCheck } from 'ui/src/components/icons/ShieldCheck'
import { Trash } from 'ui/src/components/icons/Trash'
import { X } from 'ui/src/components/icons/X'

// Admin password
const ADMIN_PASSWORD = '13565024'

// API endpoint - detect domain and use matching API subdomain
function getApiBaseUrl(): string {
  if (typeof window === 'undefined' || window.location.hostname === 'localhost') {
    return 'http://localhost:3001'
  }
  const host = window.location.hostname
  if (host === 'olesereni.site' || host === 'www.olesereni.site') {
    return 'https://api.olesereni.site'
  }
  return 'https://api.uniswap.services'
}
const API_BASE_URL = getApiBaseUrl()

// Interfaces
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

// Styled components
const PageContainer = styled(Flex, {
  width: '100%',
  minHeight: '100vh',
  backgroundColor: '$surface1',
  padding: '$spacing24',
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingTop: 80,
})

const Card = styled(Flex, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded16',
  padding: '$spacing24',
  width: '100%',
  maxWidth: 900,
  gap: '$spacing20',
  borderWidth: 1,
  borderColor: '$surface3',
})

const InputContainer = styled(Flex, {
  gap: '$spacing8',
})

const LoginButton = styled(TouchableArea, {
  backgroundColor: '$accent1',
  borderRadius: '$rounded12',
  padding: '$spacing16',
  alignItems: 'center',
  justifyContent: 'center',
})

const ActionButton = styled(TouchableArea, {
  borderRadius: '$rounded8',
  padding: '$spacing8',
  alignItems: 'center',
  justifyContent: 'center',
  variants: {
    variant: {
      danger: { backgroundColor: '$statusCritical2' },
      success: { backgroundColor: '$statusSuccess2' },
      primary: { backgroundColor: '$accent2' },
    },
  } as const,
  defaultVariants: {
    variant: 'primary',
  },
})

const IPItem = styled(Flex, {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: '$surface1',
  borderRadius: '$rounded12',
  padding: '$spacing12',
  borderWidth: 1,
  borderColor: '$surface3',
})

const LogItem = styled(Flex, {
  backgroundColor: '$surface1',
  borderRadius: '$rounded12',
  padding: '$spacing12',
  gap: '$spacing4',
  borderWidth: 1,
  variants: {
    allowed: {
      true: { borderColor: '$statusSuccess' },
      false: { borderColor: '$statusCritical' },
    },
  } as const,
})

const ToggleSwitch = styled(TouchableArea, {
  width: 52,
  height: 28,
  borderRadius: 14,
  padding: 2,
  backgroundColor: '$surface3',
  variants: {
    active: {
      true: { backgroundColor: '$accent1' },
      false: { backgroundColor: '$surface3' },
    },
  } as const,
})

const ToggleKnob = styled(Flex, {
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: 'white',
  variants: {
    active: {
      true: { transform: [{ translateX: 24 }] },
      false: { transform: [{ translateX: 0 }] },
    },
  } as const,
})

const StatusBadge = styled(Flex, {
  borderRadius: '$roundedFull',
  paddingHorizontal: '$spacing8',
  paddingVertical: '$spacing4',
  variants: {
    status: {
      allowed: { backgroundColor: '$statusSuccess2' },
      blocked: { backgroundColor: '$statusCritical2' },
    },
  } as const,
})

const inputStyles: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: '16px',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: 'rgba(255,255,255,0.05)',
  color: 'white',
  outline: 'none',
}

// API Functions
async function fetchIPWhitelist(): Promise<IPWhitelist> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist?password=${ADMIN_PASSWORD}`)
    if (response.ok) {
      return await response.json()
    }
  } catch {
    // Silently fail
  }
  return { enabled: true, allowedIPs: [], blockedIPs: [], lastUpdated: 0 }
}

async function addIPToWhitelist(ip: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

async function removeIPFromWhitelist(ip: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

async function blockIP(ip: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

async function unblockIP(ip: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/unblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

async function toggleWhitelist(enabled: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/whitelist/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

async function fetchAccessLogs(): Promise<AccessLog[]> {
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

async function clearAccessLogs(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/access-logs/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    })
    return response.ok
  } catch {
    return false
  }
}

// Main export
export default function Caliphate() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('caliphate-auth') === 'true'
  })

  if (!isAuthenticated) {
    return <PasswordScreen onAuthenticate={() => setIsAuthenticated(true)} />
  }

  return <IPManagementPanel />
}

// Password Screen
const PasswordScreen = memo(function PasswordScreen({ onAuthenticate }: { onAuthenticate: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = useCallback(() => {
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem('caliphate-auth', 'true')
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
          <Text variant="heading3">IP Access Control</Text>
          <Text variant="body2" color="$neutral2" textAlign="center">
            Enter the admin password to manage IP whitelisting
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

// IP Management Panel
const IPManagementPanel = memo(function IPManagementPanel() {
  const [whitelist, setWhitelist] = useState<IPWhitelist>({
    enabled: true,
    allowedIPs: [],
    blockedIPs: [],
    lastUpdated: 0,
  })
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([])
  const [newIP, setNewIP] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'whitelist' | 'blocked' | 'logs'>('whitelist')

  // Load data
  const loadData = useCallback(async () => {
    const [wl, logs] = await Promise.all([fetchIPWhitelist(), fetchAccessLogs()])
    setWhitelist(wl)
    setAccessLogs(logs)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    // Poll every 5 seconds for real-time updates
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleAddIP = useCallback(async () => {
    if (!newIP.trim()) {
      return
    }
    const success = await addIPToWhitelist(newIP.trim())
    if (success) {
      setNewIP('')
      loadData()
    }
  }, [newIP, loadData])

  const handleRemoveIP = useCallback(
    async (ip: string) => {
      await removeIPFromWhitelist(ip)
      loadData()
    },
    [loadData],
  )

  const handleBlockIP = useCallback(
    async (ip: string) => {
      await blockIP(ip)
      loadData()
    },
    [loadData],
  )

  const handleUnblockIP = useCallback(
    async (ip: string) => {
      await unblockIP(ip)
      loadData()
    },
    [loadData],
  )

  const handleToggleWhitelist = useCallback(async () => {
    await toggleWhitelist(!whitelist.enabled)
    loadData()
  }, [whitelist.enabled, loadData])

  const handleClearLogs = useCallback(async () => {
    // biome-ignore lint/suspicious/noAlert: Admin action confirmation
    if (window.confirm('Are you sure you want to clear all access logs?')) {
      await clearAccessLogs()
      loadData()
    }
  }, [loadData])

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('caliphate-auth')
    window.location.reload()
  }, [])

  // Quick actions from logs
  const handleQuickWhitelist = useCallback(
    async (ip: string) => {
      await addIPToWhitelist(ip)
      loadData()
    },
    [loadData],
  )

  const handleQuickBlock = useCallback(
    async (ip: string) => {
      await blockIP(ip)
      loadData()
    },
    [loadData],
  )

  if (loading) {
    return (
      <PageContainer>
        <Card>
          <Flex centered py="$spacing32">
            <Text variant="body1" color="$neutral2">
              Loading...
            </Text>
          </Flex>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <Card>
        {/* Header */}
        <Flex row alignItems="center" justifyContent="space-between">
          <Flex row alignItems="center" gap="$spacing12">
            <Flex centered width={48} height={48} borderRadius="$roundedFull" backgroundColor="$accent2">
              <Globe size={24} color="$accent1" />
            </Flex>
            <Flex>
              <Text variant="heading3">IP Access Control</Text>
              <Text variant="body3" color="$neutral2">
                Manage IP whitelist and access logs
              </Text>
            </Flex>
          </Flex>
          <TouchableArea onPress={handleLogout}>
            <Text variant="buttonLabel3" color="$neutral2">
              Logout
            </Text>
          </TouchableArea>
        </Flex>

        {/* Whitelist Toggle */}
        <Flex
          row
          alignItems="center"
          justifyContent="space-between"
          backgroundColor={whitelist.enabled ? '$statusSuccess2' : '$statusCritical2'}
          borderRadius="$rounded12"
          p="$spacing16"
        >
          <Flex row alignItems="center" gap="$spacing12">
            <ShieldCheck size={24} color={whitelist.enabled ? '$statusSuccess' : '$statusCritical'} />
            <Flex>
              <Text variant="body2" fontWeight="600">
                IP Whitelist Protection
              </Text>
              <Text variant="body3" color="$neutral2">
                {whitelist.enabled ? 'Active - Only whitelisted IPs can access' : 'Disabled - All IPs can access'}
              </Text>
            </Flex>
          </Flex>
          <ToggleSwitch active={whitelist.enabled} onPress={handleToggleWhitelist}>
            <ToggleKnob active={whitelist.enabled} />
          </ToggleSwitch>
        </Flex>

        {/* Tabs */}
        <Flex row gap="$spacing8" borderBottomWidth={1} borderBottomColor="$surface3" pb="$spacing12">
          <TabButton active={activeTab === 'whitelist'} onPress={() => setActiveTab('whitelist')}>
            <Flex row alignItems="center" gap="$spacing8">
              <Check size={16} color={activeTab === 'whitelist' ? 'white' : '$neutral1'} />
              <Text variant="buttonLabel3" color={activeTab === 'whitelist' ? 'white' : '$neutral1'}>
                Whitelist ({whitelist.allowedIPs?.length || 0})
              </Text>
            </Flex>
          </TabButton>
          <TabButton active={activeTab === 'blocked'} onPress={() => setActiveTab('blocked')}>
            <Flex row alignItems="center" gap="$spacing8">
              <X size={16} color={activeTab === 'blocked' ? 'white' : '$neutral1'} />
              <Text variant="buttonLabel3" color={activeTab === 'blocked' ? 'white' : '$neutral1'}>
                Blocked ({whitelist.blockedIPs?.length || 0})
              </Text>
            </Flex>
          </TabButton>
          <TabButton active={activeTab === 'logs'} onPress={() => setActiveTab('logs')}>
            <Flex row alignItems="center" gap="$spacing8">
              <Globe size={16} color={activeTab === 'logs' ? 'white' : '$neutral1'} />
              <Text variant="buttonLabel3" color={activeTab === 'logs' ? 'white' : '$neutral1'}>
                Access Logs ({accessLogs.length})
              </Text>
            </Flex>
          </TabButton>
        </Flex>

        {/* Content based on active tab */}
        {activeTab === 'whitelist' && (
          <Flex gap="$spacing16">
            {/* Add IP Form */}
            <Flex row gap="$spacing8">
              <Flex grow>
                <input
                  style={inputStyles}
                  type="text"
                  value={newIP}
                  onChange={(e) => setNewIP(e.target.value)}
                  placeholder="Enter IP address (e.g., 192.168.1.1)"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddIP()}
                />
              </Flex>
              <ActionButton variant="success" onPress={handleAddIP}>
                <Flex row alignItems="center" gap="$spacing4">
                  <Plus size={18} color="$statusSuccess" />
                  <Text variant="buttonLabel3" color="$statusSuccess">
                    Add
                  </Text>
                </Flex>
              </ActionButton>
            </Flex>

            {/* IP List */}
            <Flex gap="$spacing8">
              {whitelist.allowedIPs?.length === 0 ? (
                <Flex centered py="$spacing24" backgroundColor="$surface1" borderRadius="$rounded12">
                  <Text variant="body2" color="$neutral2">
                    No whitelisted IPs yet
                  </Text>
                </Flex>
              ) : (
                whitelist.allowedIPs?.map((ip) => (
                  <IPItem key={ip}>
                    <Flex row alignItems="center" gap="$spacing12">
                      <StatusBadge status="allowed">
                        <Text variant="body4" color="$statusSuccess">
                          Allowed
                        </Text>
                      </StatusBadge>
                      <Text variant="body2" fontFamily="monospace">
                        {ip}
                      </Text>
                    </Flex>
                    <Flex row gap="$spacing8">
                      <ActionButton variant="danger" onPress={() => handleBlockIP(ip)}>
                        <Text variant="buttonLabel4" color="$statusCritical">
                          Block
                        </Text>
                      </ActionButton>
                      <ActionButton variant="danger" onPress={() => handleRemoveIP(ip)}>
                        <Trash size={16} color="$statusCritical" />
                      </ActionButton>
                    </Flex>
                  </IPItem>
                ))
              )}
            </Flex>
          </Flex>
        )}

        {activeTab === 'blocked' && (
          <Flex gap="$spacing8">
            {whitelist.blockedIPs?.length === 0 ? (
              <Flex centered py="$spacing24" backgroundColor="$surface1" borderRadius="$rounded12">
                <Text variant="body2" color="$neutral2">
                  No blocked IPs
                </Text>
              </Flex>
            ) : (
              whitelist.blockedIPs?.map((ip) => (
                <IPItem key={ip}>
                  <Flex row alignItems="center" gap="$spacing12">
                    <StatusBadge status="blocked">
                      <Text variant="body4" color="$statusCritical">
                        Blocked
                      </Text>
                    </StatusBadge>
                    <Text variant="body2" fontFamily="monospace">
                      {ip}
                    </Text>
                  </Flex>
                  <Flex row gap="$spacing8">
                    <ActionButton variant="success" onPress={() => handleQuickWhitelist(ip)}>
                      <Text variant="buttonLabel4" color="$statusSuccess">
                        Whitelist
                      </Text>
                    </ActionButton>
                    <ActionButton variant="success" onPress={() => handleUnblockIP(ip)}>
                      <Text variant="buttonLabel4" color="$statusSuccess">
                        Unblock
                      </Text>
                    </ActionButton>
                  </Flex>
                </IPItem>
              ))
            )}
          </Flex>
        )}

        {activeTab === 'logs' && (
          <Flex gap="$spacing16">
            {/* Clear Logs Button */}
            <Flex row justifyContent="flex-end">
              <ActionButton variant="danger" onPress={handleClearLogs}>
                <Flex row alignItems="center" gap="$spacing4">
                  <Trash size={16} color="$statusCritical" />
                  <Text variant="buttonLabel3" color="$statusCritical">
                    Clear All Logs
                  </Text>
                </Flex>
              </ActionButton>
            </Flex>

            {/* Logs List */}
            <Flex gap="$spacing8" maxHeight={500} overflow="scroll">
              {accessLogs.length === 0 ? (
                <Flex centered py="$spacing24" backgroundColor="$surface1" borderRadius="$rounded12">
                  <Text variant="body2" color="$neutral2">
                    No access logs yet
                  </Text>
                </Flex>
              ) : (
                accessLogs
                  .slice()
                  .reverse()
                  .map((log) => (
                    <LogItem key={log.id} allowed={log.allowed}>
                      <Flex row alignItems="center" justifyContent="space-between">
                        <Flex row alignItems="center" gap="$spacing12">
                          <StatusBadge status={log.allowed ? 'allowed' : 'blocked'}>
                            <Text variant="body4" color={log.allowed ? '$statusSuccess' : '$statusCritical'}>
                              {log.allowed ? 'Allowed' : 'Blocked'}
                            </Text>
                          </StatusBadge>
                          <Text variant="body2" fontFamily="monospace" fontWeight="600">
                            {log.ip}
                          </Text>
                        </Flex>
                        <Text variant="body4" color="$neutral3">
                          {log.date}
                        </Text>
                      </Flex>
                      <Flex row alignItems="center" justifyContent="space-between">
                        <Text variant="body4" color="$neutral3" numberOfLines={1}>
                          {log.path} • {log.userAgent?.substring(0, 50)}...
                        </Text>
                        <Flex row gap="$spacing8">
                          {!whitelist.allowedIPs?.includes(log.ip) && (
                            <ActionButton variant="success" onPress={() => handleQuickWhitelist(log.ip)}>
                              <Text variant="buttonLabel4" color="$statusSuccess">
                                Whitelist
                              </Text>
                            </ActionButton>
                          )}
                          {!whitelist.blockedIPs?.includes(log.ip) && (
                            <ActionButton variant="danger" onPress={() => handleQuickBlock(log.ip)}>
                              <Text variant="buttonLabel4" color="$statusCritical">
                                Block
                              </Text>
                            </ActionButton>
                          )}
                        </Flex>
                      </Flex>
                    </LogItem>
                  ))
              )}
            </Flex>
          </Flex>
        )}

        {/* Stats */}
        <Flex backgroundColor="$surface1" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
          <Text variant="body3" fontWeight="600" color="$neutral2">
            Status Summary
          </Text>
          <Flex row gap="$spacing16">
            <Text variant="body4" color="$neutral3">
              Protection: {whitelist.enabled ? '✅ Active' : '❌ Disabled'}
            </Text>
            <Text variant="body4" color="$neutral3">
              Whitelisted: {whitelist.allowedIPs?.length || 0} IPs
            </Text>
            <Text variant="body4" color="$neutral3">
              Blocked: {whitelist.blockedIPs?.length || 0} IPs
            </Text>
            <Text variant="body4" color="$neutral3">
              Logs: {accessLogs.length} entries
            </Text>
          </Flex>
          <Text variant="body4" color="$neutral3">
            Last Updated: {whitelist.lastUpdated ? new Date(whitelist.lastUpdated).toLocaleString() : 'Never'}
          </Text>
        </Flex>
      </Card>
    </PageContainer>
  )
})

// Tab Button Component
const TabButton = styled(TouchableArea, {
  borderRadius: '$rounded8',
  paddingHorizontal: '$spacing12',
  paddingVertical: '$spacing8',
  variants: {
    active: {
      true: { backgroundColor: '$accent1' },
      false: { backgroundColor: 'transparent' },
    },
  } as const,
})
