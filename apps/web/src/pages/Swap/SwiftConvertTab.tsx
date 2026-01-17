import { SwiftConnectModal } from 'pages/Portfolio/components/SwiftConnectModal'
import { SwiftTRNData, useSwiftConnection } from 'pages/Portfolio/hooks/useSwiftConnection'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, Flex, styled, Text } from 'ui/src'
import { CheckmarkCircle } from 'ui/src/components/icons/CheckmarkCircle'
import { DocumentList } from 'ui/src/components/icons/DocumentList'
import { Globe } from 'ui/src/components/icons/Globe'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

const ConvertCard = styled(Flex, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded20',
  p: '$spacing20',
  gap: '$spacing20',
  width: '100%',
  mt: '$spacing8',
})

const FeatureItem = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing12',
})

const ConnectedBadge = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing8',
  px: '$spacing12',
  py: '$spacing8',
  backgroundColor: '$statusSuccess2',
  borderRadius: '$rounded12',
})

export function SwiftConvertTab(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isSwiftConnected, swiftTRNData, connectSwift } = useSwiftConnection()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  const handleSuccess = useCallback(
    (trnData: SwiftTRNData) => {
      connectSwift(trnData)
      setIsModalOpen(false)
    },
    [connectSwift],
  )

  const handleViewPortfolio = useCallback(() => {
    navigate('/portfolio')
  }, [navigate])

  // If already connected, show success state with portfolio link
  if (isSwiftConnected && swiftTRNData) {
    return (
      <ConvertCard>
        <Flex alignItems="center" gap="$spacing16">
          <ConnectedBadge>
            <CheckmarkCircle size={20} color="$statusSuccess" />
            <Text variant="buttonLabel3" color="$statusSuccess">
              {t('swift.convert.connected')}
            </Text>
          </ConnectedBadge>

          <Text variant="subheading2" textAlign="center">
            {t('swift.convert.successTitle')}
          </Text>

          <Flex width="100%" p="$spacing16" backgroundColor="$surface3" borderRadius="$rounded12" gap="$spacing8">
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                {t('swift.convert.trnNumber')}
              </Text>
              <Text variant="body3" color="$neutral1">
                {swiftTRNData.trnNumber}
              </Text>
            </Flex>
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                {t('swift.convert.amount')}
              </Text>
              <Text variant="body2" color="$neutral1" fontWeight="600">
                ${swiftTRNData.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
              </Text>
            </Flex>
          </Flex>

          <Button variant="branded" emphasis="primary" size="large" width="100%" onPress={handleViewPortfolio}>
            {t('swift.convert.viewPortfolio')}
          </Button>
        </Flex>
      </ConvertCard>
    )
  }

  // Not connected - show connect prompt
  return (
    <>
      <ConvertCard>
        <Flex alignItems="center" gap="$spacing16">
          <Flex centered width={56} height={56} borderRadius="$roundedFull" backgroundColor="$accent2">
            <Globe size={28} color="$accent1" />
          </Flex>

          <Flex alignItems="center" gap="$spacing4">
            <Text variant="subheading2" textAlign="center">
              {t('swift.convert.title')}
            </Text>
            <Text variant="body3" color="$neutral2" textAlign="center">
              {t('swift.convert.description')}
            </Text>
          </Flex>
        </Flex>

        <Flex gap="$spacing12">
          <FeatureItem>
            <DocumentList size={20} color="$neutral2" />
            <Text variant="body3" color="$neutral2">
              {t('swift.convert.feature1')}
            </Text>
          </FeatureItem>
          <FeatureItem>
            <Globe size={20} color="$neutral2" />
            <Text variant="body3" color="$neutral2">
              {t('swift.convert.feature2')}
            </Text>
          </FeatureItem>
          <FeatureItem>
            <CheckmarkCircle size={20} color="$neutral2" />
            <Text variant="body3" color="$neutral2">
              {t('swift.convert.feature3')}
            </Text>
          </FeatureItem>
        </Flex>

        <Trace logPress element={ElementName.SwiftConnectButton}>
          <Button variant="branded" emphasis="primary" size="large" width="100%" onPress={handleOpenModal}>
            {t('swift.convert.connectButton')}
          </Button>
        </Trace>
      </ConvertCard>

      <SwiftConnectModal isOpen={isModalOpen} onClose={handleCloseModal} onSuccess={handleSuccess} />
    </>
  )
}
