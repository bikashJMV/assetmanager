import { test, expect, type Page } from '@playwright/test'
import { loadCreds } from './helpers'

// 1x1 transparent PNG (~68 bytes) — a valid small image well under 50 KB.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function loginToSettings(page: Page) {
  const { username, password } = loadCreds()
  await page.goto('/')
  await page.getByRole('button', { name: /sign in/i }).first().click()
  await page.waitForURL(/auth\.rokkalabs\.com/, { timeout: 30_000 })
  await page.getByRole('textbox', { name: /username or email/i }).fill(username)
  await page.getByRole('textbox', { name: /^password$/i }).fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(/localhost:11000/, { timeout: 45_000 })
  await page.getByRole('link', { name: /^settings$/i }).first().click()
  await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible({ timeout: 20_000 })
}

test('profile image uploads and persists across hard reload (server-backed)', async ({ page }) => {
  await loginToSettings(page)
  await page.setInputFiles('input[type="file"]', { name: 'me.png', mimeType: 'image/png', buffer: TINY_PNG })
  await expect(page.getByText(/profile image updated/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('img', { name: /profile/i }).first()).toBeVisible()

  // hard reload — a new browser render fetches the avatar from the server, not localStorage
  await page.reload()
  await page.getByRole('link', { name: /^settings$/i }).first().click()
  await expect(page.getByRole('img', { name: /profile/i }).first()).toBeVisible({ timeout: 20_000 })
})

test('profile image over 50 KB is rejected', async ({ page }) => {
  await loginToSettings(page)
  const big = Buffer.alloc(51 * 1024, 1) // 51 KB
  await page.setInputFiles('input[type="file"]', { name: 'big.png', mimeType: 'image/png', buffer: big })
  await expect(page.getByText(/50 KB or smaller/i)).toBeVisible({ timeout: 10_000 })
})
