import { useIPAccess } from 'contexts/IPAccessContext'
import UnauthorizedPage from 'pages/Unauthorized'
import { ReactNode } from 'react'
import { Flex, Text } from 'ui/src'

interface IPAccessGateProps {
  children: ReactNode
}

// Loading spinner component
function LoadingScreen(): JSX.Element {
  return (
    <Flex minHeight="100vh" width="100%" backgroundColor="$surface1" alignItems="center" justifyContent="center">
      <Flex alignItems="center" gap="$spacing16">
        <Flex
          width={48}
          height={48}
          borderRadius="$roundedFull"
          borderWidth={3}
          borderColor="$accent1"
          borderTopColor="transparent"
          animation="quick"
          style={{
            animation: 'spin 1s linear infinite',
          }}
        />
        <Text variant="body1" color="$neutral2">
          Verifying access...
        </Text>
      </Flex>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </Flex>
  )
}

export function IPAccessGate({ children }: IPAccessGateProps): JSX.Element {
  const { isChecking, isAllowed, userIP } = useIPAccess()

  // Show loading while checking
  if (isChecking) {
    return <LoadingScreen />
  }

  // Show unauthorized page if not allowed
  if (isAllowed === false) {
    return <UnauthorizedPage userIP={userIP || undefined} />
  }

  // Render children if allowed
  return <>{children}</>
}
