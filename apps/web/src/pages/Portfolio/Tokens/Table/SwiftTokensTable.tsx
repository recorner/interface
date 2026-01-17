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
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Image, Text } from 'ui/src'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'

interface SwiftTokensTableProps {
  swiftMockData: SwiftMockData
}

interface SwiftTokenRow {
  id: string
  symbol: string
  name: string
  logoUrl: string
  chainId: number
  price: number
  change1d: number
  balance: string
  balanceUSD: number
}

export const SwiftTokensTable = memo(function SwiftTokensTable({ swiftMockData }: SwiftTokensTableProps) {
  const { t } = useTranslation()

  // Transform Swift mock data into table row format
  const tokenData: SwiftTokenRow[] = useMemo(() => {
    return [
      {
        id: 'swift-usdt',
        symbol: SWIFT_MOCK_USDT.symbol,
        name: SWIFT_MOCK_USDT.name,
        logoUrl: SWIFT_MOCK_USDT.logoUrl,
        chainId: SWIFT_MOCK_USDT.chainId,
        price: 1.0,
        change1d: 0.0,
        balance: swiftMockData.balance.usdtQuantity,
        balanceUSD: swiftMockData.balance.balanceUSD,
      },
    ]
  }, [swiftMockData.balance])

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<SwiftTokenRow>()

    return [
      // Token Column
      columnHelper.accessor('symbol', {
        id: 'token',
        size: 300,
        header: () => (
          <Cell justifyContent="flex-start">
            <Text variant="body3" color="$neutral2">
              {t('common.token')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          const chainInfo = getChainInfo(row.chainId)
          return (
            <Cell justifyContent="flex-start">
              <Flex row alignItems="center" gap="$gap12">
                <Flex position="relative">
                  <Image source={{ uri: row.logoUrl }} width={40} height={40} borderRadius="$roundedFull" />
                  <Flex
                    position="absolute"
                    bottom={-2}
                    right={-2}
                    width={16}
                    height={16}
                    borderRadius="$roundedFull"
                    backgroundColor="$surface1"
                    centered
                  >
                    <Image source={chainInfo.logo} width={14} height={14} borderRadius="$roundedFull" />
                  </Flex>
                </Flex>
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
        size: 120,
        header: () => (
          <Cell justifyContent="flex-end">
            <Text variant="body3" color="$neutral2">
              {t('common.price')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          return (
            <Cell justifyContent="flex-end">
              <Text variant="body2">${row.price.toFixed(2)}</Text>
            </Cell>
          )
        },
      }),

      // 1D Change Column
      columnHelper.accessor('change1d', {
        id: 'change1d',
        size: 100,
        header: () => (
          <Cell justifyContent="flex-end">
            <Text variant="body3" color="$neutral2">
              {t('common.oneDay')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          const isPositive = row.change1d >= 0
          return (
            <Cell justifyContent="flex-end">
              <Text variant="body2" color={isPositive ? '$statusSuccess' : '$statusCritical'}>
                {isPositive ? '▲' : '▼'} {Math.abs(row.change1d).toFixed(2)}%
              </Text>
            </Cell>
          )
        },
      }),

      // Balance Column
      columnHelper.accessor('balance', {
        id: 'balance',
        size: 200,
        header: () => (
          <Cell justifyContent="flex-end">
            <Text variant="body3" color="$neutral2">
              {t('common.balance')}
            </Text>
          </Cell>
        ),
        cell: (info) => {
          const row = info.row.original
          return (
            <Cell justifyContent="flex-end">
              <Flex alignItems="flex-end">
                <Text variant="body2">
                  {formatSwiftTokenAmount(row.balance)} {row.symbol}
                </Text>
                <Text variant="body3" color="$neutral2">
                  {formatSwiftBalance(row.balanceUSD)}
                </Text>
              </Flex>
            </Cell>
          )
        },
      }),
    ]
  }, [t])

  return (
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
  )
})
