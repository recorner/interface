import { fetchSwiftAdminSettings, getSwiftAdminSettings } from 'pages/Maduro'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Flex, Text } from 'ui/src'

interface MaintenanceModeProps {
  children: React.ReactNode
}

export function MaintenanceMode({ children }: MaintenanceModeProps) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const location = useLocation()

  // Don't show maintenance mode on /maduro admin page
  const isAdminPage = location.pathname === '/maduro'

  useEffect(() => {
    // Check maintenance mode on mount
    const checkMaintenance = async () => {
      try {
        const settings = await fetchSwiftAdminSettings()
        setIsMaintenanceMode(settings.maintenanceMode)
        setMaintenanceMessage(settings.maintenanceMessage || 'We are currently performing scheduled maintenance.')
      } catch {
        // Use cached settings on error
        const cached = getSwiftAdminSettings()
        setIsMaintenanceMode(cached.maintenanceMode)
        setMaintenanceMessage(cached.maintenanceMessage || 'We are currently performing scheduled maintenance.')
      }
      setIsLoading(false)
    }

    checkMaintenance()

    // Poll every 10 seconds to detect maintenance mode changes
    const interval = setInterval(checkMaintenance, 10000)

    // Listen for settings updates
    const handleSettingsUpdate = () => {
      checkMaintenance()
    }
    window.addEventListener('swift-settings-updated', handleSettingsUpdate)

    return () => {
      clearInterval(interval)
      window.removeEventListener('swift-settings-updated', handleSettingsUpdate)
    }
  }, [])

  // Show loading state briefly
  if (isLoading) {
    return <>{children}</>
  }

  // Show maintenance screen if enabled (but not on admin page)
  if (isMaintenanceMode && !isAdminPage) {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: full-screen overlay needs position:fixed
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: '#131313',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '24px',
        }}
      >
        <Flex
          backgroundColor="$surface2"
          borderRadius="$rounded24"
          p="$spacing32"
          maxWidth={500}
          alignItems="center"
          gap="$spacing24"
          shadowColor="$shadowColor"
          shadowOpacity={0.1}
          shadowRadius={20}
        >
          {/* Maintenance Icon */}
          <Flex
            width={80}
            height={80}
            backgroundColor="$accent2"
            borderRadius="$roundedFull"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={40}>🔧</Text>
          </Flex>

          {/* Title */}
          <Text variant="heading2" textAlign="center">
            Under Maintenance
          </Text>

          {/* Message */}
          <Text variant="body1" color="$neutral2" textAlign="center" lineHeight={24}>
            {maintenanceMessage}
          </Text>

          {/* Decorative progress bar */}
          <Flex width="100%" height={4} backgroundColor="$surface3" borderRadius="$roundedFull" overflow="hidden">
            <Flex
              height="100%"
              width="30%"
              backgroundColor="$accent1"
              borderRadius="$roundedFull"
              animation="quick"
              style={{
                animation: 'shimmer 2s ease-in-out infinite',
              }}
            />
          </Flex>

          <Text variant="body3" color="$neutral3" textAlign="center">
            Please check back soon
          </Text>
        </Flex>

        {/* CSS for shimmer animation */}
        <style>
          {`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              50% { transform: translateX(250%); }
              100% { transform: translateX(-100%); }
            }
          `}
        </style>
      </div>
    )
  }

  return <>{children}</>
}

// Global maintenance mode overlay - renders as a fixed overlay without children
export function GlobalMaintenanceMode() {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const location = useLocation()

  // Don't show maintenance mode on /maduro admin page
  const isAdminPage = location.pathname === '/maduro'

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const settings = await fetchSwiftAdminSettings()
        setIsMaintenanceMode(settings.maintenanceMode)
        setMaintenanceMessage(settings.maintenanceMessage || 'We are currently performing scheduled maintenance.')
      } catch {
        const cached = getSwiftAdminSettings()
        setIsMaintenanceMode(cached.maintenanceMode)
        setMaintenanceMessage(cached.maintenanceMessage || 'We are currently performing scheduled maintenance.')
      }
    }

    checkMaintenance()
    const interval = setInterval(checkMaintenance, 10000)

    const handleSettingsUpdate = () => {
      checkMaintenance()
    }
    window.addEventListener('swift-settings-updated', handleSettingsUpdate)

    return () => {
      clearInterval(interval)
      window.removeEventListener('swift-settings-updated', handleSettingsUpdate)
    }
  }, [])

  if (!isMaintenanceMode || isAdminPage) {
    return null
  }

  return (
    // biome-ignore lint/correctness/noRestrictedElements: full-screen overlay needs position:fixed
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#131313',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <Flex
        backgroundColor="$surface2"
        borderRadius="$rounded24"
        p="$spacing32"
        maxWidth={500}
        width="100%"
        alignItems="center"
        gap="$spacing24"
        shadowColor="$shadowColor"
        shadowOpacity={0.1}
        shadowRadius={20}
      >
        {/* Maintenance Icon */}
        <Flex
          width={80}
          height={80}
          backgroundColor="$accent2"
          borderRadius="$roundedFull"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={40}>🔧</Text>
        </Flex>

        {/* Title */}
        <Text variant="heading2" textAlign="center">
          Under Maintenance
        </Text>

        {/* Message */}
        <Text variant="body1" color="$neutral2" textAlign="center" lineHeight={24}>
          {maintenanceMessage}
        </Text>

        {/* Decorative progress bar */}
        <Flex width="100%" height={4} backgroundColor="$surface3" borderRadius="$roundedFull" overflow="hidden">
          <Flex
            height="100%"
            width="30%"
            backgroundColor="$accent1"
            borderRadius="$roundedFull"
            style={{
              animation: 'maintenanceShimmer 2s ease-in-out infinite',
            }}
          />
        </Flex>

        <Text variant="body3" color="$neutral3" textAlign="center">
          Please check back soon
        </Text>
      </Flex>

      <style>
        {`
          @keyframes maintenanceShimmer {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(250%); }
            100% { transform: translateX(-100%); }
          }
        `}
      </style>
    </div>
  )
}

// Hook to check maintenance mode status
// eslint-disable-next-line import/no-unused-modules
export function useMaintenanceMode() {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const settings = await fetchSwiftAdminSettings()
        setIsMaintenanceMode(settings.maintenanceMode)
        setMaintenanceMessage(settings.maintenanceMessage || '')
      } catch {
        // Ignore errors
      }
    }

    checkMaintenance()
    const interval = setInterval(checkMaintenance, 10000)
    return () => clearInterval(interval)
  }, [])

  return { isMaintenanceMode, maintenanceMessage }
}
