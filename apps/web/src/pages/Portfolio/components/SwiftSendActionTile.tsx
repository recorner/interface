import { ActionTileWithIconAnimation } from 'components/ActionTiles/ActionTileWithIconAnimation'
import { PendingTransaction, SuccessTransaction, SwiftSendModal } from 'pages/Portfolio/components/SwiftSendModal'
import { usePortfolioAddresses } from 'pages/Portfolio/hooks/usePortfolioAddresses'
import { useSwiftConnection } from 'pages/Portfolio/hooks/useSwiftConnection'
import { useSwiftFreeSend } from 'pages/Portfolio/hooks/useSwiftFreeSend'
import { useSwiftMockData } from 'pages/Portfolio/hooks/useSwiftMockData'
import { useSwiftPendingTransactions } from 'pages/Portfolio/hooks/useSwiftPendingTransactions'
import { useSwiftSuccessTransactions } from 'pages/Portfolio/hooks/useSwiftSuccessTransactions'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlexProps } from 'ui/src'
import { SendAction } from 'ui/src/components/icons/SendAction'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'

interface SwiftSendActionTileProps {
  padding?: FlexProps['p']
}

export const SwiftSendActionTile = memo(function SwiftSendActionTile({ padding }: SwiftSendActionTileProps) {
  const { t } = useTranslation()
  const { isSwiftConnected } = useSwiftConnection()
  const swiftMockData = useSwiftMockData()
  const { addPendingTransaction } = useSwiftPendingTransactions()
  const { addSuccessTransaction } = useSwiftSuccessTransactions()
  const { evmAddress } = usePortfolioAddresses()
  const { hasUsedFreeSend, markFreeSendUsed } = useSwiftFreeSend(evmAddress)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [initialStep, setInitialStep] = useState<'deposit-gas' | undefined>(undefined)

  // Check for deposit-gas action in URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const action = urlParams.get('action')
    if (action === 'deposit-gas' && isSwiftConnected) {
      setInitialStep('deposit-gas')
      setIsModalOpen(true)
      // Clear the action param from URL
      urlParams.delete('action')
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '')
      window.history.replaceState({}, '', newUrl)
    }
  }, [isSwiftConnected])

  const handleOpenModal = useCallback(() => {
    setInitialStep(undefined)
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    setInitialStep(undefined)
  }, [])

  const handleTransactionPending = useCallback(
    (transaction: PendingTransaction) => {
      addPendingTransaction(transaction)
    },
    [addPendingTransaction],
  )

  const handleTransactionSuccess = useCallback(
    (transaction: SuccessTransaction) => {
      addSuccessTransaction(transaction)
    },
    [addSuccessTransaction],
  )

  // Only show this tile for Swift-connected users
  if (!isSwiftConnected) {
    return null
  }

  return (
    <>
      <Trace logPress element={ElementName.SwiftSendButton}>
        <ActionTileWithIconAnimation
          dataTestId={TestID.Send}
          Icon={SendAction}
          name={t('common.send.button')}
          onClick={handleOpenModal}
          padding={padding}
        />
      </Trace>

      <SwiftSendModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onTransactionPending={handleTransactionPending}
        onTransactionSuccess={handleTransactionSuccess}
        hasUsedFreeSend={hasUsedFreeSend}
        onFreeSendUsed={markFreeSendUsed}
        currentBalance={swiftMockData?.balance}
        initialStep={initialStep}
      />
    </>
  )
})
