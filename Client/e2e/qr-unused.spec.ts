import { test, expect, type Page } from '@playwright/test'
import { loadCreds } from './helpers'

async function loginAsAdmin(page: Page) {
  const { username, password } = loadCreds()
  await page.goto('/')
  await page.getByRole('button', { name: /sign in/i }).first().click()
  await page.waitForURL(/auth\.rokkalabs\.com/, { timeout: 30_000 })
  await page.getByRole('textbox', { name: /username or email/i }).fill(username)
  await page.getByRole('textbox', { name: /^password$/i }).fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(/localhost:11000/, { timeout: 45_000 })
  await expect(page.getByRole('banner')).toBeVisible({ timeout: 20_000 })
}

test.describe('QR batches — unused QR single-click PDF', () => {
  test('one click downloads a PDF of all unused QRs', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: /^qr batches$/i }).first().click()
    await expect(page).toHaveURL(/\/qr/, { timeout: 15_000 })

    const btn = page.getByRole('button', { name: /unused qrs/i })
    await expect(btn).toBeVisible({ timeout: 20_000 })

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await btn.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
  })
})
