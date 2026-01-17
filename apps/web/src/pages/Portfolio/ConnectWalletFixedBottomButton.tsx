import { useAccountDrawer } from 'components/AccountDrawer/MiniPortfolio/hooks'
import { SwiftConnectModal } from 'pages/Portfolio/components/SwiftConnectModal'
import { CONNECT_WALLET_FIXED_BOTTOM_SECTION_HEIGHT } from 'pages/Portfolio/constants'
import { SwiftTRNData, useSwiftConnection } from 'pages/Portfolio/hooks/useSwiftConnection'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Flex, styled, Text, useIsDarkMode, useSporeColors } from 'ui/src'
import { opacify, zIndexes } from 'ui/src/theme'
import { ElementName, InterfaceEventName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

function useBackgroundGradient() {
  const colors = useSporeColors()
  const isDarkMode = useIsDarkMode()
  const fadeMaxOpacity = isDarkMode ? 70 : 90
  const gradientColors = {
    0: opacify(fadeMaxOpacity, colors.surface1.val),
    70: opacify(fadeMaxOpacity * (2 / 3), colors.surface1.val),
    80: opacify(fadeMaxOpacity / 2, colors.surface1.val),
    100: opacify(0, colors.surface1.val),
  }
  return `linear-gradient(to top, ${gradientColors[0]} 0%, ${gradientColors[70]} 70%, ${gradientColors[80]} 80%, ${gradientColors[100]} 100%)`
}

// z-index needs to be hight than content buy below the sidebar
const zIndex = zIndexes.header

const FixedBottomButton = styled(Flex, {
  '$platform-web': {
    position: 'fixed',
    bottom: '$spacing40',
    left: 0,
    right: 0,
    willChange: 'transform, opacity',
  },
  zIndex,
  width: '100%',
  centered: true,
  animation: '300ms',
  variants: {
    visible: {
      true: {
        opacity: 1,
        y: 0,
        scale: 1,
      },
      false: {
        opacity: 0,
        y: 10,
        scale: 0.8,
      },
    },
  },
})

interface ConnectWalletBottomOverlayProps {
  shouldShow?: boolean
}

export function ConnectWalletFixedBottomButton({ shouldShow = false }: ConnectWalletBottomOverlayProps): JSX.Element {
  const accountDrawer = useAccountDrawer()
  const { t } = useTranslation()
  const backgroundGradient = useBackgroundGradient()
  const [isMounted, setIsMounted] = useState(false)
  const { isSwiftConnected, connectSwift, disconnectSwift } = useSwiftConnection()
  const [isSwiftModalOpen, setIsSwiftModalOpen] = useState(false)

  // Ensure component is mounted and laid out before animating in
  useEffect(() => {
    if (shouldShow && !isMounted) {
      // Use requestAnimationFrame to ensure layout is calculated before animating
      requestAnimationFrame(() => {
        setIsMounted(true)
      })
    } else if (!shouldShow) {
      setIsMounted(false)
    }
  }, [shouldShow, isMounted])

  // Only show if both shouldShow is true AND component is mounted (prevents choppy initial animation)
  const showAfterMount = shouldShow && isMounted

  const handleSwiftConnectClick = () => {
    setIsSwiftModalOpen(true)
  }

  const handleSwiftModalClose = () => {
    setIsSwiftModalOpen(false)
  }

  const handleSwiftSuccess = useCallback(
    (trnData: SwiftTRNData) => {
      connectSwift(trnData)
      setIsSwiftModalOpen(false)
    },
    [connectSwift],
  )

  // If Swift is connected, show wallet connect prominently
  if (isSwiftConnected) {
    return (
      <>
        {/* Bottom fade overlay */}
        <Flex
          $platform-web={{ position: 'fixed', bottom: 0, left: 0, right: 0, willChange: 'transform, opacity' }}
          zIndex={zIndex}
          height={CONNECT_WALLET_FIXED_BOTTOM_SECTION_HEIGHT}
          width="100%"
          background={backgroundGradient}
          justifyContent="center"
          alignItems="center"
          cursor="not-allowed"
          opacity={showAfterMount ? 1 : 0}
          y={showAfterMount ? 0 : 30}
          animation="300ms"
          pointerEvents={showAfterMount ? 'auto' : 'none'}
        />
        <FixedBottomButton visible={showAfterMount} pointerEvents={showAfterMount ? 'auto' : 'none'}>
          <Flex
            row
            centered
            boxShadow="0 25px 50px -12px rgba(18, 18, 23, 0.25);"
            backgroundColor="$surface1"
            borderRadius="$rounded20"
            p="$spacing16"
            gap="$spacing16"
            cursor="default"
            borderWidth={1}
            borderColor="$surface3"
          >
            <Trace logPress element={ElementName.SwiftDisconnectButton}>
              <Button variant="default" emphasis="tertiary" size="small" onPress={disconnectSwift}>
                {t('swift.button.disconnect')}
              </Button>
            </Trace>
            <Text variant="body2" color="$neutral2">
              {t('portfolio.disconnected.connectWallet.cta')}
            </Text>
            <Trace
              logPress
              eventOnTrigger={InterfaceEventName.ConnectWalletButtonClicked}
              element={ElementName.PortfolioConnectWalletBottomButton}
            >
              <Button variant="branded" size="medium" width="fit-content" maxHeight="48px" onPress={accountDrawer.open}>
                {t('common.connectWallet.button')}
              </Button>
            </Trace>
          </Flex>
        </FixedBottomButton>
      </>
    )
  }

  // Swift not connected - show Connect Swift as primary
  return (
    <>
      {/* Bottom fade overlay */}
      <Flex
        $platform-web={{ position: 'fixed', bottom: 0, left: 0, right: 0, willChange: 'transform, opacity' }}
        zIndex={zIndex}
        height={CONNECT_WALLET_FIXED_BOTTOM_SECTION_HEIGHT}
        width="100%"
        background={backgroundGradient}
        justifyContent="center"
        alignItems="center"
        cursor="not-allowed"
        opacity={showAfterMount ? 1 : 0}
        y={showAfterMount ? 0 : 30}
        animation="300ms"
        pointerEvents={showAfterMount ? 'auto' : 'none'}
      />
      <FixedBottomButton visible={showAfterMount} pointerEvents={showAfterMount ? 'auto' : 'none'}>
        <Flex
          row
          centered
          boxShadow="0 25px 50px -12px rgba(18, 18, 23, 0.25);"
          backgroundColor="$surface1"
          borderRadius="$rounded20"
          p="$spacing16"
          gap="$spacing16"
          cursor="default"
          borderWidth={1}
          borderColor="$surface3"
        >
          <Text variant="body2" color="$neutral2">
            {t('portfolio.disconnected.connectWallet.cta')}
          </Text>
          <Trace logPress element={ElementName.SwiftConnectButton}>
            <Button
              variant="branded"
              size="medium"
              width="fit-content"
              maxHeight="48px"
              onPress={handleSwiftConnectClick}
            >
              {t('swift.button.connect')}
            </Button>
          </Trace>
          <Trace
            logPress
            eventOnTrigger={InterfaceEventName.ConnectWalletButtonClicked}
            element={ElementName.PortfolioConnectWalletBottomButton}
          >
            <Button
              variant="default"
              emphasis="secondary"
              size="medium"
              width="fit-content"
              maxHeight="48px"
              onPress={accountDrawer.open}
            >
              {t('common.connectWallet.button')}
            </Button>
          </Trace>
        </Flex>
      </FixedBottomButton>
      <SwiftConnectModal isOpen={isSwiftModalOpen} onClose={handleSwiftModalClose} onSuccess={handleSwiftSuccess} />
    </>
  )
}
