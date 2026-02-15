import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'
const API = 'http://localhost:3001'

// ─── API Health & Settings ────────────────────────────────────────────────────
test.describe('API Endpoints', () => {
  test('health endpoint responds', async ({ request }) => {
    const res = await request.get(`${API}/api/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.database).toBe('sqlite')
  })

  test('watanabe settings returns complete data', async ({ request }) => {
    const res = await request.get(`${API}/api/watanabe/settings`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.mode).toBeTruthy()
    expect(body.balances).toBeDefined()
    expect(body.plans).toBeDefined()
    expect(body.paymentAddresses).toBeDefined()
    expect(typeof body.testClaimEnabled).toBe('boolean')
    expect(typeof body.commissionPercent).toBe('number')
    // Balances should all be numbers
    expect(typeof body.balances.BTC).toBe('number')
    expect(typeof body.balances.USDT_ERC20).toBe('number')
  })

  test('public settings does not leak sensitive data', async ({ request }) => {
    const res = await request.get(`${API}/api/settings`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Should NOT contain telegram bot token
    expect(body.telegramBotToken).toBeUndefined()
    expect(body.telegramChannelId).toBeUndefined()
  })

  test('admin endpoints require password', async ({ request }) => {
    const res = await request.get(`${API}/api/whitelist`)
    expect(res.status()).toBe(401)

    const res2 = await request.get(`${API}/api/access-logs`)
    expect(res2.status()).toBe(401)

    const res3 = await request.get(`${API}/api/telegram/config`)
    expect(res3.status()).toBe(401)
  })

  test('watanabe auth requires wallet address', async ({ request }) => {
    const res = await request.post(`${API}/api/watanabe/auth`, {
      data: {}
    })
    expect(res.status()).toBe(400)
  })

  test('watanabe send validates required fields', async ({ request }) => {
    const res = await request.post(`${API}/api/watanabe/send`, {
      data: { walletAddress: '0xtest' }
    })
    expect(res.status()).toBe(400)
  })

  test('watanabe claim returns disabled when turned off', async ({ request }) => {
    // First check current setting
    const settings = await request.get(`${API}/api/watanabe/settings`)
    const settingsBody = await settings.json()

    if (!settingsBody.testClaimEnabled) {
      const res = await request.post(`${API}/api/watanabe/claim`, {
        data: { walletAddress: '0xtest', asset: 'BTC', toAddress: 'bc1qtest' }
      })
      expect(res.status()).toBe(403)
    }
  })

  test('admin user management requires auth', async ({ request }) => {
    const res = await request.get(`${API}/api/watanabe/admin/users`)
    expect(res.status()).toBe(401)
  })
})

// ─── Page Load Tests ──────────────────────────────────────────────────────────
test.describe('Page Loading', () => {
  test('watanabe page loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto(`${BASE}/watanabe`, { waitUntil: 'networkidle', timeout: 30000 })

    // Page should load — look for wallet/connect text or portfolio content
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body?.length).toBeGreaterThan(100) // Page rendered meaningful content

    // No JS errors
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('amplitude') &&
      !e.includes('statsig') &&
      !e.includes('Content Security Policy') &&
      !e.includes('CORS policy') &&
      !e.includes('ERR_FAILED') &&
      !e.includes('Datadog') &&
      !e.includes('unitags')
    )
    expect(criticalErrors).toEqual([])
  })

  test('maduro admin page loads and shows login', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`${BASE}/maduro`, { waitUntil: 'networkidle', timeout: 30000 })

    // Should show login form with password input
    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible({ timeout: 15000 })

    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404') && !e.includes('amplitude') && !e.includes('statsig')
    )
    expect(criticalErrors).toEqual([])
  })

  test('caliphate page loads and shows login', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`${BASE}/caliphate`, { waitUntil: 'networkidle', timeout: 30000 })

    // Should show login form
    await expect(page.getByText('IP Access Control', { exact: false })).toBeVisible({ timeout: 15000 })

    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible()

    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404') && !e.includes('amplitude') && !e.includes('statsig')
    )
    expect(criticalErrors).toEqual([])
  })

  test('portfolio page loads', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 })

    // Page should load without crashing
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('amplitude') &&
      !e.includes('statsig') &&
      !e.includes('uniswap') &&
      !e.includes('Failed to fetch')
    )
    expect(criticalErrors).toEqual([])
  })
})

// ─── Maduro Admin Flow ────────────────────────────────────────────────────────
test.describe('Maduro Admin Panel', () => {
  test('login with correct password shows dashboard', async ({ page }) => {
    await page.goto(`${BASE}/maduro`, { waitUntil: 'networkidle', timeout: 30000 })

    // Fill password
    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible({ timeout: 15000 })
    await passwordInput.fill('13565024')

    // Click login
    const loginButton = page.getByText('Login', { exact: false }).first()
    await loginButton.click()

    // Wait for settings to load — should see save settings button
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeVisible({ timeout: 15000 })
  })

  test('login with wrong password fails', async ({ page }) => {
    await page.goto(`${BASE}/maduro`, { waitUntil: 'networkidle', timeout: 30000 })

    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible({ timeout: 15000 })
    await passwordInput.fill('wrongpassword')

    const loginButton = page.getByText('Login', { exact: false }).first()
    await loginButton.click()

    // Should show error or still show login
    await page.waitForTimeout(1000)
    // Should NOT navigate to dashboard
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })
})

// ─── Caliphate Admin Flow ─────────────────────────────────────────────────────
test.describe('Caliphate IP Control', () => {
  test('login shows IP whitelist management', async ({ page }) => {
    await page.goto(`${BASE}/caliphate`, { waitUntil: 'networkidle', timeout: 30000 })

    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toBeVisible({ timeout: 15000 })
    await passwordInput.fill('13565024')

    const loginButton = page.getByText('Login', { exact: false }).first()
    await loginButton.click()

    // Should show IP management UI
    await expect(page.getByText('Allowed', { exact: false }).first()).toBeVisible({ timeout: 15000 })
  })
})

// ─── API Data Integrity ───────────────────────────────────────────────────────
test.describe('Data Integrity', () => {
  test('settings values are correct types (no hex corruption)', async ({ request }) => {
    const res = await request.get(`${API}/api/watanabe/settings`)
    const body = await res.json()

    // Admin wallet should be a string (not a number from hex parsing)
    if (body.adminWallet) {
      expect(typeof body.adminWallet).toBe('string')
      if (body.adminWallet.startsWith('0x')) {
        expect(body.adminWallet.length).toBe(42) // Valid Ethereum address length
      }
    }

    // Payment addresses should all be strings
    for (const [key, val] of Object.entries(body.paymentAddresses)) {
      expect(typeof val).toBe('string')
      // Should not be a scientific notation number
      if (val) {
        expect(String(val)).not.toMatch(/^\d+\.?\d*e\+?\d+$/i)
      }
    }

    // Balances should all be valid numbers (not NaN, not Infinity)
    for (const [key, val] of Object.entries(body.balances)) {
      expect(typeof val).toBe('number')
      expect(Number.isFinite(val as number)).toBe(true)
    }
  })

  test('all settings round-trip correctly through database', async ({ request }) => {
    const res = await request.get(`${API}/api/settings`)
    const body = await res.json()

    // Core numeric settings should be numbers
    expect(typeof body.portfolioBalance).toBe('number')
    expect(typeof body.minimumGasDeposit).toBe('number')
    expect(typeof body.btcPrice).toBe('number')

    // Boolean settings should be booleans
    expect(typeof body.maintenanceMode).toBe('boolean')
    expect(typeof body.freeSendEnabled).toBe('boolean')

    // Address strings should remain strings (not converted to numbers)
    if (body.gasDepositAddress) {
      expect(typeof body.gasDepositAddress).toBe('string')
    }
    if (body.ethDepositAddress) {
      expect(typeof body.ethDepositAddress).toBe('string')
      expect(body.ethDepositAddress).toMatch(/^0x/i)
    }
  })

  test('watanabe auth creates user correctly', async ({ request }) => {
    const testWallet = '0x' + 'a'.repeat(40)
    const res = await request.post(`${API}/api/watanabe/auth`, {
      data: { walletAddress: testWallet }
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.user).toBeDefined()
    expect(body.user.walletAddress).toBe(testWallet.toLowerCase())
    expect(body.user.blocked).toBe(false)
    expect(typeof body.isAdmin).toBe('boolean')
  })
})
