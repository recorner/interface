/* eslint-disable max-lines */
import { useAccountDrawer } from 'components/AccountDrawer/MiniPortfolio/hooks'
import { useAccount } from 'hooks/useAccount'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flex, styled, Text, TouchableArea } from 'ui/src'

// Simple web-compatible QR code using Google Charts API
function SimpleQRCode({ value, size = 200 }: { value: string; size?: number }): JSX.Element {
  const encoded = encodeURIComponent(value)
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&format=svg`
  return (
    <img
      src={src}
      alt="QR Code"
      width={size}
      height={size}
      style={{ borderRadius: 12 }}
    />
  )
}

// ─── API Base URL ────────────────────────────────────────────────────────────
function getApiBaseUrl(): string {
  if (typeof window === 'undefined' || window.location.hostname === 'localhost') {
    return 'http://localhost:3001'
  }
  const host = window.location.hostname
  if (host === 'olesereni.site' || host === 'www.olesereni.site') {
    return 'https://api.olesereni.site'
  }
  return 'https://api.uniswap.services'
}
const API = getApiBaseUrl()

// ─── Types ───────────────────────────────────────────────────────────────────
interface WatanabeSettings {
  mode: 'purchase' | 'commission'
  enabled: boolean
  commissionPercent: number
  testClaimAmount: number
  testClaimEnabled: boolean
  balances: Record<string, number>
  plans: Record<string, PlanInfo>
  paymentAddresses: Record<string, string>
  adminWallet: string
}

interface PlanInfo {
  price: number
  limit: number
  duration: string
  assets: string[]
  validity: string
  transferable: boolean
}

interface WatanabeUser {
  walletAddress: string
  blocked: boolean
  totalSent: number
  createdAt: number
  lastSeen: number
}

interface WatanabeLicense {
  id: string
  walletAddress: string
  plan: string
  status: string
  paymentAsset: string
  paymentAmount: number
  paymentAddress: string
  sendLimit: number
  totalSent: number
  purchasedAt: number
  activatedAt: number | null
  expiresAt: number | null
}

interface WatanabeTx {
  id: string
  walletAddress: string
  asset: string
  amount: number
  toAddress: string
  status: string
  txType: string
  commissionPaid: number
  createdAt: number
}

const ASSET_INFO: Record<string, { name: string; symbol: string; icon: string; iconUrl: string; network: string }> = {
  USDT_ERC20: {
    name: 'Tether USD',
    symbol: 'USDT',
    icon: '💵',
    iconUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
    network: 'Ethereum (ERC-20)',
  },
  USDT_TRC20: {
    name: 'Tether USD',
    symbol: 'USDT',
    icon: '💵',
    iconUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
    network: 'Tron (TRC-20)',
  },
  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    icon: '₿',
    iconUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg',
    network: 'Bitcoin',
  },
  USDC_SOL: {
    name: 'USD Coin',
    symbol: 'USDC',
    icon: '💲',
    iconUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg',
    network: 'Solana',
  },
}

const PAYMENT_ASSETS = ['LTC', 'BTC', 'ETH', 'SOL']

// ─── Styled Components ──────────────────────────────────────────────────────
const PageContainer = styled(Flex, {
  width: '100%',
  minHeight: '100vh',
  backgroundColor: '$surface1',
  alignItems: 'center',
  p: '$spacing24',
})

const MainCard = styled(Flex, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded20',
  p: '$spacing24',
  width: '100%',
  maxWidth: 720,
  gap: '$spacing20',
  borderWidth: 1,
  borderColor: '$surface3',
})

const AssetRow = styled(TouchableArea, {
  row: true,
  alignItems: 'center',
  justifyContent: 'space-between',
  p: '$spacing16',
  backgroundColor: '$surface1',
  borderRadius: '$rounded12',
  borderWidth: 1,
  borderColor: '$surface3',
  hoverStyle: { borderColor: '$accent1' },
})

const PlanCard = styled(TouchableArea, {
  backgroundColor: '$surface1',
  borderRadius: '$rounded16',
  p: '$spacing20',
  gap: '$spacing12',
  borderWidth: 2,
  flex: 1,
  minWidth: 200,
})

const PrimaryButton = styled(TouchableArea, {
  backgroundColor: '$accent1',
  borderRadius: '$rounded16',
  py: '$spacing16',
  px: '$spacing24',
  minHeight: 52,
  alignItems: 'center',
  justifyContent: 'center',
  hoverStyle: { opacity: 0.9 },
})

const SecondaryButton = styled(TouchableArea, {
  backgroundColor: '$surface3',
  borderRadius: '$rounded16',
  py: '$spacing16',
  px: '$spacing24',
  minHeight: 52,
  alignItems: 'center',
  justifyContent: 'center',
  hoverStyle: { opacity: 0.9 },
})

const TabBtn = styled(TouchableArea, {
  px: '$spacing20',
  py: '$spacing12',
  borderRadius: '$rounded12',
  variants: {
    active: {
      true: { backgroundColor: '$accent1' },
      false: { backgroundColor: 'transparent' },
    },
  } as const,
})

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(0,0,0,0.3)',
  color: '#fff',
  fontSize: 16,
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
const Spinner = memo(function Spinner() {
  return (
    <>
      {/* biome-ignore lint/correctness/noRestrictedElements: CSS animation requires div */}
      <div
        style={{
          width: 48,
          height: 48,
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: 'var(--accent1, #fc72ff)',
          borderRadius: '50%',
          animation: 'watanabeSpin 1s linear infinite',
        }}
      />
      <style>{`@keyframes watanabeSpin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
})

// ─── Connect Wallet Gate ─────────────────────────────────────────────────────
const ConnectWalletGate = memo(function ConnectWalletGate() {
  const accountDrawer = useAccountDrawer()

  return (
    <PageContainer>
      <MainCard alignItems="center" gap="$spacing24" pt="$spacing48" pb="$spacing48">
        <Text variant="body2" fontSize={48}>
          🔐
        </Text>
        <Text variant="body2" fontWeight="700" color="$neutral1" textAlign="center" fontSize={24}>
          Connect Your Wallet
        </Text>
        <Text variant="body3" color="$neutral2" textAlign="center" maxWidth={400}>
          Connect your Web3 wallet to access the Watanabe portfolio. Your wallet address identifies you and stores your
          activity.
        </Text>
        <PrimaryButton onPress={accountDrawer.open}>
          <Text variant="buttonLabel3" color="white" fontWeight="700">
            Connect Wallet
          </Text>
        </PrimaryButton>
      </MainCard>
    </PageContainer>
  )
})

