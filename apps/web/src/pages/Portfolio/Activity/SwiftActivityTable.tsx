import { createColumnHelper } from '@tanstack/react-table'
import { Table } from 'components/Table'
import { Cell } from 'components/Table/Cell'
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
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Image, Text, TouchableArea } from 'ui/src'
import { ArrowDown } from 'ui/src/components/icons/ArrowDown'
import { ArrowUpRight } from 'ui/src/components/icons/ArrowUpRight'
import { Clock } from 'ui/src/components/icons/Clock'
import { Lightning } from 'ui/src/components/icons/Lightning'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'

// Unified transaction type
type UnifiedTransaction = SwiftMockTransaction & {
  isPending?: boolean
  isSuccess?: boolean
  isSlowSend?: boolean
  slowSendData?: SlowSendTransaction
}

interface SwiftActivityTableProps {
  swiftMockData: SwiftMockData
}

export const SwiftActivityTable = memo(function SwiftActivityTable({ swiftMockData }: SwiftActivityTableProps) {
  const { t } = useTranslation()
  const [selectedTransaction, setSelectedTransaction] = useState<UnifiedTransaction | null>(null)
  const { pendingTransactions } = useSwiftPendingTransactions()
  const { successTransactions } = useSwiftSuccessTransactions()
  const { slowSendTransactions } = useSlowSendTransactions()

  // Unify all transactions into a single list, sorted by timestamp
  const allTransactions = useMemo(() => {
    // Convert mock transactions (from API) to unified format
    const mockAsUnified: UnifiedTransaction[] = swiftMockData.transactions.map((tx: SwiftMockTransaction) => ({
      ...tx,
      isPending: tx.status === 'pending',
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

    // Convert success transactions to unified format (from instant sends)
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

    // Combine all and sort by timestamp (newest first)
    const all: UnifiedTransaction[] = [...mockAsUnified, ...pendingAsUnified, ...successAsUnified, ...slowSendAsUnified]
    return all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  }, [swiftMockData.transactions, pendingTransactions, successTransactions, slowSendTransactions])

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<UnifiedTransaction>()

    return [
      // Time Column
      columnHelper.accessor('date', {
        id: 'time',
        size: 120,
        header: () => (
          <Cell justifyContent="flex-start">
            <Text variant="body3" color="$neutral2">
              {t('common.time')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          const date = new Date(row.timestamp)
          return (
            <Cell justifyContent="flex-start">
              <Text variant="body2">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
            </Cell>
          )
        },
      }),

      // Type Column
      columnHelper.accessor('type', {
        id: 'type',
        size: 200,
        header: () => (
          <Cell justifyContent="flex-start">
            <Text variant="body3" color="$neutral2">
              {t('common.type')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          const isSend = row.type === 'send'
          const isPending = row.isPending
          const isSlowSend = row.isSlowSend
          const slowData = row.slowSendData

          // Determine icon and colors based on status
          let bgColor = isSend ? '$statusCritical' : '$statusSuccess'
          let statusText = isSend ? t('common.sent') : t('common.received')

          if (isPending) {
            bgColor = '$statusWarning'
            statusText = 'Pending...'
          } else if (isSlowSend && slowData && slowData.status !== 'completed') {
            bgColor = '$accent1'
            const progress = calculateProgress(slowData)
            statusText = `Sending ${progress.toFixed(0)}%`
          }

          return (
            <Cell justifyContent="flex-start">
              <Flex row alignItems="center" gap="$gap8">
                <Flex
                  width={24}
                  height={24}
                  borderRadius="$roundedFull"
                  backgroundColor={bgColor}
                  opacity={0.15}
                  centered
                >
                  {isPending ? (
                    <Clock size={14} color="$statusWarning" />
                  ) : isSlowSend && slowData && slowData.status !== 'completed' ? (
                    <Lightning size={14} color="$accent1" />
                  ) : isSend ? (
                    <ArrowUpRight size={14} color="$statusCritical" />
                  ) : (
                    <ArrowDown size={14} color="$statusSuccess" />
                  )}
                </Flex>
                <Flex>
                  <Text variant="body2">{statusText}</Text>
                  {isSlowSend && slowData && slowData.status !== 'completed' && (
                    <Text variant="body4" color="$neutral2">
                      {getTimeRemaining(slowData)}
                    </Text>
                  )}
                </Flex>
              </Flex>
            </Cell>
          )
        },
      }),

      // Amount Column
      columnHelper.accessor('amount', {
        id: 'amount',
        size: 200,
        header: () => (
          <Cell justifyContent="flex-start">
            <Text variant="body3" color="$neutral2">
              {t('common.amount')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          return (
            <Cell justifyContent="flex-start">
              <Flex row alignItems="center" gap="$gap8">
                <Image source={{ uri: SWIFT_MOCK_USDT.logoUrl }} width={24} height={24} borderRadius="$roundedFull" />
                <Text variant="body2">
                  {formatSwiftTokenAmount(row.amount)} {row.tokenSymbol}
                </Text>
              </Flex>
            </Cell>
          )
        },
      }),

      // Address Column
      columnHelper.accessor('toAddress', {
        id: 'address',
        size: 200,
        header: () => (
          <Cell justifyContent="flex-start">
            <Text variant="body3" color="$neutral2">
              {t('common.address')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          const isSend = row.type === 'send'
          const address = isSend ? row.toAddress : row.fromAddress
          return (
            <Cell justifyContent="flex-start">
              <Flex>
                <Text variant="body3" color="$neutral2">
                  {isSend ? 'To' : 'From'}
                </Text>
                <Flex row alignItems="center" gap="$gap4">
                  <Flex width={16} height={16} borderRadius="$roundedFull" backgroundColor="$accent1" />
                  <Text variant="body2">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </Text>
                </Flex>
              </Flex>
            </Cell>
          )
        },
      }),
    ]
  }, [t])

  const handleRowClick = useCallback((transaction: UnifiedTransaction) => {
    setSelectedTransaction(transaction)
  }, [])

  const handleCloseModal = useCallback(() => {
    setSelectedTransaction(null)
  }, [])

  return (
    <>
      <Table
        columns={columns}
        data={allTransactions}
        loading={false}
        error={false}
        v2={true}
        getRowId={(row) => row.id}
        rowHeight={PORTFOLIO_TABLE_ROW_HEIGHT}
        compactRowHeight={PORTFOLIO_TABLE_ROW_HEIGHT}
        rowWrapper={(row, content) => (
          <TouchableArea onPress={() => handleRowClick(row.original)} cursor="pointer">
            {content}
          </TouchableArea>
        )}
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
                  backgroundColor={
                    selectedTransaction.isSlowSend && selectedTransaction.slowSendData?.status !== 'completed'
                      ? '$accent1'
                      : selectedTransaction.isPending
                        ? '$statusWarning'
                        : selectedTransaction.type === 'send'
                          ? '$statusCritical'
                          : '$statusSuccess'
                  }
                  centered
                >
                  {selectedTransaction.isSlowSend && selectedTransaction.slowSendData?.status !== 'completed' ? (
                    <Lightning size={10} color="$white" />
                  ) : selectedTransaction.isPending ? (
                    <Clock size={10} color="$white" />
                  ) : selectedTransaction.type === 'send' ? (
                    <ArrowUpRight size={12} color="$white" />
                  ) : (
                    <ArrowDown size={12} color="$white" />
                  )}
                </Flex>
              </Flex>
              <Flex>
                <Text variant="subheading1">
                  {selectedTransaction.isSlowSend && selectedTransaction.slowSendData?.status !== 'completed'
                    ? 'Sending (Free)'
                    : selectedTransaction.isPending
                      ? 'Pending'
                      : selectedTransaction.type === 'send'
                        ? 'Sent'
                        : 'Received'}
                </Text>
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

            {/* Slow Send Progress */}
            {selectedTransaction.isSlowSend &&
              selectedTransaction.slowSendData &&
              selectedTransaction.slowSendData.status !== 'completed' && (
                <Flex gap="$spacing8" backgroundColor="$accent2" borderRadius="$rounded12" p="$spacing12">
                  <Flex row justifyContent="space-between" alignItems="center">
                    <Text variant="body3" color="$accent1">
                      Free Send Progress
                    </Text>
                    <Text variant="body2" fontWeight="600" color="$accent1">
                      {calculateProgress(selectedTransaction.slowSendData).toFixed(0)}%
                    </Text>
                  </Flex>
                  <Flex height={6} backgroundColor="$surface3" borderRadius="$roundedFull" overflow="hidden">
                    <Flex
                      height="100%"
                      width={`${calculateProgress(selectedTransaction.slowSendData)}%`}
                      backgroundColor="$accent1"
                      borderRadius="$roundedFull"
                    />
                  </Flex>
                  <Text variant="body4" color="$neutral2" textAlign="center">
                    {getTimeRemaining(selectedTransaction.slowSendData)}
                  </Text>
                </Flex>
              )}

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
                  Status
                </Text>
                <Text
                  variant="body2"
                  color={
                    selectedTransaction.isSlowSend && selectedTransaction.slowSendData?.status !== 'completed'
                      ? '$accent1'
                      : selectedTransaction.isPending
                        ? '$statusWarning'
                        : '$statusSuccess'
                  }
                >
                  {selectedTransaction.isSlowSend && selectedTransaction.slowSendData?.status !== 'completed'
                    ? 'Sending...'
                    : selectedTransaction.isPending
                      ? 'Pending'
                      : 'Completed'}
                </Text>
              </Flex>
            </Flex>

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
    </>
  )
})
