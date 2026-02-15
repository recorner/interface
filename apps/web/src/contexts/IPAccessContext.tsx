import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

// API base URL for IP check - detect domain and use matching API subdomain
function getApiBaseUrl(): string {
  if (typeof window === 'undefined' || window.location.hostname === 'localhost') {
    return 'http://localhost:3001/api'
  }
  const host = window.location.hostname
  if (host === 'olesereni.site' || host === 'www.olesereni.site') {
    return 'https://api.olesereni.site/api'
  }
  return 'https://api.uniswap.services/api'
}
const API_BASE_URL = getApiBaseUrl()

interface IPAccessState {
  isChecking: boolean
  isAllowed: boolean | null
  userIP: string | null
  reason: string | null
  error: string | null
}

interface IPAccessContextType extends IPAccessState {
  recheckIP: () => Promise<void>
}

const IPAccessContext = createContext<IPAccessContextType | null>(null)

export function useIPAccess(): IPAccessContextType {
  const context = useContext(IPAccessContext)
  if (!context) {
    throw new Error('useIPAccess must be used within IPAccessProvider')
  }
  return context
}

// Check if current path should bypass IP check
function shouldBypassIPCheck(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  const path = window.location.pathname
  // Allow /maduro and /caliphate admin pages to always be accessible (they have their own auth)
  // This is needed so admin can whitelist IPs
  if (path === '/maduro' || path.startsWith('/maduro') || path === '/caliphate' || path.startsWith('/caliphate')) {
    return true
  }
  return false
}

async function checkIPAccess(): Promise<{ allowed: boolean; ip: string; reason: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/check-ip`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to check IP')
    }

    const data = await response.json()

    // Log this access attempt in the background
    fetch(`${API_BASE_URL}/log-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {
      // Ignore errors - logging is best effort
    })

    return {
      allowed: data.allowed,
      ip: data.ip,
      reason: data.reason,
    }
  } catch (_error) {
    // On error, allow access (fail open) to prevent lockouts
    return {
      allowed: true,
      ip: 'unknown',
      reason: 'Error checking IP - access granted',
    }
  }
}

interface IPAccessProviderProps {
  children: ReactNode
}

export function IPAccessProvider({ children }: IPAccessProviderProps): JSX.Element {
  const [state, setState] = useState<IPAccessState>({
    isChecking: true,
    isAllowed: null,
    userIP: null,
    reason: null,
    error: null,
  })

  const checkAccess = async () => {
    // Bypass check for admin pages
    if (shouldBypassIPCheck()) {
      setState({
        isChecking: false,
        isAllowed: true,
        userIP: null,
        reason: 'Admin bypass',
        error: null,
      })
      return
    }

    setState((prev) => ({ ...prev, isChecking: true, error: null }))

    try {
      const result = await checkIPAccess()
      setState({
        isChecking: false,
        isAllowed: result.allowed,
        userIP: result.ip,
        reason: result.reason,
        error: null,
      })
    } catch (error) {
      setState({
        isChecking: false,
        isAllowed: true, // Fail open
        userIP: null,
        reason: 'Error occurred',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    checkAccess()
  }, [])

  // Also recheck when pathname changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    const handlePathChange = () => {
      checkAccess()
    }

    window.addEventListener('popstate', handlePathChange)
    return () => window.removeEventListener('popstate', handlePathChange)
  }, [])

  const contextValue: IPAccessContextType = {
    ...state,
    recheckIP: checkAccess,
  }

  return <IPAccessContext.Provider value={contextValue}>{children}</IPAccessContext.Provider>
}
