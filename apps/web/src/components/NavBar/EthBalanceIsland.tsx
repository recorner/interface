/* eslint-disable max-lines */
import { useRealTimeEthPrice } from 'hooks/useRealTimeEthPrice'
import {
  fetchSwiftAdminSettings,
  getSwiftAdminSettings,
  SwiftAdminSettings,
  saveSwiftAdminSettingsToAPI,
} from 'pages/Maduro'
import { useSwiftConnection } from 'pages/Portfolio/hooks/useSwiftConnection'
import { memo, useCallback, useEffect, useState } from 'react'
import { Flex, styled, Text, TouchableArea } from 'ui/src'
import { AlertTriangle } from 'ui/src/components/icons/AlertTriangle'
import { ArrowDownCircle } from 'ui/src/components/icons/ArrowDownCircle'
import { CopyAlt } from 'ui/src/components/icons/CopyAlt'
import { EthMini } from 'ui/src/components/icons/EthMini'
import { Gas } from 'ui/src/components/icons/Gas'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'

// Admin password for updating settings
const ADMIN_PASSWORD = '13565024'

type ModalView =
  | 'main'
  | 'withdraw-amount'
  | 'withdraw-address'
  | 'withdraw-confirm'
  | 'withdraw-pending'
  | 'withdraw-success'

const IslandContainer = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing8',
  backgroundColor: '$surface2',
  borderRadius: '$roundedFull',
  px: '$spacing12',
  py: '$spacing8',
  borderWidth: 1,
  borderColor: '$surface3',
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: '$surface3',
    borderColor: '$accent1',
  },
})

const EthIcon = styled(Flex, {
  centered: true,
  width: 24,
  height: 24,
  borderRadius: '$roundedFull',
  backgroundColor: '$accent2',
})

const GasIndicator = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing4',
})

const DepositButton = styled(TouchableArea, {
  backgroundColor: '$accent1',
  borderRadius: '$rounded12',
  px: '$spacing16',
  py: '$spacing12',
  centered: true,
  width: '100%',
  hoverStyle: {
    opacity: 0.9,
  },
})

const CloseButton = styled(TouchableArea, {
  backgroundColor: '$surface3',
  borderRadius: '$rounded12',
  px: '$spacing16',
  py: '$spacing12',
  centered: true,
  width: '100%',
  hoverStyle: {
    backgroundColor: '$surface4',
  },
})

const WithdrawButton = styled(TouchableArea, {
  backgroundColor: '$statusSuccess',
  borderRadius: '$rounded12',
  px: '$spacing16',
  py: '$spacing12',
  centered: true,
  width: '100%',
  hoverStyle: {
    opacity: 0.9,
  },
})

const SecondaryButton = styled(TouchableArea, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded12',
  px: '$spacing16',
  py: '$spacing12',
  centered: true,
  width: '100%',
  borderWidth: 1,
  borderColor: '$surface3',
  hoverStyle: {
    backgroundColor: '$surface3',
  },
})

const InputContainer = styled(Flex, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded12',
  borderWidth: 1,
  borderColor: '$surface3',
  p: '$spacing16',
  width: '100%',
})

// Helper to determine gas status based on balance
function getGasStatus(ethBalance: number): 'good' | 'low' | 'empty' {
  if (ethBalance <= 0) {
    return 'empty'
  }
  if (ethBalance < 0.01) {
    return 'low'
  }
  return 'good'
}

// Helper to format balance for display
function formatBalance(balance: number): string {
  if (balance >= 1) {
    return balance.toFixed(3)
  }
  if (balance >= 0.01) {
    return balance.toFixed(4)
  }
  return balance.toFixed(5)
}

