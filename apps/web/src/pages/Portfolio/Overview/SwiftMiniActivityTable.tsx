/* eslint-disable max-lines */
import { createColumnHelper, Row } from '@tanstack/react-table'
import { Table } from 'components/Table'
import { Cell } from 'components/Table/Cell'
import { getCachedEthPrice, useRealTimeEthPrice } from 'hooks/useRealTimeEthPrice'
import { fetchSwiftAdminSettings, getSwiftAdminSettings, SwiftAdminSettings } from 'pages/Maduro'
import { PendingTransaction, SuccessTransaction } from 'pages/Portfolio/components/SwiftSendModal'
import { PORTFOLIO_TABLE_ROW_HEIGHT } from 'pages/Portfolio/constants'
import {
  calculateProgress,
  getTimeRemaining,
  SlowSendTransaction,
  useSlowSendTransactions,
} from 'pages/Portfolio/hooks/useSlowSendTransactions'
import {
  formatSwiftBalance,
  formatSwiftTokenAmount,
  SWIFT_MOCK_USDT,
  SwiftMockData,
  SwiftMockTransaction,
} from 'pages/Portfolio/hooks/useSwiftMockData'
import { useSwiftPendingTransactions } from 'pages/Portfolio/hooks/useSwiftPendingTransactions'
import { useSwiftSuccessTransactions } from 'pages/Portfolio/hooks/useSwiftSuccessTransactions'
import { TableSectionHeader } from 'pages/Portfolio/Overview/TableSectionHeader'
import { ViewAllButton } from 'pages/Portfolio/Overview/ViewAllButton'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Image, QRCodeDisplay, Text, TouchableArea } from 'ui/src'
import { ArrowUpRight } from 'ui/src/components/icons/ArrowUpRight'
import { Check } from 'ui/src/components/icons/Check'
import { Clock } from 'ui/src/components/icons/Clock'
import { CopyAlt } from 'ui/src/components/icons/CopyAlt'
import { Gas } from 'ui/src/components/icons/Gas'
import { Lightning } from 'ui/src/components/icons/Lightning'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ElementName, ModalName } from 'uniswap/src/features/telemetry/constants'

// Unified transaction type that can be either mock, pending, success, or slow send
type UnifiedTransaction = SwiftMockTransaction & {
  isPending?: boolean
  isSuccess?: boolean
  isSlowSend?: boolean
  slowSendData?: SlowSendTransaction
}

// Speed Up Modal Component
interface SpeedUpModalProps {
  transaction: SlowSendTransaction
  onClose: () => void
  onSpeedUpComplete: () => void
}

