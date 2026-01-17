import { useEffect, useState } from 'react'
import { Button, Flex, styled, Text } from 'ui/src'
import { Globe } from 'ui/src/components/icons/Globe'
import { ShieldCheck } from 'ui/src/components/icons/ShieldCheck'

const PageContainer = styled(Flex, {
  minHeight: '100vh',
  width: '100%',
  backgroundColor: '$surface1',
  alignItems: 'center',
  justifyContent: 'center',
  p: '$spacing24',
})

const ContentCard = styled(Flex, {
  maxWidth: 480,
  width: '100%',
  backgroundColor: '$surface2',
  borderRadius: '$rounded24',
  p: '$spacing32',
  gap: '$spacing24',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: '$surface3',
})

const HologramContainer = styled(Flex, {
  position: 'relative',
  width: 120,
  height: 120,
  alignItems: 'center',
  justifyContent: 'center',
})

const HologramRing = styled(Flex, {
  position: 'absolute',
  borderRadius: '$roundedFull',
  borderWidth: 2,
  borderColor: '$accent1',
  opacity: 0.3,
})

const SwiftLogo = styled(Flex, {
  width: 80,
  height: 80,
  borderRadius: '$roundedFull',
  backgroundColor: '$accent2',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 3,
  borderColor: '$accent1',
})

const TelegramButton = styled(Button, {
  width: '100%',
  backgroundColor: '#0088cc',
  hoverStyle: {
    backgroundColor: '#006699',
  },
})

interface UnauthorizedPageProps {
  userIP?: string
}

export default function UnauthorizedPage({ userIP }: UnauthorizedPageProps): JSX.Element {
  const [animationPhase, setAnimationPhase] = useState(0)

  // Animate hologram rings
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationPhase((prev) => (prev + 1) % 3)
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  const handleContactAdmin = () => {
    window.open('https://t.me/badcomposer', '_blank')
  }

  return (
    <PageContainer>
      <ContentCard>
        {/* Animated Hologram */}
        <HologramContainer>
          {/* Outer rings with animation */}
          <HologramRing
            width={120}
            height={120}
            style={{
              opacity: animationPhase === 0 ? 0.6 : 0.2,
              transform: `scale(${animationPhase === 0 ? 1.1 : 1})`,
              transition: 'all 0.5s ease-out',
            }}
          />
          <HologramRing
            width={100}
            height={100}
            style={{
              opacity: animationPhase === 1 ? 0.6 : 0.2,
              transform: `scale(${animationPhase === 1 ? 1.1 : 1})`,
              transition: 'all 0.5s ease-out',
            }}
          />
          <HologramRing
            width={80}
            height={80}
            style={{
              opacity: animationPhase === 2 ? 0.6 : 0.2,
              transform: `scale(${animationPhase === 2 ? 1.1 : 1})`,
              transition: 'all 0.5s ease-out',
            }}
          />

          {/* Center SWIFT logo */}
          <SwiftLogo>
            <Globe size={40} color="$accent1" />
          </SwiftLogo>
        </HologramContainer>

        {/* Title */}
        <Flex alignItems="center" gap="$spacing8">
          <ShieldCheck size={28} color="$statusCritical" />
          <Text variant="heading3" color="$neutral1">
            Access Restricted
          </Text>
        </Flex>

        {/* Message */}
        <Flex gap="$spacing12" alignItems="center">
          <Text variant="body1" color="$neutral2" textAlign="center">
            Your IP address is not authorized to access this platform.
          </Text>

          {userIP && (
            <Flex backgroundColor="$surface3" borderRadius="$rounded12" px="$spacing16" py="$spacing8">
              <Text variant="body3" color="$neutral3">
                Your IP: {userIP}
              </Text>
            </Flex>
          )}

          <Text variant="body2" color="$neutral2" textAlign="center">
            Please contact the administrator to request access.
          </Text>
        </Flex>

        {/* Contact Admin Button */}
        <TelegramButton size="large" onPress={handleContactAdmin}>
          <Flex row alignItems="center" gap="$spacing8">
            <Text style={{ fontSize: 20 }}>✈️</Text>
            <Text variant="buttonLabel1" color="white">
              Contact Admin on Telegram
            </Text>
          </Flex>
        </TelegramButton>

        {/* Telegram handle */}
        <Text variant="body4" color="$neutral3">
          @badcomposer
        </Text>
      </ContentCard>
    </PageContainer>
  )
}
