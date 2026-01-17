import { useAccountDrawer } from 'components/AccountDrawer/MiniPortfolio/hooks'
import { AnimatedStyledBanner } from 'pages/Portfolio/components/AnimatedStyledBanner/AnimatedStyledBanner'
import { SwiftConnectModal } from 'pages/Portfolio/components/SwiftConnectModal'
import { SwiftTRNData, useSwiftConnection } from 'pages/Portfolio/hooks/useSwiftConnection'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { ElementName, InterfaceEventName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

export function PortfolioConnectWalletBanner() {
  const { t } = useTranslation()
  const accountDrawer = useAccountDrawer()
  const { isSwiftConnected, connectSwift, disconnectSwift } = useSwiftConnection()
  const [isSwiftModalOpen, setIsSwiftModalOpen] = useState(false)

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

  // If Swift is connected, show wallet connect as primary
  if (isSwiftConnected) {
    return (
      <AnimatedStyledBanner>
        <Flex row alignItems="center" gap="$spacing8">
          <Text variant="body2" color="$neutral1">
            {t('common.connectAWallet.button')}{' '}
            <Text variant="body2" color="$neutral2">
              {t('portfolio.disconnected.viewYourPortfolio.cta')}
            </Text>
          </Text>
        </Flex>
        <Flex row centered gap="$spacing12">
          <Trace logPress element={ElementName.SwiftDisconnectButton}>
            <Button variant="default" emphasis="tertiary" size="small" onPress={disconnectSwift}>
              {t('swift.button.disconnect')}
            </Button>
          </Trace>
          <Trace
            logPress
            eventOnTrigger={InterfaceEventName.ConnectWalletButtonClicked}
            element={ElementName.PortfolioConnectWalletBannerButton}
          >
            <Button variant="branded" emphasis="primary" size="medium" width={164} onPress={accountDrawer.open}>
              {t('common.button.connect')}
            </Button>
          </Trace>
        </Flex>
      </AnimatedStyledBanner>
    )
  }

  // Swift not connected - show Connect Swift as primary CTA
  return (
    <>
      <AnimatedStyledBanner>
        <Text variant="body2" color="$neutral1">
          {t('swift.upload.title')}{' '}
          <Text variant="body2" color="$neutral2">
            {t('portfolio.disconnected.viewYourPortfolio.cta')}
          </Text>
        </Text>
        <Flex row centered gap="$spacing12">
          <Trace logPress element={ElementName.SwiftConnectButton}>
            <Button variant="branded" emphasis="primary" size="medium" width={164} onPress={handleSwiftConnectClick}>
              {t('swift.button.connect')}
            </Button>
          </Trace>
          <Trace
            logPress
            eventOnTrigger={InterfaceEventName.ConnectWalletButtonClicked}
            element={ElementName.PortfolioConnectWalletBannerButton}
          >
            <Button variant="default" emphasis="secondary" size="medium" onPress={accountDrawer.open}>
              {t('common.button.connect')}
            </Button>
          </Trace>
        </Flex>
      </AnimatedStyledBanner>
      <SwiftConnectModal isOpen={isSwiftModalOpen} onClose={handleSwiftModalClose} onSuccess={handleSwiftSuccess} />
    </>
  )
}