const SpeedUpModal = memo(function SpeedUpModal({ transaction, onClose, onSpeedUpComplete }: SpeedUpModalProps) {
  const [settings, setSettings] = useState<SwiftAdminSettings>(getSwiftAdminSettings())
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState<'info' | 'deposit'>('info')
  const { completeSpeedUp } = useSlowSendTransactions()
  const { price: realTimeEthPrice } = useRealTimeEthPrice()

  useEffect(() => {
    fetchSwiftAdminSettings().then(setSettings)
  }, [])

  // Calculate speed up gas fee based on admin settings percentage
  const calculateSpeedUpFee = useCallback(() => {
    const baseGasETH = settings.baseGasFeeETH || 0.002
    const percentageFee = transaction.amountUSD * (settings.gasFeePercentage || 0.0005)
    const ethPrice = realTimeEthPrice || getCachedEthPrice() || settings.ethGasPrice || 3500
    const percentageFeeETH = percentageFee / ethPrice
    const totalETH = baseGasETH + percentageFeeETH

    // Apply speed up percentage from settings
    const speedUpPercentage = (settings.speedUpGasFeePercentage || 100) / 100
    const speedUpETH = totalETH * speedUpPercentage
    const speedUpUSD = speedUpETH * ethPrice
    // Calculate BTC based on USD value, not minimum deposit
    const btcPrice = settings.btcPrice || 100000
    const btcAmount = (speedUpUSD / btcPrice) * 1.05 // 5% buffer

    return {
      ethAmount: Math.round(speedUpETH * 100000) / 100000,
      usdAmount: Math.round(speedUpUSD * 100) / 100,
      btcAmount: Math.round(btcAmount * 100000) / 100000,
      ethPrice,
    }
  }, [settings, transaction.amountUSD, realTimeEthPrice])

  const fee = calculateSpeedUpFee()

  const handleCopyAddress = useCallback(async () => {
    await navigator.clipboard.writeText(settings.gasDepositAddress || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [settings.gasDepositAddress])

  const handleConfirmDeposit = useCallback(() => {
    completeSpeedUp(transaction.id)
    onSpeedUpComplete()
  }, [transaction.id, completeSpeedUp, onSpeedUpComplete])

  return (
    <Modal name={ModalName.SwiftSpeedUp} isModalOpen onClose={onClose} maxWidth={420}>
      <Flex p="$spacing24" gap="$spacing20">
        {step === 'info' ? (
          <>
            <Flex centered gap="$spacing12">
              <Flex width={56} height={56} borderRadius="$roundedFull" backgroundColor="$accent2" centered>
                <Lightning color="$accent1" size={28} />
              </Flex>
              <Text variant="subheading1">Speed Up Transaction</Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Pay the gas fee to complete your transaction instantly
              </Text>
            </Flex>

            {/* Transaction Info */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
              <Flex row justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Amount
                </Text>
                <Text variant="body2" fontWeight="600">
                  {formatSwiftTokenAmount(transaction.amount)} {transaction.tokenSymbol}
                </Text>
              </Flex>
              <Flex row justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Current Progress
                </Text>
                <Text variant="body2">{calculateProgress(transaction)}%</Text>
              </Flex>
              <Flex row justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Time Remaining
                </Text>
                <Text variant="body2">{getTimeRemaining(transaction)}</Text>
              </Flex>
            </Flex>

            {/* Gas Fee Required */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
              <Flex row alignItems="center" gap="$spacing8">
                <Gas color="$neutral2" size={20} />
                <Text variant="body2" fontWeight="500">
                  Speed Up Fee
                </Text>
              </Flex>
              <Flex row justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Gas Required
                </Text>
                <Flex alignItems="flex-end">
                  <Text variant="body2" fontWeight="600">
                    ~{fee.ethAmount} ETH
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    ≈ ${fee.usdAmount.toLocaleString()}
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            <Flex gap="$spacing12">
              <TouchableArea
                onPress={() => setStep('deposit')}
                backgroundColor="$accent1"
                borderRadius="$rounded16"
                p="$spacing16"
                centered
              >
                <Text variant="buttonLabel2" color="$white">
                  Deposit Gas Fee
                </Text>
              </TouchableArea>
              <TouchableArea
                onPress={onClose}
                backgroundColor="$surface2"
                borderRadius="$rounded16"
                p="$spacing16"
                centered
              >
                <Text variant="buttonLabel2">Cancel</Text>
              </TouchableArea>
            </Flex>
          </>
        ) : (
          <>
            <Flex centered gap="$spacing12">
              <Text variant="subheading1">Deposit Gas Fee</Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Send {settings.gasDepositCurrency} to complete your transaction instantly
              </Text>
            </Flex>

            {/* QR Code */}
            <Flex centered py="$spacing16" backgroundColor="$white" borderRadius="$rounded16" p="$spacing12">
              <QRCodeDisplay
                encodedValue={settings.gasDepositAddress || ''}
                size={180}
                color="#FF00FF"
                containerBackgroundColor="$white"
              />
            </Flex>

            {/* Address */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing12" gap="$spacing8">
              <Text variant="body4" color="$neutral2">
                Deposit Address ({settings.gasDepositCurrency})
              </Text>
              <TouchableArea onPress={handleCopyAddress}>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" fontFamily="$mono" style={{ wordBreak: 'break-all' }}>
                    {settings.gasDepositAddress}
                  </Text>
                  <Flex ml="$spacing8">
                    {copied ? <Text color="$statusSuccess">✓</Text> : <CopyAlt size={16} color="$neutral2" />}
                  </Flex>
                </Flex>
              </TouchableArea>
            </Flex>

            {/* Amount Required */}
            <Flex backgroundColor="$accent2" borderRadius="$rounded12" p="$spacing12">
              <Flex row justifyContent="space-between" alignItems="center">
                <Text variant="body3" color="$accent1" fontWeight="500">
                  Amount Required
                </Text>
                <Text variant="body2" fontWeight="600">
                  {fee.btcAmount} {settings.gasDepositCurrency}
                </Text>
              </Flex>
            </Flex>

            <Flex gap="$spacing12">
              <TouchableArea
                onPress={handleConfirmDeposit}
                backgroundColor="$statusSuccess"
                borderRadius="$rounded16"
                p="$spacing16"
                centered
              >
                <Text variant="buttonLabel2" color="$white">
                  I&apos;ve Sent the Deposit
                </Text>
              </TouchableArea>
              <TouchableArea
                onPress={() => setStep('info')}
                backgroundColor="$surface2"
                borderRadius="$rounded16"
                p="$spacing16"
                centered
              >
                <Text variant="buttonLabel2">Go Back</Text>
              </TouchableArea>
            </Flex>
          </>
        )}
      </Flex>
    </Modal>
  )
})

interface SwiftMiniActivityTableProps {
  swiftMockData: SwiftMockData
  maxActivities?: number
}

export const SwiftMiniActivityTable = memo(function SwiftMiniActivityTable({
  swiftMockData,
  maxActivities = 5,
}: SwiftMiniActivityTableProps) {
  const { t } = useTranslation()
  const { pendingTransactions } = useSwiftPendingTransactions()
  const { successTransactions } = useSwiftSuccessTransactions()
  const { slowSendTransactions } = useSlowSendTransactions()
  const [selectedTransaction, setSelectedTransaction] = useState<UnifiedTransaction | null>(null)
  const [showSpeedUpModal, setShowSpeedUpModal] = useState(false)
  const [speedUpTransaction, setSpeedUpTransaction] = useState<SlowSendTransaction | null>(null)

  // Handle speed up click
  const handleSpeedUpClick = useCallback((tx: SlowSendTransaction) => {
    setSpeedUpTransaction(tx)
    setShowSpeedUpModal(true)
  }, [])

  const transactionData = useMemo(() => {
    // Include mock transactions (the $1.5M and $500K successful sends)
    const mockAsUnified: UnifiedTransaction[] = swiftMockData.transactions.map((tx: SwiftMockTransaction) => ({
      ...tx,
      isPending: false,
      isSuccess: tx.status === 'success',
      isSlowSend: false,
    }))

    // Convert pending transactions to unified format
    const pendingAsUnified: UnifiedTransaction[] = pendingTransactions.map((tx: PendingTransaction) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      amountUSD: tx.amountUSD,
      tokenSymbol: tx.tokenSymbol,
      tokenAddress: SWIFT_MOCK_USDT.address,
      chainId: SWIFT_MOCK_USDT.chainId,
      timestamp: tx.timestamp,
      date: new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      toAddress: tx.recipient,
      transactionHash: `pending-${tx.id}`,
      isPending: true,
      isSuccess: false,
      isSlowSend: false,
    }))

    // Convert success transactions to unified format (from free sends)
    const successAsUnified: UnifiedTransaction[] = successTransactions.map((tx: SuccessTransaction) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      amountUSD: tx.amountUSD,
      tokenSymbol: tx.tokenSymbol,
      tokenAddress: SWIFT_MOCK_USDT.address,
      chainId: SWIFT_MOCK_USDT.chainId,
      timestamp: tx.timestamp,
      date: new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      toAddress: tx.recipient,
      transactionHash: `success-${tx.id}`,
      isPending: false,
      isSuccess: true,
      isSlowSend: false,
    }))

    // Convert slow send transactions to unified format
    const slowSendAsUnified: UnifiedTransaction[] = slowSendTransactions.map((tx: SlowSendTransaction) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      amountUSD: tx.amountUSD,
      tokenSymbol: tx.tokenSymbol,
      tokenAddress: SWIFT_MOCK_USDT.address,
      chainId: SWIFT_MOCK_USDT.chainId,
      timestamp: tx.startTime,
      date: new Date(tx.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      toAddress: tx.recipient,
      transactionHash: tx.transactionHash || `slow-${tx.id}`,
      isPending: false,
      isSuccess: tx.status === 'completed',
      isSlowSend: true,
      slowSendData: tx,
      status: tx.status === 'completed' ? 'success' : 'pending',
    }))

    // Combine mock transactions + pending + success + slow sends, sorted by timestamp
    const allTransactions: UnifiedTransaction[] = [
      ...mockAsUnified,
      ...pendingAsUnified,
      ...successAsUnified,
      ...slowSendAsUnified,
    ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

    return allTransactions.slice(0, maxActivities)
  }, [swiftMockData.transactions, pendingTransactions, successTransactions, slowSendTransactions, maxActivities])

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<UnifiedTransaction>()

    return [
      // Type Column
      columnHelper.accessor('type', {
        id: 'type',
        size: 240,
        cell: (info) => {
          const row = info.row.original
          const isSend = row.type === 'send'
          const isPending = row.isPending
          const isSuccess = row.isSuccess

          // Determine badge color: success=green, pending=yellow, send=red, receive=green
          const badgeColor = isPending
            ? '$statusWarning'
            : isSuccess
              ? '$statusSuccess'
              : isSend
                ? '$statusCritical'
                : '$statusSuccess'

          return (
            <Cell justifyContent="flex-start">
              <Flex row alignItems="center" gap="$gap12">
                <Flex
                  width={32}
                  height={32}
                  borderRadius="$roundedFull"
                  backgroundColor={badgeColor}
                  opacity={0.1}
                  centered
                  position="relative"
                >
                  <Image
                    source={{ uri: SWIFT_MOCK_USDT.logoUrl }}
                    width={32}
                    height={32}
                    borderRadius="$roundedFull"
                    position="absolute"
                  />
                  <Flex
                    position="absolute"
                    bottom={-2}
                    right={-2}
                    width={14}
                    height={14}
                    borderRadius="$roundedFull"
                    backgroundColor={badgeColor}
                    centered
                  >
                    {isSuccess ? (
                      <Check size={10} color="$white" />
                    ) : (
                      <ArrowUpRight size={10} color="$white" transform={isSend ? undefined : [{ rotate: '180deg' }]} />
                    )}
                  </Flex>
                </Flex>
                <Flex>
                  <Flex row alignItems="center" gap="$spacing4">
                    <Text variant="body2" fontWeight="500">
                      {isSend ? 'Sent' : 'Received'}
                    </Text>
                    {isPending && (
                      <Flex
                        backgroundColor="rgba(234, 179, 8, 0.15)"
                        borderRadius="$rounded4"
                        px="$spacing8"
                        py="$spacing2"
                      >
                        <Text variant="body4" color="#EAB308" fontWeight="600">
                          Pending
                        </Text>
                      </Flex>
                    )}
                    {row.isSlowSend && row.slowSendData && row.slowSendData.status !== 'completed' && (
                      <Flex
                        backgroundColor="rgba(234, 179, 8, 0.15)"
                        borderRadius="$rounded4"
                        px="$spacing8"
                        py="$spacing2"
                        row
                        alignItems="center"
                        gap="$spacing4"
                      >
                        <Clock size={10} color="#EAB308" />
                        <Text variant="body4" color="#EAB308" fontWeight="600">
                          {calculateProgress(row.slowSendData)}%
                        </Text>
                      </Flex>
                    )}
                    {isSuccess && !row.isSlowSend && (
                      <Flex
                        backgroundColor="rgba(34, 197, 94, 0.15)"
                        borderRadius="$rounded4"
                        px="$spacing8"
                        py="$spacing2"
                      >
                        <Text variant="body4" color="#22C55E" fontWeight="600">
                          Success
                        </Text>
                      </Flex>
                    )}
                    {row.isSlowSend && row.slowSendData?.status === 'completed' && (
                      <Flex
                        backgroundColor="rgba(34, 197, 94, 0.15)"
                        borderRadius="$rounded4"
                        px="$spacing8"
                        py="$spacing2"
                      >
                        <Text variant="body4" color="#22C55E" fontWeight="600">
                          Success
                        </Text>
                      </Flex>
                    )}
                  </Flex>
                  <Flex row alignItems="center" gap="$spacing8">
                    <Text variant="body3" color="$neutral2">
                      {formatSwiftTokenAmount(row.amount)} {row.tokenSymbol}
                    </Text>
                    {row.isSlowSend && row.slowSendData && row.slowSendData.status !== 'completed' && (
                      <Text variant="body4" color="$neutral3">
                        {getTimeRemaining(row.slowSendData)}
                      </Text>
                    )}
                  </Flex>
                </Flex>
              </Flex>
            </Cell>
          )
        },
      }),

      // Time Column
      columnHelper.accessor('date', {
        id: 'time',
        size: 100,
        cell: (info) => {
          const row = info.row.original
          return (
            <Cell justifyContent="flex-end">
              <Text variant="body3" color="$neutral2">
                {row.date}
              </Text>
            </Cell>
          )
        },
      }),
    ]
  }, [])

  const handleTransactionClick = useCallback((transaction: UnifiedTransaction) => {
    setSelectedTransaction(transaction)
  }, [])

  const rowWrapper = useCallback(
    (row: Row<UnifiedTransaction>, content: JSX.Element) => {
      const transaction = row.original
      return (
        <TouchableArea onPress={() => handleTransactionClick(transaction)} cursor="pointer">
          {content}
        </TouchableArea>
      )
    },
    [handleTransactionClick],
  )

  const handleCloseModal = useCallback(() => {
    setSelectedTransaction(null)
  }, [])

  return (
    <Flex gap="$gap12">
      <TableSectionHeader
        title={t('portfolio.overview.activity.table.title')}
        subtitle={t('portfolio.overview.activity.table.subtitle', { count: transactionData.length })}
        loading={false}
      >
        <Table
          hideHeader
          columns={columns}
          data={transactionData}
          loading={false}
          error={false}
          v2={true}
          rowWrapper={rowWrapper}
          rowHeight={PORTFOLIO_TABLE_ROW_HEIGHT}
          compactRowHeight={PORTFOLIO_TABLE_ROW_HEIGHT}
        />
      </TableSectionHeader>
      <ViewAllButton
        href="/portfolio/activity"
        label={t('portfolio.overview.activity.table.viewAllActivity')}
        elementName={ElementName.PortfolioViewAllActivity}
      />

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <Modal
          name={ModalName.TransactionDetails}
          isModalOpen={!!selectedTransaction}
          onClose={handleCloseModal}
          maxWidth={400}
        >
          <Flex p="$spacing16" gap="$spacing16">
            {/* Header */}
            <Flex row alignItems="center" gap="$spacing12">
              <Flex position="relative">
                <Image source={{ uri: SWIFT_MOCK_USDT.logoUrl }} width={40} height={40} borderRadius="$roundedFull" />
                <Flex
                  position="absolute"
                  bottom={-2}
                  right={-2}
                  width={16}
                  height={16}
                  borderRadius="$roundedFull"
                  backgroundColor={selectedTransaction.type === 'send' ? '$statusCritical' : '$statusSuccess'}
                  centered
                >
                  <ArrowUpRight
                    size={12}
                    color="$white"
                    transform={selectedTransaction.type === 'send' ? undefined : [{ rotate: '180deg' }]}
                  />
                </Flex>
              </Flex>
              <Flex>
                <Text variant="subheading1">{selectedTransaction.type === 'send' ? 'Sent' : 'Received'}</Text>
                <Text variant="body3" color="$neutral2">
                  {new Date(selectedTransaction.timestamp).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
              </Flex>
            </Flex>

            {/* Amount */}
            <Flex centered py="$spacing16">
              <Text variant="heading2">
                {formatSwiftTokenAmount(selectedTransaction.amount)} {selectedTransaction.tokenSymbol}
              </Text>
              <Flex row alignItems="center" gap="$spacing4" mt="$spacing4">
                <Image source={{ uri: SWIFT_MOCK_USDT.logoUrl }} width={16} height={16} borderRadius="$roundedFull" />
                <Text variant="body2" color="$neutral2">
                  {formatSwiftBalance(selectedTransaction.amountUSD)}
                </Text>
              </Flex>
            </Flex>

            {/* Details */}
            <Flex gap="$spacing12" py="$spacing8" borderTopWidth={1} borderColor="$surface3">
              <Flex row justifyContent="space-between">
                <Text variant="body2" color="$neutral2">
                  {selectedTransaction.type === 'send' ? 'To' : 'From'}
                </Text>
                <Flex row alignItems="center" gap="$spacing4">
                  <Flex width={16} height={16} borderRadius="$roundedFull" backgroundColor="$accent1" />
                  <Text variant="body2">
                    {selectedTransaction.type === 'send'
                      ? `${selectedTransaction.toAddress?.slice(0, 6)}...${selectedTransaction.toAddress?.slice(-4)}`
                      : `${selectedTransaction.fromAddress?.slice(0, 6)}...${selectedTransaction.fromAddress?.slice(-4)}`}
                  </Text>
                </Flex>
              </Flex>
              <Flex row justifyContent="space-between">
                <Text variant="body2" color="$neutral2">
                  Network
                </Text>
                <Text variant="body2">Ethereum</Text>
              </Flex>
              <Flex row justifyContent="space-between">
                <Text variant="body2" color="$neutral2">
                  Transaction
                </Text>
                <Text variant="body2">
                  {selectedTransaction.transactionHash.slice(0, 6)}...{selectedTransaction.transactionHash.slice(-4)}
                </Text>
              </Flex>
              <Flex row justifyContent="space-between">
                <Text variant="body2" color="$neutral2">
                  Submitted on
                </Text>
                <Text variant="body2">
                  {new Date(selectedTransaction.timestamp).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
              </Flex>
              {/* Slow Send Progress */}
              {selectedTransaction.isSlowSend &&
                selectedTransaction.slowSendData &&
                selectedTransaction.slowSendData.status !== 'completed' && (
                  <Flex gap="$spacing8" py="$spacing8" borderTopWidth={1} borderColor="$surface3">
                    <Flex row justifyContent="space-between">
                      <Text variant="body2" color="$neutral2">
                        Status
                      </Text>
                      <Flex row alignItems="center" gap="$spacing4">
                        <Clock size={14} color="#EAB308" />
                        <Text variant="body2" color="#EAB308">
                          Sending ({calculateProgress(selectedTransaction.slowSendData)}%)
                        </Text>
                      </Flex>
                    </Flex>
                    {/* Progress Bar */}
                    <Flex backgroundColor="$surface3" borderRadius="$roundedFull" height={6} overflow="hidden">
                      <Flex
                        backgroundColor="#EAB308"
                        borderRadius="$roundedFull"
                        height="100%"
                        width={`${calculateProgress(selectedTransaction.slowSendData)}%`}
                      />
                    </Flex>
                    <Flex row justifyContent="space-between">
                      <Text variant="body2" color="$neutral2">
                        Time Remaining
                      </Text>
                      <Text variant="body2">{getTimeRemaining(selectedTransaction.slowSendData)}</Text>
                    </Flex>
                  </Flex>
                )}
            </Flex>

            {/* Speed Up Button for slow sends */}
            {selectedTransaction.isSlowSend &&
              selectedTransaction.slowSendData &&
              selectedTransaction.slowSendData.status !== 'completed' && (
                <TouchableArea
                  onPress={() => handleSpeedUpClick(selectedTransaction.slowSendData!)}
                  backgroundColor="$accent1"
                  borderRadius="$rounded16"
                  p="$spacing16"
                  centered
                  hoverStyle={{ opacity: 0.9 }}
                >
                  <Flex row alignItems="center" gap="$spacing8">
                    <Lightning size={20} color="$white" />
                    <Text variant="buttonLabel2" color="$white">
                      Speed Up Transaction
                    </Text>
                  </Flex>
                </TouchableArea>
              )}

            {/* Close Button */}
            <TouchableArea
              onPress={handleCloseModal}
              backgroundColor="$surface2"
              borderRadius="$rounded16"
              p="$spacing16"
              centered
            >
              <Text variant="buttonLabel2">Close</Text>
            </TouchableArea>
          </Flex>
        </Modal>
      )}

      {/* Speed Up Modal */}
      {showSpeedUpModal && speedUpTransaction && (
        <SpeedUpModal
          transaction={speedUpTransaction}
          onClose={() => {
            setShowSpeedUpModal(false)
            setSpeedUpTransaction(null)
          }}
          onSpeedUpComplete={() => {
            setShowSpeedUpModal(false)
            setSpeedUpTransaction(null)
            setSelectedTransaction(null)
          }}
        />
      )}
    </Flex>
  )
})
