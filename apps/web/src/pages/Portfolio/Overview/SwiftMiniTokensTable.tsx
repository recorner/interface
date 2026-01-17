import { createColumnHelper } from '@tanstack/react-table'
import { Table } from 'components/Table'
import { Cell } from 'components/Table/Cell'
import { PORTFOLIO_TABLE_ROW_HEIGHT } from 'pages/Portfolio/constants'
import {
  formatSwiftBalance,
  formatSwiftTokenAmount,
  SWIFT_MOCK_USDT,
  SwiftMockData,
} from 'pages/Portfolio/hooks/useSwiftMockData'
import { TableSectionHeader } from 'pages/Portfolio/Overview/TableSectionHeader'
import { ViewAllButton } from 'pages/Portfolio/Overview/ViewAllButton'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Image, Text } from 'ui/src'
import { ElementName } from 'uniswap/src/features/telemetry/constants'

interface SwiftTokenRow {
  id: string
  symbol: string
  name: string
  logoUrl: string
  balance: string
  balanceUSD: number
  price: number
}

interface SwiftMiniTokensTableProps {
  swiftMockData: SwiftMockData
  maxTokens?: number
}

export const SwiftMiniTokensTable = memo(function SwiftMiniTokensTable({
  swiftMockData,
  maxTokens: _maxTokens,
}: SwiftMiniTokensTableProps) {
  const { t } = useTranslation()

  const tokenData: SwiftTokenRow[] = useMemo(() => {
    return [
      {
        id: 'swift-usdt',
        symbol: SWIFT_MOCK_USDT.symbol,
        name: SWIFT_MOCK_USDT.name,
        logoUrl: SWIFT_MOCK_USDT.logoUrl,
        balance: swiftMockData.balance.usdtQuantity,
        balanceUSD: swiftMockData.balance.usdtBalance,
        price: 1.0, // USDT is pegged to $1
      },
    ]
  }, [swiftMockData])

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<SwiftTokenRow>()

    return [
      // Token Column
      columnHelper.accessor('symbol', {
        id: 'token',
        size: 200,
        cell: (info) => {
          const row = info.row.original
          return (
            <Cell justifyContent="flex-start">
              <Flex row alignItems="center" gap="$gap12">
                <Image source={{ uri: row.logoUrl }} width={32} height={32} borderRadius="$roundedFull" />
                <Flex>
                  <Text variant="body2" fontWeight="500">
                    {row.symbol}
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    {row.name}
                  </Text>
                </Flex>
              </Flex>
            </Cell>
          )
        },
      }),

      // Price Column
      columnHelper.accessor('price', {
        id: 'price',
        size: 100,
        cell: (info) => {
          return (
            <Cell justifyContent="flex-end">
              <Text variant="body2" fontWeight="500">
                $1.00
              </Text>
            </Cell>
          )
        },
      }),

      // Balance Column
      columnHelper.accessor('balance', {
        id: 'balance',
        size: 150,
        cell: (info) => {
          const row = info.row.original
          return (
            <Cell justifyContent="flex-end">
              <Text variant="body2" fontWeight="500">
                {formatSwiftTokenAmount(row.balance)} {row.symbol}
              </Text>
            </Cell>
          )
        },
      }),

      // Value Column
      columnHelper.accessor('balanceUSD', {
        id: 'value',
        size: 150,
        cell: (info) => {
          const row = info.row.original
          return (
            <Cell justifyContent="flex-end">
              <Text variant="body2" fontWeight="500">
                {formatSwiftBalance(row.balanceUSD)}
              </Text>
            </Cell>
          )
        },
      }),
    ]
  }, [])

  return (
    <Flex grow gap="$gap12">
      <TableSectionHeader
        title={t('common.tokens')}
        subtitle={t('portfolio.tokens.balance.totalTokens', { count: 1 })}
        loading={false}
      >
        <Table
          columns={columns}
          data={tokenData}
          loading={false}
          error={false}
          v2={true}
          getRowId={(row) => row.id}
          rowHeight={PORTFOLIO_TABLE_ROW_HEIGHT}
          compactRowHeight={PORTFOLIO_TABLE_ROW_HEIGHT}
        />
      </TableSectionHeader>
      <ViewAllButton
        href="/portfolio/tokens"
        label={t('portfolio.overview.miniTokensTable.viewAllTokens')}
        elementName={ElementName.PortfolioViewAllTokens}
      />
    </Flex>
  )
})
