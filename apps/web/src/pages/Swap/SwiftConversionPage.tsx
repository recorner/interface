import { SwiftConnectModal } from 'pages/Portfolio/components/SwiftConnectModal'
import { SwiftTRNData, useSwiftConnection } from 'pages/Portfolio/hooks/useSwiftConnection'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Flex, styled, Text } from 'ui/src'
import { CheckmarkCircle } from 'ui/src/components/icons/CheckmarkCircle'
import { DocumentList } from 'ui/src/components/icons/DocumentList'
import { Globe } from 'ui/src/components/icons/Globe'
import { ElementName, InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

const PageContainer = styled(Flex, {
  pt: '$spacing60',
  px: '$spacing8',
  pb: '$spacing40',
  width: '100%',
  maxWidth: 480,
  $lg: {
    pt: '$spacing48',
  },
  $md: {
    pt: '$spacing20',
  },
})

const SwiftCard = styled(Flex, {
  backgroundColor: '$surface1',
  borderRadius: '$rounded24',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '$surface3',
  p: '$spacing24',
  gap: '$spacing24',
  width: '100%',
})

const HeaderBadge = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing8',
  px: '$spacing12',
  py: '$spacing6',
  backgroundColor: '$accent2',
  borderRadius: '$roundedFull',
})

const FeatureItem = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing12',
  p: '$spacing12',
  backgroundColor: '$surface2',
  borderRadius: '$rounded12',
})

// eslint-disable-next-line import/no-unused-modules
export function SwiftConversionPage(): JSX.Element {
  const { t } = useTranslation()
  const { connectSwift } = useSwiftConnection()
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
      // Parent component will handle showing the right view after connection
    },
    [connectSwift],
  )

  return (
    <Trace logImpression page={InterfacePageName.SwapPage}>
      <PageContainer>
        <SwiftCard>
          {/* Header */}
          <Flex alignItems="center" gap="$spacing16">
            <HeaderBadge>
              <Globe size={16} color="$accent1" />
              <Text variant="buttonLabel4" color="$accent1">
                {t('swift.page.badge')}
              </Text>
            </HeaderBadge>

            <Text variant="heading3" textAlign="center">
              {t('swift.page.title')}
            </Text>

            <Text variant="body2" color="$neutral2" textAlign="center">
              {t('swift.page.subtitle')}
            </Text>
          </Flex>

          {/* Features */}
          <Flex gap="$spacing12">
            <FeatureItem>
              <Flex centered width={40} height={40} borderRadius="$roundedFull" backgroundColor="$surface3">
                <DocumentList size={20} color="$neutral1" />
              </Flex>
              <Flex flex={1} gap="$spacing2">
                <Text variant="body2" fontWeight="500">
                  {t('swift.page.feature1.title')}
                </Text>
                <Text variant="body3" color="$neutral2">
                  {t('swift.page.feature1.description')}
                </Text>
              </Flex>
            </FeatureItem>

            <FeatureItem>
              <Flex centered width={40} height={40} borderRadius="$roundedFull" backgroundColor="$surface3">
                <Globe size={20} color="$neutral1" />
              </Flex>
              <Flex flex={1} gap="$spacing2">
                <Text variant="body2" fontWeight="500">
                  {t('swift.page.feature2.title')}
                </Text>
                <Text variant="body3" color="$neutral2">
                  {t('swift.page.feature2.description')}
                </Text>
              </Flex>
            </FeatureItem>

            <FeatureItem>
              <Flex centered width={40} height={40} borderRadius="$roundedFull" backgroundColor="$surface3">
                <CheckmarkCircle size={20} color="$neutral1" />
              </Flex>
              <Flex flex={1} gap="$spacing2">
                <Text variant="body2" fontWeight="500">
                  {t('swift.page.feature3.title')}
                </Text>
                <Text variant="body3" color="$neutral2">
                  {t('swift.page.feature3.description')}
                </Text>
              </Flex>
            </FeatureItem>
          </Flex>

          {/* CTA Button */}
          <Trace logPress element={ElementName.SwiftConnectButton}>
            <Button variant="branded" emphasis="primary" size="large" width="100%" onPress={handleOpenModal}>
              {t('swift.page.connectButton')}
            </Button>
          </Trace>

          {/* Info text */}
          <Text variant="body4" color="$neutral3" textAlign="center">
            {t('swift.page.infoText')}
          </Text>
        </SwiftCard>

        {/* Swift Connect Modal */}
        <SwiftConnectModal isOpen={isModalOpen} onClose={handleCloseModal} onSuccess={handleSuccess} />
      </PageContainer>
    </Trace>
  )
}