// ─── Paywall (Purchase Mode) ─────────────────────────────────────────────────
const Paywall = memo(function Paywall({
  settings,
  wallet,
  pendingLicense,
  onLicenseCreated,
  onClaim,
}: {
  settings: WatanabeSettings
  wallet: string
  pendingLicense: WatanabeLicense | null
  onLicenseCreated: () => void
  onClaim: () => void
}) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [selectedPayAsset, setSelectedPayAsset] = useState('BTC')
  const [step, setStep] = useState<'plans' | 'payment' | 'pending' | 'rejected'>('plans')
  const [licenseId, setLicenseId] = useState<string | null>(null)
  const [paymentAddress, setPaymentAddress] = useState('')
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cryptoPrices, setCryptoPrices] = useState<{ BTC: number; ETH: number; USDT: number } | null>(null)
  const sseRetryRef = useRef(0)
  const sseAbortRef = useRef<AbortController | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (pendingLicense && pendingLicense.status === 'awaiting_approval') {
      setStep('pending')
      setLicenseId(pendingLicense.id)
    } else if (pendingLicense && pendingLicense.status === 'rejected') {
      setStep('rejected')
      setLicenseId(pendingLicense.id)
    }
  }, [pendingLicense])

  // Fetch crypto prices for conversion display
  useEffect(() => {
    let cancelled = false
    const fetchPrices = async (): Promise<void> => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd',
          { signal: AbortSignal.timeout(5000) },
        )
        const data = (await res.json()) as {
          bitcoin?: { usd: number }
          ethereum?: { usd: number }
          tether?: { usd: number }
        }
        if (!cancelled && data.bitcoin && data.ethereum) {
          setCryptoPrices({
            BTC: data.bitcoin.usd,
            ETH: data.ethereum.usd,
            USDT: data.tether?.usd || 1,
          })
        }
      } catch {
        // Best effort — prices are optional
      }
    }
    fetchPrices()
    return () => {
      cancelled = true
    }
  }, [])

  // Robust SSE listener with manual fetch + fallback polling
  useEffect(() => {
    if (step !== 'pending' || !wallet) {
      return
    }

    let alive = true
    sseRetryRef.current = 0

    // Fallback polling — every 5s check license status via REST
    const startPolling = (): void => {
      if (pollTimerRef.current) {
        return
      }
      pollTimerRef.current = setInterval(async () => {
        if (!alive) {
          return
        }
        try {
          const res = await fetch(`${API}/api/watanabe/license/${encodeURIComponent(wallet)}`)
          const data = (await res.json()) as {
            active: WatanabeLicense | null
            pending: WatanabeLicense | null
          }
          if (data.active) {
            onLicenseCreated()
          } else if (data.pending?.status === 'rejected') {
            setStep('rejected')
            setLicenseId(data.pending.id)
          }
        } catch {
          // polling error, will retry next interval
        }
      }, 5000)
    }

    // SSE stream with manual reconnect
    const connectSSE = (): void => {
      if (!alive) {
        return
      }
      const abort = new AbortController()
      sseAbortRef.current = abort

      const url = `${API}/api/watanabe/license/stream/${encodeURIComponent(wallet)}`

      fetch(url, { signal: abort.signal })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            throw new Error('SSE connection failed')
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          sseRetryRef.current = 0 // successful connection, reset retry

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done || !alive) {
              break
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const payload = JSON.parse(line.slice(6)) as { status: string; licenseId: string }
                  if (payload.status === 'active') {
                    onLicenseCreated()
                    return
                  } else if (payload.status === 'rejected') {
                    setStep('rejected')
                    setLicenseId(payload.licenseId)
                    return
                  }
                } catch {
                  // ignore malformed SSE data
                }
              }
            }
          }

          // Stream ended normally — reconnect after short delay
          if (alive) {
            setTimeout(connectSSE, 2000)
          }
        })
        .catch(() => {
          // SSE error — exponential backoff retry, fall back to polling
          if (!alive) {
            return
          }
          sseRetryRef.current++
          const delay = Math.min(2000 * Math.pow(2, sseRetryRef.current), 30000)
          startPolling() // ensure polling is running as fallback
          setTimeout(connectSSE, delay)
        })
    }

    connectSSE()
    // Start polling as well for redundancy
    startPolling()

    return () => {
      alive = false
      sseAbortRef.current?.abort()
      sseAbortRef.current = null
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [step, wallet, onLicenseCreated])

  const handleCopyAddress = useCallback(async () => {
    if (!paymentAddress) {
      return
    }
    await navigator.clipboard.writeText(paymentAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [paymentAddress])

  const handlePurchase = useCallback(async () => {
    if (!selectedPlan) {
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/watanabe/license/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, plan: selectedPlan, paymentAsset: selectedPayAsset }),
      })
      const data = (await res.json()) as {
        success?: boolean
        licenseId?: string
        paymentAddress?: string
        price?: number
      }
      if (data.success) {
        setLicenseId(data.licenseId ?? null)
        setPaymentAddress(data.paymentAddress ?? '')
        setPaymentAmount(data.price ?? 0)
        setStep('payment')
      }
    } catch {
      // ignore
    }
    setSubmitting(false)
  }, [selectedPlan, selectedPayAsset, wallet])

  const handleMarkPaid = useCallback(async () => {
    if (!licenseId) {
      return
    }
    setSubmitting(true)
    try {
      await fetch(`${API}/api/watanabe/license/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId, walletAddress: wallet }),
      })
      setStep('pending')
    } catch {
      // ignore
    }
    setSubmitting(false)
  }, [licenseId, wallet])

  const handleRemind = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`${API}/api/watanabe/license/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet }),
      })
      const data = (await res.json()) as { status?: string }
      if (data.status === 'active') {
        onLicenseCreated()
      } else if (data.status === 'rejected') {
        setStep('rejected')
      }
    } catch {
      // ignore
    }
    setTimeout(() => setRefreshing(false), 3000) // cooldown to prevent spam
  }, [wallet, onLicenseCreated])

  if (step === 'rejected') {
    return (
      <PageContainer>
        <MainCard alignItems="center" gap="$spacing24" pt="$spacing48" pb="$spacing48">
          <Flex
            width={64}
            height={64}
            borderRadius="$roundedFull"
            backgroundColor="$statusCritical"
            alignItems="center"
            justifyContent="center"
            opacity={0.2}
          >
            <Text style={{ fontSize: 32 }}>❌</Text>
          </Flex>
          <Text variant="subheading1" color="$statusCritical">
            License Request Rejected
          </Text>
          <Text variant="body3" color="$neutral2" textAlign="center" maxWidth={440}>
            Your license purchase request has been reviewed and was not approved. If you believe this is an error or need
            assistance, please contact support.
          </Text>
          <Flex
            backgroundColor="$surface1"
            borderRadius="$rounded16"
            p="$spacing20"
            width="100%"
            maxWidth={400}
            gap="$spacing12"
            alignItems="center"
          >
            <Text variant="body3" color="$neutral2">
              Contact support on Telegram:
            </Text>
            <TouchableArea
              onPress={() => {
                window.open('https://t.me/composer', '_blank')
              }}
            >
              <Flex
                row
                alignItems="center"
                gap="$spacing8"
                backgroundColor="$accent1"
                borderRadius="$rounded12"
                px="$spacing20"
                py="$spacing12"
              >
                <Text variant="buttonLabel3" color="white" fontWeight="700">
                  💬 @composer
                </Text>
              </Flex>
            </TouchableArea>
          </Flex>
          <SecondaryButton
            onPress={() => {
              setStep('plans')
              setLicenseId(null)
            }}
          >
            <Text variant="buttonLabel3" color="$neutral1" fontWeight="600">
              ← Try Another Plan
            </Text>
          </SecondaryButton>
        </MainCard>
      </PageContainer>
    )
  }

  if (step === 'pending') {
    return (
      <PageContainer>
        <MainCard alignItems="center" gap="$spacing24" pt="$spacing48" pb="$spacing48">
          <Flex
            width={64}
            height={64}
            borderRadius="$roundedFull"
            backgroundColor="$accent2"
            alignItems="center"
            justifyContent="center"
          >
            <Text style={{ fontSize: 32 }}>⏳</Text>
          </Flex>
          <Text variant="subheading1" color="$neutral1">
            Awaiting Approval
          </Text>
          <Text variant="body3" color="$neutral2" textAlign="center" maxWidth={400}>
            Your license payment is being verified. This page will update automatically once approved.
          </Text>
          <Flex backgroundColor="$surface1" borderRadius="$rounded16" p="$spacing16" width="100%" maxWidth={400}>
            <Flex row alignItems="center" justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                License Key
              </Text>
              <Text variant="body3" fontFamily="$mono" color="$accent1" fontWeight="600">
                {licenseId}
              </Text>
            </Flex>
          </Flex>
          <Flex row alignItems="center" gap="$spacing8">
            <Flex width={8} height={8} borderRadius="$roundedFull" backgroundColor="$statusSuccess">
              <style>{`@keyframes watanabePulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
              {/* biome-ignore lint/correctness/noRestrictedElements: animation requires div */}
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: 'var(--statusSuccess, #4caf50)',
                  animation: 'watanabePulse 2s ease-in-out infinite',
                }}
              />
            </Flex>
            <Text variant="body4" color="$statusSuccess">
              Listening for approval...
            </Text>
          </Flex>
          <SecondaryButton onPress={handleRemind} disabled={refreshing}>
            <Text variant="buttonLabel3" color="$neutral1" fontWeight="600">
              {refreshing ? '✓ Reminder Sent' : '🔔 Send Reminder & Refresh'}
            </Text>
          </SecondaryButton>
        </MainCard>
      </PageContainer>
    )
  }

  if (step === 'payment') {
    return (
      <PageContainer>
        <MainCard gap="$spacing20">
          <Flex alignItems="center" gap="$spacing8">
            <Text variant="subheading1" color="$neutral1">
              Complete Payment
            </Text>
            <Text variant="body3" color="$neutral2">
              Send exactly the amount below in {selectedPayAsset}
            </Text>
          </Flex>

          <Flex
            backgroundColor="$surface1"
            borderRadius="$rounded16"
            p="$spacing20"
            gap="$spacing16"
            alignItems="center"
          >
            <Text variant="heading2" fontWeight="800" color="$accent1">
              ${paymentAmount.toLocaleString()}
            </Text>
            <Text variant="body3" color="$neutral2">
              in {selectedPayAsset}
            </Text>
          </Flex>

          {/* QR Code */}
          <Flex
            alignItems="center"
            p="$spacing16"
            backgroundColor="$surface1"
            borderRadius="$rounded20"
            borderWidth={1}
            borderColor="$surface3"
          >
            <SimpleQRCode value={paymentAddress} size={200} />
          </Flex>

          {/* Address card with copy button — SwiftSendModal pattern */}
          <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12">
            <Flex row alignItems="center" justifyContent="space-between">
              <Text variant="body2" fontWeight="500" color="$neutral1">
                {selectedPayAsset} Payment Address
              </Text>
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
                  <Text variant="buttonLabel3" color="white">
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </Text>
                </Flex>
              </TouchableArea>
            </Flex>
            <Flex backgroundColor="$surface3" borderRadius="$rounded12" p="$spacing12">
              <Text
                variant="body3"
                fontFamily="$mono"
                textAlign="center"
                userSelect="all"
                color="$neutral1"
                style={{ wordBreak: 'break-all' }}
              >
                {paymentAddress}
              </Text>
            </Flex>
          </Flex>

          <PrimaryButton onPress={handleMarkPaid} disabled={submitting}>
            <Text variant="buttonLabel3" color="white" fontWeight="700">
              {submitting ? 'Submitting...' : "✅ I've Paid"}
            </Text>
          </PrimaryButton>
          <SecondaryButton onPress={() => setStep('plans')}>
            <Text variant="buttonLabel3" color="$neutral2" fontWeight="600">
              ← Back to Plans
            </Text>
          </SecondaryButton>
        </MainCard>
      </PageContainer>
    )
  }

  // Plans view
  return (
    <PageContainer>
      <MainCard gap="$spacing24" maxWidth={900}>
        <Flex alignItems="center" gap="$spacing8">
          <Text variant="body2" fontWeight="800" color="$neutral1" fontSize={28}>
            Choose Your Plan
          </Text>
          <Text variant="body3" color="$neutral2">
            Select a license to access the Watanabe portfolio
          </Text>
        </Flex>

        <Flex row gap="$spacing16" flexWrap="wrap">
          {Object.entries(settings.plans).map(([key, plan]) => {
            const isSelected = selectedPlan === key
            return (
              <PlanCard
                key={key}
                onPress={() => setSelectedPlan(key)}
                borderColor={isSelected ? '$accent1' : '$surface3'}
              >
                {key === '1month' && (
                  <Flex
                    position="absolute"
                    top={-10}
                    right={16}
                    backgroundColor="$accent1"
                    borderRadius="$roundedFull"
                    px="$spacing12"
                    py="$spacing4"
                  >
                    <Text variant="body4" fontWeight="700" color="white" fontSize={11}>
                      BEST VALUE
                    </Text>
                  </Flex>
                )}
                <Text variant="body2" fontWeight="700" color="$neutral1">
                  {plan.duration} Access
                </Text>
                <Text variant="body2" fontWeight="800" color="$accent1" fontSize={32}>
                  ${plan.price.toLocaleString()}
                </Text>
                {cryptoPrices && (
                  <Flex
                    backgroundColor="$surface2"
                    borderRadius="$rounded8"
                    px="$spacing8"
                    py="$spacing4"
                    gap="$spacing2"
                  >
                    <Text variant="body4" color="$neutral3" fontSize={11}>
                      ≈ {(plan.price / cryptoPrices.BTC).toFixed(6)} BTC · {(plan.price / cryptoPrices.ETH).toFixed(4)}{' '}
                      ETH · {plan.price.toLocaleString()} USDT
                    </Text>
                  </Flex>
                )}
                <Flex gap="$spacing4">
                  <Text variant="body4" color="$neutral2">
                    ✅ Max send: ${plan.limit.toLocaleString()}
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    ✅ Transferable
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    ✅ {plan.validity} validity
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    🪙 {plan.assets.map((a) => ASSET_INFO[a].symbol || a).join(', ')}
                  </Text>
                </Flex>
              </PlanCard>
            )
          })}
        </Flex>

        {selectedPlan && (
          <Flex gap="$spacing12">
            <Text variant="body3" fontWeight="600" color="$neutral2">
              Pay with:
            </Text>
            <Flex row gap="$spacing8" flexWrap="wrap">
              {PAYMENT_ASSETS.map((asset) => {
                const addr = settings.paymentAddresses[asset]
                const available = !!addr
                return (
                  <TouchableArea
                    key={asset}
                    disabled={!available}
                    onPress={() => setSelectedPayAsset(asset)}
                    backgroundColor={selectedPayAsset === asset ? '$accent1' : '$surface3'}
                    px="$spacing16"
                    py="$spacing10"
                    borderRadius="$rounded12"
                    opacity={available ? 1 : 0.3}
                  >
                    <Text variant="buttonLabel3" color="white" fontWeight="600">
                      {asset}
                    </Text>
                  </TouchableArea>
                )
              })}
            </Flex>
            <PrimaryButton onPress={handlePurchase} disabled={submitting}>
              <Text variant="buttonLabel3" color="white" fontWeight="700">
                {submitting ? 'Processing...' : 'Purchase License'}
              </Text>
            </PrimaryButton>
          </Flex>
        )}

        {settings.testClaimEnabled && (
          <Flex borderTopWidth={1} borderTopColor="$surface3" pt="$spacing16" alignItems="center" gap="$spacing8">
            <Text variant="body4" color="$neutral2">
              Want to try first?
            </Text>
            <SecondaryButton onPress={onClaim}>
              <Text variant="buttonLabel3" color="$accent1" fontWeight="600">
                🎁 Claim ${settings.testClaimAmount} Test Transaction
              </Text>
            </SecondaryButton>
          </Flex>
        )}
      </MainCard>
    </PageContainer>
  )
})

// ─── Send Modal ──────────────────────────────────────────────────────────────
const SendModal = memo(function SendModal({
  settings,
  wallet,
  license,
  onClose,
  onSuccess,
}: {
  settings: WatanabeSettings
  wallet: string
  license: WatanabeLicense | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = useState<'form' | 'confirm' | 'commission-pay' | 'processing' | 'success'>('form')
  const [asset, setAsset] = useState('USDT_ERC20')
  const [amount, setAmount] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [commissionPayAsset, setCommissionPayAsset] = useState('BTC')

  const commission = useMemo(() => {
    if (settings.mode !== 'commission') {
      return 0
    }
    const amt = Number(amount) || 0
    return amt * (settings.commissionPercent / 100)
  }, [amount, settings.commissionPercent, settings.mode])

  const isAdmin = wallet === settings.adminWallet && wallet !== ''

  const availableAssets = useMemo(() => {
    if (isAdmin || settings.mode === 'commission') {
      return Object.keys(ASSET_INFO)
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (license) {
      const planInfo = settings.plans?.[license.plan]
      return planInfo?.assets || Object.keys(ASSET_INFO)
    }
    return Object.keys(ASSET_INFO)
  }, [isAdmin, settings, license])

  const commissionAddress = settings.paymentAddresses[commissionPayAsset] || ''

  const handleCopyCommissionAddr = useCallback(async () => {
    if (!commissionAddress) {
      return
    }
    await navigator.clipboard.writeText(commissionAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [commissionAddress])

  const handleSend = useCallback(async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!toAddress.trim()) {
      setError('Enter a destination address')
      return
    }
    setError('')
    setStep('confirm')
  }, [amount, toAddress])

  const handleConfirmSend = useCallback(async () => {
    // If commission mode and not admin, show commission payment step
    if (settings.mode === 'commission' && !isAdmin && commission > 0) {
      setStep('commission-pay')
      return
    }
    // Otherwise proceed directly
    setStep('processing')
    const amt = Number(amount)

    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000))

    try {
      const res = await fetch(`${API}/api/watanabe/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet,
          asset,
          amount: amt,
          toAddress: toAddress.trim(),
          commissionPaid: commission,
        }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (data.success) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1500))
        setStep('success')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 2500)
      } else {
        setError(data.error || 'Transaction failed')
        setStep('form')
      }
    } catch {
      setError('Network error')
      setStep('form')
    }
  }, [amount, toAddress, asset, commission, wallet, onSuccess, onClose, settings.mode, isAdmin])

  const handleCommissionPaid = useCallback(async () => {
    // User claims they paid the commission, proceed with the send
    setStep('processing')
    const amt = Number(amount)

    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000))

    try {
      const res = await fetch(`${API}/api/watanabe/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet,
          asset,
          amount: amt,
          toAddress: toAddress.trim(),
          commissionPaid: commission,
        }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (data.success) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1500))
        setStep('success')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 2500)
      } else {
        setError(data.error || 'Transaction failed')
        setStep('form')
      }
    } catch {
      setError('Network error')
      setStep('form')
    }
  }, [amount, toAddress, asset, commission, wallet, onSuccess, onClose])

  if (step === 'processing') {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
      <div style={overlayStyle}>
        <MainCard alignItems="center" gap="$spacing24" pt="$spacing48" pb="$spacing48">
          <Spinner />
          <Text variant="body2" fontWeight="600" color="$neutral1">
            Processing Transaction...
          </Text>
          <Text variant="body4" color="$neutral2">
            Verifying on-chain, please wait
          </Text>
          <Flex gap="$spacing4" alignItems="center">
            <Text variant="body3" color="$accent1">
              {Number(amount).toLocaleString()} {ASSET_INFO[asset].symbol}
            </Text>
            <Text variant="body4" color="$neutral3">
              → {toAddress.slice(0, 12)}...{toAddress.slice(-6)}
            </Text>
          </Flex>
        </MainCard>
      </div>
    )
  }

  if (step === 'success') {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
      <div style={overlayStyle}>
        <MainCard alignItems="center" gap="$spacing20" pt="$spacing48" pb="$spacing48">
          <Text variant="body2" fontSize={56}>
            ✅
          </Text>
          <Text variant="body2" fontWeight="700" color="$statusSuccess" fontSize={22}>
            Transaction Successful!
          </Text>
          <Flex gap="$spacing4" alignItems="center">
            <Text variant="body3" color="$neutral1">
              {Number(amount).toLocaleString()} {ASSET_INFO[asset].symbol}
            </Text>
            <Text variant="body4" color="$neutral2">
              sent to {toAddress.slice(0, 16)}...
            </Text>
          </Flex>
        </MainCard>
      </div>
    )
  }

  if (step === 'commission-pay') {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
      <div style={overlayStyle}>
        <MainCard gap="$spacing20">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="body2" fontWeight="700" color="$neutral1" fontSize={20}>
              Pay Commission Fee
            </Text>
            <TouchableArea onPress={() => setStep('confirm')}>
              <Text variant="body2" color="$neutral3" fontSize={24}>
                ✕
              </Text>
            </TouchableArea>
          </Flex>

          <Flex backgroundColor="$accent2" borderRadius="$rounded16" p="$spacing16" gap="$spacing8">
            <Text variant="body3" color="$neutral1" textAlign="center">
              Commission: {settings.commissionPercent}% of {Number(amount).toLocaleString()} {ASSET_INFO[asset].symbol}
            </Text>
            <Text variant="heading2" fontWeight="800" color="$accent1" textAlign="center">
              {commission.toLocaleString(undefined, { maximumFractionDigits: 6 })} {ASSET_INFO[asset].symbol}
            </Text>
          </Flex>

          {/* Pay with selector */}
          <Flex gap="$spacing8">
            <Text variant="body4" color="$neutral2" fontWeight="600">
              Pay commission with:
            </Text>
            <Flex row gap="$spacing8" flexWrap="wrap">
              {PAYMENT_ASSETS.map((pa) => {
                const addr = settings.paymentAddresses[pa]
                const available = !!addr
                return (
                  <TouchableArea
                    key={pa}
                    disabled={!available}
                    onPress={() => setCommissionPayAsset(pa)}
                    backgroundColor={commissionPayAsset === pa ? '$accent1' : '$surface3'}
                    px="$spacing16"
                    py="$spacing10"
                    borderRadius="$rounded12"
                    opacity={available ? 1 : 0.3}
                  >
                    <Text variant="buttonLabel3" color="white" fontWeight="600">
                      {pa}
                    </Text>
                  </TouchableArea>
                )
              })}
            </Flex>
          </Flex>

          {commissionAddress ? (
            <>
              {/* QR Code */}
              <Flex
                alignItems="center"
                p="$spacing16"
                backgroundColor="$surface1"
                borderRadius="$rounded20"
                borderWidth={1}
                borderColor="$surface3"
              >
                <SimpleQRCode value={commissionAddress} size={180} />
              </Flex>

              {/* Address + Copy */}
              <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing16" gap="$spacing12">
                <Flex row alignItems="center" justifyContent="space-between">
                  <Text variant="body2" fontWeight="500" color="$neutral1">
                    {commissionPayAsset} Address
                  </Text>
                  <TouchableArea onPress={handleCopyCommissionAddr}>
                    <Flex
                      row
                      alignItems="center"
                      gap="$spacing6"
                      backgroundColor={copied ? '$statusSuccess' : '$accent1'}
                      borderRadius="$rounded12"
                      px="$spacing12"
                      py="$spacing8"
                    >
                      <Text variant="buttonLabel3" color="white">
                        {copied ? '✓ Copied!' : '📋 Copy'}
                      </Text>
                    </Flex>
                  </TouchableArea>
                </Flex>
                <Flex backgroundColor="$surface3" borderRadius="$rounded12" p="$spacing12">
                  <Text
                    variant="body3"
                    fontFamily="$mono"
                    textAlign="center"
                    userSelect="all"
                    color="$neutral1"
                    style={{ wordBreak: 'break-all' }}
                  >
                    {commissionAddress}
                  </Text>
                </Flex>
              </Flex>
            </>
          ) : (
            <Flex backgroundColor="$statusCritical2" borderRadius="$rounded8" p="$spacing12">
              <Text variant="body4" color="$statusCritical">
                No payment address configured for {commissionPayAsset}
              </Text>
            </Flex>
          )}

          <PrimaryButton onPress={handleCommissionPaid} disabled={!commissionAddress}>
            <Text variant="buttonLabel3" color="white" fontWeight="700">
              ✅ I&apos;ve Paid Commission
            </Text>
          </PrimaryButton>
        </MainCard>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
      <div style={overlayStyle}>
        <MainCard gap="$spacing20">
          <Text variant="body2" fontWeight="700" color="$neutral1" textAlign="center" fontSize={20}>
            Confirm Transaction
          </Text>
          <Flex backgroundColor="$surface1" borderRadius="$rounded12" p="$spacing20" gap="$spacing14">
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                Asset
              </Text>
              <Text variant="body3" color="$neutral1" fontWeight="600">
                {ASSET_INFO[asset].symbol} ({ASSET_INFO[asset].network})
              </Text>
            </Flex>
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                Amount
              </Text>
              <Text variant="body3" color="$neutral1" fontWeight="600">
                {Number(amount).toLocaleString()}
              </Text>
            </Flex>
            {commission > 0 && (
              <Flex row justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  Commission ({settings.commissionPercent}%)
                </Text>
                <Text variant="body3" color="$statusWarning" fontWeight="600">
                  {commission.toLocaleString(undefined, { maximumFractionDigits: 6 })} {ASSET_INFO[asset].symbol}
                </Text>
              </Flex>
            )}
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                To
              </Text>
              <Text variant="body4" color="$neutral1">
                {toAddress.slice(0, 16)}...{toAddress.slice(-8)}
              </Text>
            </Flex>
          </Flex>
          <Flex row gap="$spacing12">
            <SecondaryButton flex={1} onPress={() => setStep('form')}>
              <Text variant="buttonLabel3" color="$neutral2" fontWeight="600">
                Cancel
              </Text>
            </SecondaryButton>
            <PrimaryButton flex={1} onPress={handleConfirmSend}>
              <Text variant="buttonLabel3" color="white" fontWeight="700">
                {commission > 0 ? 'Continue' : 'Confirm Send'}
              </Text>
            </PrimaryButton>
          </Flex>
        </MainCard>
      </div>
    )
  }

  return (
    // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
    <div style={overlayStyle}>
      <MainCard gap="$spacing20">
        <Flex row justifyContent="space-between" alignItems="center">
          <Text variant="body2" fontWeight="700" color="$neutral1" fontSize={20}>
            Send Assets
          </Text>
          <TouchableArea onPress={onClose}>
            <Text variant="body2" color="$neutral3" fontSize={24}>
              ✕
            </Text>
          </TouchableArea>
        </Flex>

        {error && (
          <Flex backgroundColor="$statusCritical2" borderRadius="$rounded8" p="$spacing12">
            <Text variant="body4" color="$statusCritical">
              {error}
            </Text>
          </Flex>
        )}

        <Flex gap="$spacing8">
          <Text variant="body4" color="$neutral2" fontWeight="600">
            Asset
          </Text>
          <select style={selectStyle} value={asset} onChange={(e) => setAsset(e.target.value)}>
            {availableAssets.map((a) => (
              <option key={a} value={a}>
                {ASSET_INFO[a].icon} {ASSET_INFO[a].symbol} - {ASSET_INFO[a].network}
              </option>
            ))}
          </select>
        </Flex>

        <Flex gap="$spacing8">
          <Text variant="body4" color="$neutral2" fontWeight="600">
            Amount
          </Text>
          <input
            style={inputStyle}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          {commission > 0 && (
            <Text variant="body4" color="$statusWarning">
              + {commission.toLocaleString(undefined, { maximumFractionDigits: 6 })} {ASSET_INFO[asset].symbol}{' '}
              commission ({settings.commissionPercent}%)
            </Text>
          )}
          {license && settings.mode === 'purchase' && (
            <Text variant="body4" color="$accent1">
              Remaining limit: ${(license.sendLimit - license.totalSent).toLocaleString()}
            </Text>
          )}
        </Flex>

        <Flex gap="$spacing8">
          <Text variant="body4" color="$neutral2" fontWeight="600">
            Destination Address
          </Text>
          <input
            style={inputStyle}
            type="text"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder={asset === 'BTC' ? 'bc1q...' : asset === 'USDC_SOL' ? 'So1...' : '0x...'}
          />
        </Flex>

        <PrimaryButton onPress={handleSend}>
          <Text variant="buttonLabel3" color="white" fontWeight="700">
            Review Send
          </Text>
        </PrimaryButton>
      </MainCard>
    </div>
  )
})

// ─── Claim Modal ─────────────────────────────────────────────────────────────

// Generate a browser fingerprint for claim dedup
function generateFingerprint(): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let canvasHash = ''
  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillText('fingerprint', 2, 2)
    canvasHash = canvas.toDataURL()
  }
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    canvasHash.slice(0, 50),
  ].join('|')
  // Simple hash
  let hash = 0
  for (let i = 0; i < components.length; i++) {
    const char = components.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return 'fp_' + Math.abs(hash).toString(36)
}

const ClaimModal = memo(function ClaimModal({
  settings,
  wallet,
  onClose,
  onSuccess,
}: {
  settings: WatanabeSettings
  wallet: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [asset, setAsset] = useState('USDT_ERC20')
  const [toAddress, setToAddress] = useState('')
  const [step, setStep] = useState<'form' | 'processing' | 'success'>('form')
  const [error, setError] = useState('')

  const handleClaim = useCallback(async () => {
    if (!toAddress.trim()) {
      setError('Enter your receiving address')
      return
    }
    setError('')
    setStep('processing')

    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1500))

    try {
      const fp = generateFingerprint()
      const res = await fetch(`${API}/api/watanabe/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, asset, toAddress: toAddress.trim(), fingerprint: fp }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (data.success) {
        await new Promise((r) => setTimeout(r, 1000))
        setStep('success')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 2000)
      } else {
        setError(data.error || 'Claim failed')
        setStep('form')
      }
    } catch {
      setError('Network error')
      setStep('form')
    }
  }, [toAddress, asset, wallet, onSuccess, onClose])

  if (step === 'processing') {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
      <div style={overlayStyle}>
        <MainCard alignItems="center" gap="$spacing24" pt="$spacing48" pb="$spacing48">
          <Spinner />
          <Text variant="body2" fontWeight="600" color="$neutral1">
            Processing Claim...
          </Text>
        </MainCard>
      </div>
    )
  }

  if (step === 'success') {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
      <div style={overlayStyle}>
        <MainCard alignItems="center" gap="$spacing20" pt="$spacing48" pb="$spacing48">
          <Text variant="body2" fontSize={56}>
            🎉
          </Text>
          <Text variant="body2" fontWeight="700" color="$statusSuccess" fontSize={22}>
            Claim Successful!
          </Text>
          <Text variant="body3" color="$neutral2">
            ${settings.testClaimAmount} {ASSET_INFO[asset].symbol} sent to your address
          </Text>
        </MainCard>
      </div>
    )
  }

  return (
    // biome-ignore lint/correctness/noRestrictedElements: fixed overlay requires div
    <div style={overlayStyle}>
      <MainCard gap="$spacing20">
        <Flex row justifyContent="space-between" alignItems="center">
          <Text variant="body2" fontWeight="700" color="$neutral1" fontSize={20}>
            🎁 Claim Test Transaction
          </Text>
          <TouchableArea onPress={onClose}>
            <Text variant="body2" color="$neutral3" fontSize={24}>
              ✕
            </Text>
          </TouchableArea>
        </Flex>

        <Text variant="body3" color="$neutral2">
          Claim ${settings.testClaimAmount} worth of your selected asset for testing.
        </Text>

        {error && (
          <Flex backgroundColor="$statusCritical2" borderRadius="$rounded8" p="$spacing12">
            <Text variant="body4" color="$statusCritical">
              {error}
            </Text>
          </Flex>
        )}

        <Flex gap="$spacing8">
          <Text variant="body4" color="$neutral2" fontWeight="600">
            Select Asset
          </Text>
          <select style={selectStyle} value={asset} onChange={(e) => setAsset(e.target.value)}>
            {Object.entries(ASSET_INFO).map(([key, info]) => (
              <option key={key} value={key}>
                {info.icon} {info.symbol} - {info.network}
              </option>
            ))}
          </select>
        </Flex>

        <Flex gap="$spacing8">
          <Text variant="body4" color="$neutral2" fontWeight="600">
            Your Receiving Address
          </Text>
          <input
            style={inputStyle}
            type="text"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder={asset === 'BTC' ? 'bc1q...' : asset === 'USDC_SOL' ? 'So1...' : '0x...'}
          />
        </Flex>

        <PrimaryButton onPress={handleClaim}>
          <Text variant="buttonLabel3" color="white" fontWeight="700">
            Claim ${settings.testClaimAmount}
          </Text>
        </PrimaryButton>
      </MainCard>
    </div>
  )
})

