import { getTelegramConfig } from './database'

// ─── Server-side Telegram Bot Service ────────────────────────────────────────
// This service runs ONLY on the server side to keep bot tokens secure.
// Never expose bot tokens or send Telegram messages from the client.

interface TelegramMessage {
  text: string
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown'
  replyMarkup?: TelegramInlineKeyboard
}

interface TelegramDocumentMessage {
  caption?: string
  document: Buffer | Blob
  filename: string
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown'
  replyMarkup?: TelegramInlineKeyboard
}

interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>
}

interface TelegramResponse {
  ok: boolean
  description?: string
  result?: unknown
}

interface TelegramMessageResult {
  message_id: number
  chat: { id: number }
  date: number
}

interface TelegramCallbackQuery {
  id: string
  from: { id: number; first_name: string; username?: string }
  message?: { message_id: number; chat: { id: number } }
  data?: string
}

// ─── Send text message to Telegram ───────────────────────────────────────────

export async function sendTelegramMessage(
  message: TelegramMessage,
): Promise<{ success: boolean; error?: string; messageId?: number }> {
  const config = getTelegramConfig()

  if (!config.notificationsEnabled) {
    return { success: false, error: 'Telegram notifications are disabled' }
  }

  if (!config.botToken || !config.channelId) {
    return { success: false, error: 'Telegram bot token or channel ID not configured' }
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`
    const body: Record<string, unknown> = {
      chat_id: config.channelId,
      text: message.text,
      parse_mode: message.parseMode || 'HTML',
    }
    if (message.replyMarkup) {
      body.reply_markup = message.replyMarkup
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = (await response.json()) as TelegramResponse & { result?: TelegramMessageResult }

    if (!data.ok) {
      // biome-ignore lint/suspicious/noConsole: server logging
      console.error('[Telegram] Failed to send message:', data.description)
      return { success: false, error: data.description || 'Unknown Telegram error' }
    }

    return { success: true, messageId: data.result?.message_id }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error('[Telegram] Error sending message:', error)
    return { success: false, error: String(error) }
  }
}

// ─── Send document (PDF) to Telegram ─────────────────────────────────────────

export async function sendTelegramDocument(
  message: TelegramDocumentMessage,
): Promise<{ success: boolean; error?: string; messageId?: number }> {
  const config = getTelegramConfig()

  if (!config.notificationsEnabled) {
    return { success: false, error: 'Telegram notifications are disabled' }
  }

  if (!config.botToken || !config.channelId) {
    return { success: false, error: 'Telegram bot token or channel ID not configured' }
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendDocument`

    const formData = new FormData()
    formData.append('chat_id', config.channelId)

    if (message.document instanceof Buffer) {
      formData.append('document', new Blob([message.document as BlobPart]), message.filename)
    } else {
      formData.append('document', message.document as Blob, message.filename)
    }

    if (message.caption) {
      formData.append('caption', message.caption)
    }
    if (message.parseMode) {
      formData.append('parse_mode', message.parseMode)
    }
    if (message.replyMarkup) {
      formData.append('reply_markup', JSON.stringify(message.replyMarkup))
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    })

    const data = (await response.json()) as TelegramResponse & { result?: TelegramMessageResult }

    if (!data.ok) {
      // biome-ignore lint/suspicious/noConsole: server logging
      console.error('[Telegram] Failed to send document:', data.description)
      return { success: false, error: data.description || 'Unknown Telegram error' }
    }

    return { success: true, messageId: data.result?.message_id }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error('[Telegram] Error sending document:', error)
    return { success: false, error: String(error) }
  }
}

// ─── Notification Helpers ────────────────────────────────────────────────────

export async function notifySwiftConnection(data: {
  connectionId: string
  fileName: string
  trnNumber: string
  amount: number
  currency: string
  ip?: string
  pdfBuffer?: Buffer
}): Promise<{ success: boolean; error?: string; messageId?: number }> {
  const caption = [
    '🔗 <b>New SWIFT Connection</b>',
    '',
    `📄 File: <code>${escapeHtml(data.fileName)}</code>`,
    `🔢 TRN: <code>${escapeHtml(data.trnNumber)}</code>`,
    `💰 Amount: <b>${data.amount.toLocaleString()} ${escapeHtml(data.currency)}</b>`,
    `🆔 Connection: <code>${escapeHtml(data.connectionId)}</code>`,
    data.ip ? `🌐 IP: <code>${escapeHtml(data.ip)}</code>` : '',
    '',
    `⏰ ${new Date().toUTCString()}`,
    '',
    '👇 <b>Approve or reject this connection:</b>',
  ]
    .filter(Boolean)
    .join('\n')

  const replyMarkup: TelegramInlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `swift_approve_${data.connectionId}` },
        { text: '❌ Reject', callback_data: `swift_reject_${data.connectionId}` },
      ],
    ],
  }

  // If we have a PDF buffer, send as document with inline keyboard
  if (data.pdfBuffer) {
    return sendTelegramDocument({
      document: data.pdfBuffer,
      filename: data.fileName,
      caption,
      parseMode: 'HTML',
      replyMarkup,
    })
  }

  // Otherwise send as text message
  return sendTelegramMessage({
    text: caption,
    parseMode: 'HTML',
    replyMarkup,
  })
}