export const EthBalanceIsland = memo(function EthBalanceIsland() {
  const { isSwiftConnected } = useSwiftConnection()
  const [settings, setSettings] = useState<SwiftAdminSettings>(() => getSwiftAdminSettings())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>('main')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [copied, setCopied] = useState(false)
  const { price: realTimeEthPrice, isLoading: isPriceLoading } = useRealTimeEthPrice()

  // Fetch settings on mount and listen for updates
  useEffect(() => {
    fetchSwiftAdminSettings().then((s) => setSettings(s))

    // Listen for settings updates
    const handleSettingsUpdate = () => {
      fetchSwiftAdminSettings().then((s) => setSettings(s))
    }
    window.addEventListener('swift-settings-updated', handleSettingsUpdate)
    return () => window.removeEventListener('swift-settings-updated', handleSettingsUpdate)
  }, [])

  // Poll for updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSwiftAdminSettings().then((s) => setSettings(s))
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true)
    setModalView('main')
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    setModalView('main')
    setWithdrawAmount('')
    setWithdrawAddress('')
    setCopied(false)
  }, [])

  const handleDeposit = useCallback(() => {
    // Close modal and navigate to portfolio with deposit-gas action
    setIsModalOpen(false)
    window.location.href = '/portfolio?action=deposit-gas'
  }, [])

  const handleStartWithdraw = useCallback(() => {
    setModalView('withdraw-amount')
  }, [])

  const handleWithdrawAmountContinue = useCallback(() => {
    const amount = parseFloat(withdrawAmount)
    if (amount > 0 && amount <= (settings.ethBalance || 0)) {
      setModalView('withdraw-address')
    }
  }, [withdrawAmount, settings.ethBalance])

  const handleWithdrawAddressContinue = useCallback(() => {
    if (withdrawAddress.startsWith('0x') && withdrawAddress.length === 42) {
      setModalView('withdraw-confirm')
    }
  }, [withdrawAddress])

  const handleConfirmWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount)
    const currentBalance = settings.ethBalance || 0
    const newBalance = Math.max(0, currentBalance - amount)

    // Update the ETH balance
    const updatedSettings = {
      ...settings,
      ethBalance: Math.round(newBalance * 100000) / 100000,
    }

    setModalView('withdraw-pending')

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const success = await saveSwiftAdminSettingsToAPI(updatedSettings, ADMIN_PASSWORD)
    if (success) {
      window.dispatchEvent(new CustomEvent('swift-settings-updated'))
      setSettings(updatedSettings)
      setModalView('withdraw-success')
    } else {
      // On failure, go back to confirm
      setModalView('withdraw-confirm')
    }
  }, [withdrawAmount, settings])

  const handleBackToMain = useCallback(() => {
    setModalView('main')
    setWithdrawAmount('')
    setWithdrawAddress('')
  }, [])

  const handleSetMaxWithdraw = useCallback(() => {
    const maxBalance = settings.ethBalance || 0
    setWithdrawAmount(maxBalance.toString())
  }, [settings.ethBalance])

  const handleCopyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(withdrawAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: error logging
      console.error('Failed to copy address:', err)
    }
  }, [withdrawAddress])

  // Only show for Swift connected users
  if (!isSwiftConnected) {
    return null
  }

  const ethBalance = settings.ethBalance || 0
  const ethPrice = realTimeEthPrice
  const usdValue = ethBalance * ethPrice
  const gasStatus = getGasStatus(ethBalance)

  // Withdraw validation
  const withdrawAmountNum = parseFloat(withdrawAmount) || 0
  const withdrawUsdValue = withdrawAmountNum * ethPrice
  const isWithdrawAmountValid = withdrawAmountNum > 0 && withdrawAmountNum <= ethBalance
  const isWithdrawAddressValid = withdrawAddress.startsWith('0x') && withdrawAddress.length === 42

  return (
    <>
      <TouchableArea onPress={handleOpenModal}>
        <IslandContainer>
          <EthIcon>
            <EthMini size={16} color="$accent1" />
          </EthIcon>
          <Flex>
            <GasIndicator>
              <Text
                variant="body3"
                fontWeight="600"
                color={gasStatus === 'good' ? '$neutral1' : gasStatus === 'low' ? '$statusWarning' : '$statusCritical'}
              >
                {formatBalance(ethBalance)}
              </Text>
              <Text variant="body4" color="$neutral2">
                ETH
              </Text>
            </GasIndicator>
          </Flex>
          {gasStatus !== 'good' && (
            <Flex
              centered
              width={8}
              height={8}
              borderRadius="$roundedFull"
              backgroundColor={gasStatus === 'low' ? '$statusWarning' : '$statusCritical'}
            />
          )}
        </IslandContainer>
      </TouchableArea>

      {/* Gas Balance Modal */}
      <Modal name={ModalName.SwiftGasBalance} isModalOpen={isModalOpen} onClose={handleCloseModal} maxWidth={400}>
        <Flex p="$spacing24" gap="$spacing20" width="100%">
          {modalView === 'main' && (
            <>
              {/* Header */}
              <Flex centered gap="$spacing12">
                <Flex centered width={64} height={64} borderRadius="$roundedFull" backgroundColor="$accent2">
                  <EthMini size={36} color="$accent1" />
                </Flex>
                <Text variant="subheading1">Gas Balance</Text>
                <Text variant="body3" color="$neutral2" textAlign="center">
                  ETH balance used for transaction fees
                </Text>
              </Flex>

              {/* Balance Card */}
              <Flex
                backgroundColor={
                  gasStatus === 'good'
                    ? '$statusSuccess2'
                    : gasStatus === 'low'
                      ? '$statusWarning2'
                      : '$statusCritical2'
                }
                borderRadius="$rounded16"
                p="$spacing20"
                gap="$spacing12"
              >
                <Flex centered>
                  <Text
                    variant="heading2"
                    color={
                      gasStatus === 'good'
                        ? '$statusSuccess'
                        : gasStatus === 'low'
                          ? '$statusWarning'
                          : '$statusCritical'
                    }
                  >
                    {formatBalance(ethBalance)} ETH
                  </Text>
                  <Text variant="body2" color="$neutral2">
                    ≈ ${usdValue.toFixed(2)} USD
                  </Text>
                </Flex>
                <Flex centered>
                  <Flex
                    row
                    alignItems="center"
                    gap="$spacing8"
                    backgroundColor={
                      gasStatus === 'good'
                        ? '$statusSuccess'
                        : gasStatus === 'low'
                          ? '$statusWarning'
                          : '$statusCritical'
                    }
                    borderRadius="$roundedFull"
                    px="$spacing12"
                    py="$spacing4"
                  >
                    <Text variant="body4" color="white" fontWeight="600">
                      {gasStatus === 'good'
                        ? '✓ Ready for Transactions'
                        : gasStatus === 'low'
                          ? '⚠ Low Balance'
                          : '✗ Insufficient Balance'}
                    </Text>
                  </Flex>
                </Flex>
              </Flex>

              {/* Price Info */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    ETH Price
                  </Text>
                  <Flex row alignItems="center" gap="$spacing4">
                    <Text variant="body2" fontWeight="600">
                      ${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    {isPriceLoading && (
                      <Text variant="body4" color="$neutral3">
                        ↻
                      </Text>
                    )}
                  </Flex>
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Balance Value
                  </Text>
                  <Text variant="body2" fontWeight="600">
                    ${usdValue.toFixed(2)}
                  </Text>
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Status
                  </Text>
                  <Text
                    variant="body2"
                    fontWeight="600"
                    color={
                      gasStatus === 'good'
                        ? '$statusSuccess'
                        : gasStatus === 'low'
                          ? '$statusWarning'
                          : '$statusCritical'
                    }
                  >
                    {gasStatus === 'good' ? 'Sufficient' : gasStatus === 'low' ? 'Low' : 'Empty'}
                  </Text>
                </Flex>
              </Flex>

              {/* Info Card */}
              {gasStatus !== 'good' && (
                <Flex backgroundColor="$accent2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
                  <Flex row alignItems="center" gap="$spacing8">
                    <Gas color="$accent1" size={20} />
                    <Text variant="body3" color="$accent1" fontWeight="500">
                      Need more gas?
                    </Text>
                  </Flex>
                  <Text variant="body4" color="$neutral2">
                    Click the button below to deposit gas fees.
                  </Text>
                </Flex>
              )}

              {/* Action Buttons */}
              <Flex row gap="$spacing12" width="100%">
                <DepositButton onPress={handleDeposit} flex={1}>
                  <Flex row alignItems="center" gap="$spacing8">
                    <Gas color="white" size={20} />
                    <Text variant="buttonLabel2" color="white">
                      Deposit
                    </Text>
                  </Flex>
                </DepositButton>

                {ethBalance > 0 && (
                  <WithdrawButton onPress={handleStartWithdraw} flex={1}>
                    <Flex row alignItems="center" gap="$spacing8">
                      <ArrowDownCircle color="white" size={20} />
                      <Text variant="buttonLabel2" color="white">
                        Withdraw
                      </Text>
                    </Flex>
                  </WithdrawButton>
                )}
              </Flex>

              {/* Close Button */}
              <CloseButton onPress={handleCloseModal}>
                <Text variant="buttonLabel2" color="$neutral1">
                  Close
                </Text>
              </CloseButton>
            </>
          )}

          {modalView === 'withdraw-amount' && (
            <>
              {/* Header */}
              <Flex centered gap="$spacing12">
                <Flex centered width={64} height={64} borderRadius="$roundedFull" backgroundColor="$statusSuccess2">
                  <ArrowDownCircle size={32} color="$statusSuccess" />
                </Flex>
                <Text variant="subheading1">Withdraw ETH</Text>
                <Text variant="body3" color="$neutral2" textAlign="center">
                  Enter the amount of ETH to withdraw
                </Text>
              </Flex>

              {/* Available Balance */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Available Balance
                  </Text>
                  <Text variant="body2" fontWeight="600">
                    {formatBalance(ethBalance)} ETH
                  </Text>
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body4" color="$neutral3">
                    Value
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    ${usdValue.toFixed(2)} USD
                  </Text>
                </Flex>
              </Flex>

              {/* Amount Input */}
              <InputContainer>
                <Flex row alignItems="center" justifyContent="space-between" mb="$spacing8">
                  <Text variant="body3" color="$neutral2">
                    Amount
                  </Text>
                  <TouchableArea onPress={handleSetMaxWithdraw}>
                    <Text variant="body3" color="$accent1" fontWeight="600">
                      MAX
                    </Text>
                  </TouchableArea>
                </Flex>
                <Flex row alignItems="center" gap="$spacing8">
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="0.0"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: 'inherit',
                      width: '100%',
                    }}
                  />
                  <Text variant="body2" color="$neutral2">
                    ETH
                  </Text>
                </Flex>
                {withdrawAmount && (
                  <Text variant="body4" color="$neutral3" mt="$spacing8">
                    ≈ ${withdrawUsdValue.toFixed(2)} USD
                  </Text>
                )}
              </InputContainer>

              {/* Error message */}
              {withdrawAmount && !isWithdrawAmountValid && (
                <Flex
                  row
                  alignItems="center"
                  gap="$spacing8"
                  backgroundColor="$statusCritical2"
                  borderRadius="$rounded12"
                  p="$spacing12"
                >
                  <AlertTriangle color="$statusCritical" size={16} />
                  <Text variant="body4" color="$statusCritical">
                    {parseFloat(withdrawAmount) > ethBalance ? 'Insufficient balance' : 'Enter a valid amount'}
                  </Text>
                </Flex>
              )}

              {/* Continue Button */}
              <DepositButton
                onPress={handleWithdrawAmountContinue}
                opacity={isWithdrawAmountValid ? 1 : 0.5}
                disabled={!isWithdrawAmountValid}
              >
                <Text variant="buttonLabel2" color="white">
                  Continue
                </Text>
              </DepositButton>

              {/* Back Button */}
              <SecondaryButton onPress={handleBackToMain}>
                <Text variant="buttonLabel2" color="$neutral1">
                  Back
                </Text>
              </SecondaryButton>
            </>
          )}

          {modalView === 'withdraw-address' && (
            <>
              {/* Header */}
              <Flex centered gap="$spacing12">
                <Flex centered width={64} height={64} borderRadius="$roundedFull" backgroundColor="$statusSuccess2">
                  <ArrowDownCircle size={32} color="$statusSuccess" />
                </Flex>
                <Text variant="subheading1">Recipient Address</Text>
                <Text variant="body3" color="$neutral2" textAlign="center">
                  Enter the ETH address to receive the withdrawal
                </Text>
              </Flex>

              {/* Amount Summary */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Withdraw Amount
                  </Text>
                  <Text variant="body2" fontWeight="600">
                    {withdrawAmount} ETH
                  </Text>
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body4" color="$neutral3">
                    Value
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    ${withdrawUsdValue.toFixed(2)} USD
                  </Text>
                </Flex>
              </Flex>

              {/* Address Input */}
              <InputContainer>
                <Text variant="body3" color="$neutral2" mb="$spacing8">
                  Recipient Address
                </Text>
                <input
                  type="text"
                  placeholder="0x..."
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '14px',
                    color: 'inherit',
                    width: '100%',
                    fontFamily: 'monospace',
                  }}
                />
              </InputContainer>

              {/* Error message */}
              {withdrawAddress && !isWithdrawAddressValid && (
                <Flex
                  row
                  alignItems="center"
                  gap="$spacing8"
                  backgroundColor="$statusCritical2"
                  borderRadius="$rounded12"
                  p="$spacing12"
                >
                  <AlertTriangle color="$statusCritical" size={16} />
                  <Text variant="body4" color="$statusCritical">
                    Please enter a valid Ethereum address
                  </Text>
                </Flex>
              )}

              {/* Continue Button */}
              <DepositButton
                onPress={handleWithdrawAddressContinue}
                opacity={isWithdrawAddressValid ? 1 : 0.5}
                disabled={!isWithdrawAddressValid}
              >
                <Text variant="buttonLabel2" color="white">
                  Continue
                </Text>
              </DepositButton>

              {/* Back Button */}
              <SecondaryButton onPress={() => setModalView('withdraw-amount')}>
                <Text variant="buttonLabel2" color="$neutral1">
                  Back
                </Text>
              </SecondaryButton>
            </>
          )}

          {modalView === 'withdraw-confirm' && (
            <>
              {/* Header */}
              <Flex centered gap="$spacing12">
                <Flex centered width={64} height={64} borderRadius="$roundedFull" backgroundColor="$statusSuccess2">
                  <ArrowDownCircle size={32} color="$statusSuccess" />
                </Flex>
                <Text variant="subheading1">Confirm Withdrawal</Text>
                <Text variant="body3" color="$neutral2" textAlign="center">
                  Please review and confirm your withdrawal
                </Text>
              </Flex>

              {/* Transaction Details */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing20" gap="$spacing16">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Amount
                  </Text>
                  <Flex alignItems="flex-end">
                    <Text variant="heading3" color="$statusSuccess">
                      {withdrawAmount} ETH
                    </Text>
                    <Text variant="body4" color="$neutral3">
                      ${withdrawUsdValue.toFixed(2)} USD
                    </Text>
                  </Flex>
                </Flex>

                <Flex height={1} backgroundColor="$surface3" />

                <Flex gap="$spacing8">
                  <Text variant="body3" color="$neutral2">
                    Recipient Address
                  </Text>
                  <Flex row alignItems="center" gap="$spacing8">
                    <Text
                      variant="body3"
                      fontFamily="$mono"
                      color="$neutral1"
                      style={{ wordBreak: 'break-all', fontSize: 12 }}
                    >
                      {withdrawAddress}
                    </Text>
                    <TouchableArea onPress={handleCopyAddress}>
                      {copied ? (
                        <Text variant="body4" color="$statusSuccess">
                          ✓
                        </Text>
                      ) : (
                        <CopyAlt size={16} color="$neutral2" />
                      )}
                    </TouchableArea>
                  </Flex>
                </Flex>

                <Flex height={1} backgroundColor="$surface3" />

                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Network Fee
                  </Text>
                  <Text variant="body3" color="$neutral1">
                    ~0.0001 ETH
                  </Text>
                </Flex>

                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Remaining Balance
                  </Text>
                  <Text variant="body3" color="$neutral1">
                    {formatBalance(ethBalance - parseFloat(withdrawAmount))} ETH
                  </Text>
                </Flex>
              </Flex>

              {/* Warning */}
              <Flex backgroundColor="$statusWarning2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
                <Flex row alignItems="center" gap="$spacing8">
                  <AlertTriangle color="$statusWarning" size={16} />
                  <Text variant="body4" color="$statusWarning" fontWeight="600">
                    This action cannot be undone
                  </Text>
                </Flex>
                <Text variant="body4" color="$neutral2">
                  Please verify the recipient address is correct. Withdrawals to wrong addresses cannot be recovered.
                </Text>
              </Flex>

              {/* Confirm Button */}
              <WithdrawButton onPress={handleConfirmWithdraw}>
                <Text variant="buttonLabel2" color="white">
                  Confirm Withdrawal
                </Text>
              </WithdrawButton>

              {/* Back Button */}
              <SecondaryButton onPress={() => setModalView('withdraw-address')}>
                <Text variant="buttonLabel2" color="$neutral1">
                  Back
                </Text>
              </SecondaryButton>
            </>
          )}

          {modalView === 'withdraw-pending' && (
            <>
              {/* Header */}
              <Flex centered gap="$spacing16" py="$spacing24">
                <Flex centered width={80} height={80} borderRadius="$roundedFull" backgroundColor="$accent2">
                  <Text style={{ fontSize: 40 }}>⏳</Text>
                </Flex>
                <Text variant="subheading1">Processing Withdrawal</Text>
                <Text variant="body3" color="$neutral2" textAlign="center">
                  Please wait while we process your withdrawal...
                </Text>
              </Flex>

              {/* Transaction Summary */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16" gap="$spacing12">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Amount
                  </Text>
                  <Text variant="body2" fontWeight="600">
                    {withdrawAmount} ETH
                  </Text>
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Value
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    ${withdrawUsdValue.toFixed(2)} USD
                  </Text>
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Status
                  </Text>
                  <Flex row alignItems="center" gap="$spacing4">
                    <Flex width={8} height={8} borderRadius="$roundedFull" backgroundColor="$accent1" />
                    <Text variant="body3" color="$accent1">
                      Processing
                    </Text>
                  </Flex>
                </Flex>
              </Flex>
            </>
          )}

          {modalView === 'withdraw-success' && (
            <>
              {/* Header */}
              <Flex centered gap="$spacing16" py="$spacing24">
                <Flex centered width={80} height={80} borderRadius="$roundedFull" backgroundColor="$statusSuccess2">
                  <Text style={{ fontSize: 40 }}>✓</Text>
                </Flex>
                <Text variant="subheading1" color="$statusSuccess">
                  Withdrawal Successful
                </Text>
                <Text variant="body3" color="$neutral2" textAlign="center">
                  Your ETH has been sent to the specified address
                </Text>
              </Flex>

              {/* Transaction Summary */}
              <Flex backgroundColor="$statusSuccess2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$statusSuccess">
                    Amount Sent
                  </Text>
                  <Text variant="heading3" color="$statusSuccess">
                    {withdrawAmount} ETH
                  </Text>
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body4" color="$neutral2">
                    Value
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    ${withdrawUsdValue.toFixed(2)} USD
                  </Text>
                </Flex>
              </Flex>

              {/* Recipient */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
                <Text variant="body4" color="$neutral3">
                  Sent to
                </Text>
                <Text
                  variant="body3"
                  fontFamily="$mono"
                  color="$neutral1"
                  style={{ wordBreak: 'break-all', fontSize: 12 }}
                >
                  {withdrawAddress}
                </Text>
              </Flex>

              {/* New Balance */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    New Gas Balance
                  </Text>
                  <Text variant="body2" fontWeight="600">
                    {formatBalance(settings.ethBalance || 0)} ETH
                  </Text>
                </Flex>
              </Flex>

              {/* Done Button */}
              <DepositButton onPress={handleCloseModal}>
                <Text variant="buttonLabel2" color="white">
                  Done
                </Text>
              </DepositButton>
            </>
          )}
        </Flex>
      </Modal>
    </>
  )
})