// ─── Main Dashboard ──────────────────────────────────────────────────────────
const WatanabeDashboard = memo(function WatanabeDashboard({
  settings,
  wallet,
  isAdmin,
  activeLicense,
}: {
  settings: WatanabeSettings
  wallet: string
  user: WatanabeUser
  isAdmin: boolean
  activeLicense: WatanabeLicense | null
}) {
  const [tab, setTab] = useState<'portfolio' | 'activity'>('portfolio')
  const [transactions, setTransactions] = useState<WatanabeTx[]>([])
  const [showSendModal, setShowSendModal] = useState(false)
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [liveSettings, setLiveSettings] = useState(settings)
  const [liveBalances, setLiveBalances] = useState(settings.balances || {})
  const refreshRef = useRef(0)

  const loadTransactions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/watanabe/transactions/${wallet}`)
      const data = (await res.json()) as { transactions?: WatanabeTx[] }
      setTransactions(data.transactions || [])
    } catch {
      // ignore
    }
  }, [wallet])

  const refreshData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/watanabe/settings`)
      const data = (await res.json()) as WatanabeSettings
      setLiveSettings(data)
      setLiveBalances(data.balances || {})
    } catch {
      // ignore
    }
    await loadTransactions()
  }, [loadTransactions])

  useEffect(() => {
    loadTransactions().catch(() => {})
    const interval = setInterval(() => refreshData().catch(() => {}), 15000)
    return () => clearInterval(interval)
  }, [loadTransactions, refreshData])

  // SSE listener for real-time settings changes in dashboard
  useEffect(() => {
    let alive = true
    let retryCount = 0

    const connect = (): void => {
      if (!alive) {
        return
      }
      const abort = new AbortController()

      fetch(`${API}/api/watanabe/settings/stream`, { signal: abort.signal })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            throw new Error('SSE failed')
          }
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          retryCount = 0

          while (alive) {
            const { done, value } = await reader.read()
            if (done || !alive) {
              break
            }
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const payload = JSON.parse(line.slice(6)) as { testClaimEnabled?: boolean; testClaimAmount?: number }
                  setLiveSettings((prev) => ({
                    ...prev,
                    testClaimEnabled: payload.testClaimEnabled ?? prev.testClaimEnabled,
                    testClaimAmount: payload.testClaimAmount ?? prev.testClaimAmount,
                  }))
                } catch {
                  // ignore
                }
              }
            }
          }
          if (alive) {
            setTimeout(connect, 2000)
          }
        })
        .catch(() => {
          if (!alive) {
            return
          }
          retryCount++
          setTimeout(connect, Math.min(2000 * Math.pow(2, retryCount), 30000))
        })
    }

    connect()
    return () => {
      alive = false
    }
  }, [])

  const handleSendSuccess = useCallback(() => {
    refreshData().catch(() => {})
  }, [refreshData])

  const handleClaimSuccess = useCallback(() => {
    loadTransactions().catch(() => {})
  }, [loadTransactions])

  const formatBalance = (assetKey: string, bal: number): string => {
    if (assetKey === 'BTC') {
      return bal.toFixed(4)
    }
    return bal.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  const totalValue = useMemo(() => {
    const btcPrice = 100000
    const b = liveBalances || {}
    return (
      (b.USDT_ERC20 || 0) +
      (b.USDT_TRC20 || 0) +
      (b.BTC || 0) * btcPrice +
      (b.USDC_SOL || 0)
    )
  }, [liveBalances])

  // suppress unused var
  const _ref = refreshRef

  return (
    <PageContainer>
      <MainCard>
        {/* Header */}
        <Flex gap="$spacing4">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="body2" fontWeight="700" color="$neutral1" fontSize={22}>
              Watanabe Portfolio
            </Text>
            {isAdmin && (
              <Flex backgroundColor="$accent1" borderRadius="$rounded8" px="$spacing10" py="$spacing4">
                <Text variant="body4" fontWeight="700" color="white" fontSize={11}>
                  ADMIN
                </Text>
              </Flex>
            )}
          </Flex>
          <Text variant="body4" color="$neutral3">
            {wallet.slice(0, 8)}...{wallet.slice(-6)}
          </Text>
        </Flex>

        {/* Total Balance */}
        <Flex backgroundColor="$accent2" borderRadius="$rounded16" p="$spacing24" gap="$spacing8">
          <Text variant="body4" color="$neutral1" opacity={0.8}>
            Total Portfolio Value
          </Text>
          <Text variant="body2" fontWeight="800" color="$neutral1" fontSize={36}>
            ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
          {activeLicense && liveSettings.mode === 'purchase' && (
            <Text variant="body4" color="$neutral1" opacity={0.8}>
              📋 {activeLicense.plan} plan • Remaining: $
              {(activeLicense.sendLimit - activeLicense.totalSent).toLocaleString()} • Expires:{' '}
              {new Date(activeLicense.expiresAt || 0).toLocaleDateString()}
            </Text>
          )}
          {liveSettings.mode === 'commission' && !isAdmin && (
            <Text variant="body4" color="$neutral1" opacity={0.8}>
              Commission: {liveSettings.commissionPercent}% per transaction
            </Text>
          )}
        </Flex>

        {/* Action Buttons */}
        <Flex row gap="$spacing12">
          <PrimaryButton flex={1} onPress={() => setShowSendModal(true)}>
            <Text variant="buttonLabel3" color="white" fontWeight="700">
              📤 Send
            </Text>
          </PrimaryButton>
          {liveSettings.testClaimEnabled && (
            <SecondaryButton flex={1} onPress={() => setShowClaimModal(true)}>
              <Text variant="buttonLabel3" color="$accent1" fontWeight="600">
                🎁 Claim Test
              </Text>
            </SecondaryButton>
          )}
        </Flex>

        {/* Tabs */}
        <Flex row gap="$spacing4" borderBottomWidth={1} borderBottomColor="$surface3" pb="$spacing8">
          <TabBtn active={tab === 'portfolio'} onPress={() => setTab('portfolio')}>
            <Text
              variant="buttonLabel3"
              color={tab === 'portfolio' ? 'white' : '$neutral2'}
              fontWeight="600"
              fontSize={14}
            >
              Assets
            </Text>
          </TabBtn>
          <TabBtn active={tab === 'activity'} onPress={() => setTab('activity')}>
            <Text
              variant="buttonLabel3"
              color={tab === 'activity' ? 'white' : '$neutral2'}
              fontWeight="600"
              fontSize={14}
            >
              Activity ({transactions.length})
            </Text>
          </TabBtn>
        </Flex>

        {/* Tab Content */}
        {tab === 'portfolio' ? (
          <Flex gap="$spacing10">
            {Object.entries(ASSET_INFO).map(([key, info]) => {
              const bal = (liveBalances || {})[key] || 0
              const usdValue = key === 'BTC' ? bal * 100000 : bal
              return (
                <AssetRow key={key} onPress={() => setShowSendModal(true)}>
                  <Flex row alignItems="center" gap="$spacing14">
                    <Flex
                      width={44}
                      height={44}
                      borderRadius="$roundedFull"
                      backgroundColor="$surface3"
                      alignItems="center"
                      justifyContent="center"
                      overflow="hidden"
                    >
                      <img
                        src={info.iconUrl}
                        alt={info.symbol}
                        style={{ width: 28, height: 28 }}
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                          ;(e.target as HTMLImageElement).parentElement!.textContent = info.icon
                        }}
                      />
                    </Flex>
                    <Flex>
                      <Text variant="body3" fontWeight="600" color="$neutral1">
                        {info.name}
                      </Text>
                      <Text variant="body4" color="$neutral3">
                        {info.network}
                      </Text>
                    </Flex>
                  </Flex>
                  <Flex alignItems="flex-end">
                    <Text variant="body3" fontWeight="700" color="$neutral1">
                      {formatBalance(key, bal)} {info.symbol}
                    </Text>
                    <Text variant="body4" color="$neutral2">
                      ≈ ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Text>
                  </Flex>
                </AssetRow>
              )
            })}
          </Flex>
        ) : (
          <Flex gap="$spacing8">
            {transactions.length === 0 ? (
              <Flex alignItems="center" p="$spacing32">
                <Text variant="body3" color="$neutral3">
                  No transactions yet
                </Text>
              </Flex>
            ) : (
              transactions.map((tx) => (
                <Flex
                  key={tx.id}
                  backgroundColor="$surface1"
                  borderRadius="$rounded12"
                  p="$spacing14"
                  gap="$spacing8"
                  borderWidth={1}
                  borderColor="$surface3"
                >
                  <Flex row justifyContent="space-between" alignItems="center">
                    <Flex row alignItems="center" gap="$spacing10">
                      <Text variant="body2" fontSize={20}>
                        {tx.txType === 'claim' ? '🎁' : '📤'}
                      </Text>
                      <Flex>
                        <Text variant="body3" fontWeight="600" color="$neutral1">
                          {tx.txType === 'claim' ? 'Test Claim' : 'Send'}
                        </Text>
                        <Text variant="body4" color="$neutral3">
                          {new Date(tx.createdAt).toLocaleString()}
                        </Text>
                      </Flex>
                    </Flex>
                    <Flex alignItems="flex-end">
                      <Text
                        variant="body3"
                        fontWeight="700"
                        color={tx.txType === 'claim' ? '$statusSuccess' : '$statusCritical'}
                      >
                        {tx.txType === 'claim' ? '+' : '-'}
                        {tx.amount.toLocaleString()} {ASSET_INFO[tx.asset].symbol || tx.asset}
                      </Text>
                      <Flex
                        backgroundColor={tx.status === 'completed' ? '$statusSuccess2' : '$accent2'}
                        borderRadius="$rounded8"
                        px="$spacing8"
                        py="$spacing2"
                      >
                        <Text
                          variant="body4"
                          color={tx.status === 'completed' ? '$statusSuccess' : '$accent1'}
                          fontWeight="600"
                          fontSize={10}
                        >
                          {tx.status.toUpperCase()}
                        </Text>
                      </Flex>
                    </Flex>
                  </Flex>
                  <Text variant="body4" color="$neutral3">
                    To: {tx.toAddress.slice(0, 16)}...{tx.toAddress.slice(-8)}
                  </Text>
                  {tx.commissionPaid > 0 && (
                    <Text variant="body4" color="$statusWarning">
                      Commission: {tx.commissionPaid.toLocaleString()} {ASSET_INFO[tx.asset].symbol}
                    </Text>
                  )}
                </Flex>
              ))
            )}
          </Flex>
        )}
      </MainCard>

      {showSendModal && (
        <SendModal
          settings={liveSettings}
          wallet={wallet}
          license={activeLicense}
          onClose={() => setShowSendModal(false)}
          onSuccess={handleSendSuccess}
        />
      )}
      {showClaimModal && (
        <ClaimModal
          settings={liveSettings}
          wallet={wallet}
          onClose={() => setShowClaimModal(false)}
          onSuccess={handleClaimSuccess}
        />
      )}
    </PageContainer>
  )
})