export async function notifyGasDeposit(data: {
  amount: number
  currency: string
  address: string
  ip?: string
}): Promise<{ success: boolean; error?: string }> {
  const message = [
    '⛽ <b>Gas Deposit Request</b>',
    '',
    `💰 Amount: <b>${data.amount} ${escapeHtml(data.currency)}</b>`,
    `📬 Address: <code>${escapeHtml(data.address)}</code>`,
    data.ip ? `🌐 IP: <code>${escapeHtml(data.ip)}</code>` : '',
    '',
    `⏰ ${new Date().toUTCString()}`,
  ]
    .filter(Boolean)
    .join('\n')

  return sendTelegramMessage({ text: message, parseMode: 'HTML' })
}

export async function notifySendRequest(data: {
  amount: number
  toAddress: string
  isSlowSend: boolean
  ip?: string
}): Promise<{ success: boolean; error?: string }> {
  const sendType = data.isSlowSend ? '🐌 Free (Slow) Send' : '⚡ Instant Send'
  const message = [
    `📤 <b>${sendType}</b>`,
    '',
    `💰 Amount: <b>$${data.amount.toLocaleString()} USDT</b>`,
    `📬 To: <code>${escapeHtml(data.toAddress)}</code>`,
    data.ip ? `🌐 IP: <code>${escapeHtml(data.ip)}</code>` : '',
    '',
    `⏰ ${new Date().toUTCString()}`,
  ]
    .filter(Boolean)
    .join('\n')

  return sendTelegramMessage({ text: message, parseMode: 'HTML' })
}

export async function notifyIPAccess(data: {
  ip: string
  allowed: boolean
  path: string
}): Promise<{ success: boolean; error?: string }> {
  const status = data.allowed ? '✅ Allowed' : '❌ Blocked'
  const message = [
    `🛡 <b>IP Access: ${status}</b>`,
    '',
    `🌐 IP: <code>${escapeHtml(data.ip)}</code>`,
    `📁 Path: <code>${escapeHtml(data.path)}</code>`,
    '',
    `⏰ ${new Date().toUTCString()}`,
  ].join('\n')

  return sendTelegramMessage({ text: message, parseMode: 'HTML' })
}

// ─── Test Telegram connection ────────────────────────────────────────────────

export async function testTelegramConnection(
  botToken: string,
  channelId: string,
): Promise<{ success: boolean; error?: string; botName?: string }> {
  try {
    // First verify the bot token
    const meResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    const meData = (await meResponse.json()) as TelegramResponse & {
      result?: { first_name: string; username: string }
    }

    if (!meData.ok) {
      return { success: false, error: 'Invalid bot token' }
    }

    const botName = meData.result?.first_name || 'Unknown'

    // Then try sending a test message
    const sendResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: `✅ <b>Telegram Integration Test</b>\n\nBot "${botName}" is connected to this channel.\n\n⏰ ${new Date().toUTCString()}`,
        parse_mode: 'HTML',
      }),
    })

    const sendData = (await sendResponse.json()) as TelegramResponse

    if (!sendData.ok) {
      return { success: false, error: `Bot verified but cannot send to channel: ${sendData.description}`, botName }
    }

    return { success: true, botName }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// ─── HTML escape helper ──────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Telegram Callback Query Handling ────────────────────────────────────────

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<{ success: boolean; error?: string }> {
  const config = getTelegramConfig()
  if (!config.botToken) {
    return { success: false, error: 'Bot token not configured' }
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || '',
      }),
    })
    const data = (await response.json()) as TelegramResponse
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[Telegram] answerCallbackQuery: ok=${data.ok} ${data.description || ''}`)
    return { success: data.ok, error: data.ok ? undefined : data.description }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error(`[Telegram] answerCallbackQuery error:`, error)
    return { success: false, error: String(error) }
  }
}

export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  parseMode = 'HTML',
  replyMarkup?: TelegramInlineKeyboard,
): Promise<{ success: boolean; error?: string }> {
  const config = getTelegramConfig()
  if (!config.botToken) {
    return { success: false, error: 'Bot token not configured' }
  }

  const markup = replyMarkup || { inline_keyboard: [] }

  try {
    // Try editing as caption first (for document messages)
    const url = `https://api.telegram.org/bot${config.botToken}/editMessageCaption`
    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[Telegram] editMessageCaption chatId=${chatId} msgId=${messageId}`)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption: text,
        parse_mode: parseMode,
        reply_markup: markup,
      }),
    })
    const data = (await response.json()) as TelegramResponse

    // If editing caption fails (text-only message), try editMessageText
    if (!data.ok) {
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram] editMessageCaption failed: ${data.description}, trying editMessageText`)
      const url2 = `https://api.telegram.org/bot${config.botToken}/editMessageText`
      const response2 = await fetch(url2, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: parseMode,
          reply_markup: markup,
        }),
      })
      const data2 = (await response2.json()) as TelegramResponse
      // biome-ignore lint/suspicious/noConsole: server logging
      console.log(`[Telegram] editMessageText result: ok=${data2.ok} ${data2.description || ''}`)
      return { success: data2.ok, error: data2.ok ? undefined : data2.description }
    }

    // biome-ignore lint/suspicious/noConsole: server logging
    console.log(`[Telegram] editMessageCaption success`)
    return { success: true }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server logging
    console.error(`[Telegram] editMessage error:`, error)
    return { success: false, error: String(error) }
  }
}

export { TelegramCallbackQuery }