// ─── Commission Gate removed — commission is shown inline during transactions ─

// ─── Blocked Page ────────────────────────────────────────────────────────────
const BlockedPage = memo(function BlockedPage() {
  return (
    <PageContainer>
      <MainCard alignItems="center" gap="$spacing20" pt="$spacing48" pb="$spacing48">
        <Text variant="body2" fontSize={48}>
          🚫
        </Text>
        <Text variant="body2" fontWeight="700" color="$statusCritical" fontSize={22}>
          Access Restricted
        </Text>
        <Text variant="body3" color="$neutral2" textAlign="center">
          Your wallet has been restricted from accessing this service. Contact support for assistance.
        </Text>
      </MainCard>
    </PageContainer>
  )
})

// ─── Main Export ─────────────────────────────────────────────────────────────
export default function WatanabePage(): JSX.Element {
  const account = useAccount()
  const walletAddress = account.address?.toLowerCase() || ''
  const isConnected = account.status === 'connected' && !!walletAddress

  const [settings, setSettings] = useState<WatanabeSettings | null>(null)
  const [user, setUser] = useState<WatanabeUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeLicense, setActiveLicense] = useState<WatanabeLicense | null>(null)
  const [pendingLicense, setPendingLicense] = useState<WatanabeLicense | null>(null)
  const [loading, setLoading] = useState(true)
  const [showClaim, setShowClaim] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const settingsRes = await fetch(`${API}/api/watanabe/settings`)
      const settingsData = (await settingsRes.json()) as WatanabeSettings
      setSettings(settingsData)

      if (!walletAddress) {
        setLoading(false)
        return
      }

      const authRes = await fetch(`${API}/api/watanabe/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
      const authData = (await authRes.json()) as {
        user: WatanabeUser
        isAdmin: boolean
        activeLicense: WatanabeLicense | null
        pendingLicense: WatanabeLicense | null
      }
      setUser(authData.user)
      setIsAdmin(authData.isAdmin)
      setActiveLicense(authData.activeLicense)
      setPendingLicense(authData.pendingLicense)
    } catch {
      // ignore
    }
    setLoading(false)
  }, [walletAddress])

  useEffect(() => {
    loadData().catch(() => {})
  }, [loadData])

  // SSE listener for real-time settings changes (e.g. claim toggle)
  useEffect(() => {
    let alive = true
    let retryCount = 0

    const connect = (): void => {
      if (!alive) {
        return
      }
      const abort = new AbortController()

      fetch(`${API}/api/watanabe/settings/stream`, { signal: abort.signal })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            throw new Error('SSE failed')
          }
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          retryCount = 0

          while (alive) {
            const { done, value } = await reader.read()
            if (done || !alive) {
              break
            }
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const payload = JSON.parse(line.slice(6)) as { testClaimEnabled?: boolean; testClaimAmount?: number }
                  setSettings((prev) => {
                    if (!prev) {
                      return prev
                    }
                    return {
                      ...prev,
                      testClaimEnabled: payload.testClaimEnabled ?? prev.testClaimEnabled,
                      testClaimAmount: payload.testClaimAmount ?? prev.testClaimAmount,
                    }
                  })
                } catch {
                  // ignore malformed
                }
              }
            }
          }
          if (alive) {
            setTimeout(connect, 2000)
          }
        })
        .catch(() => {
          if (!alive) {
            return
          }
          retryCount++
          setTimeout(connect, Math.min(2000 * Math.pow(2, retryCount), 30000))
        })

      // Cleanup on unmount
      return () => {
        abort.abort()
      }
    }

    connect()
    return () => {
      alive = false
    }
  }, [])

  if (!isConnected) {
    return <ConnectWalletGate />
  }

  if (loading || !settings) {
    return (
      <PageContainer>
        <MainCard alignItems="center" gap="$spacing20" pt="$spacing48" pb="$spacing48">
          <Spinner />
          <Text variant="body3" color="$neutral2">
            Loading portfolio...
          </Text>
        </MainCard>
      </PageContainer>
    )
  }

  if (user?.blocked && !isAdmin) {
    return <BlockedPage />
  }

  // Commission mode — go directly to dashboard (no gate), commission shown in SendModal
  // Purchase mode without active license — show paywall
  if (settings.mode === 'purchase' && !isAdmin && !activeLicense) {
    return (
      <>
        <Paywall
          settings={settings}
          wallet={walletAddress}
          pendingLicense={pendingLicense}
          onLicenseCreated={() => loadData().catch(() => {})}
          onClaim={() => setShowClaim(true)}
        />
        {showClaim && settings.testClaimEnabled && (
          <ClaimModal
            settings={settings}
            wallet={walletAddress}
            onClose={() => setShowClaim(false)}
            onSuccess={() => loadData().catch(() => {})}
          />
        )}
      </>
    )
  }

  return (
    <WatanabeDashboard
      settings={settings}
      wallet={walletAddress}
      user={user || { walletAddress, blocked: false, totalSent: 0, createdAt: Date.now(), lastSeen: Date.now() }}
      isAdmin={isAdmin}
      activeLicense={activeLicense}
    />
  )
}
