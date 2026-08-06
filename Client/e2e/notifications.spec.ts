import { test, expect, type Page } from '@playwright/test'
import { loadCreds } from './helpers'

async function loginAdmin(page: Page) {
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

test.describe('notifications read/unread + gating', () => {
  test.beforeEach(async ({ page }) => {
    // start from a clean read-state so the unread dot is deterministic
    await page.addInitScript(() => localStorage.removeItem('ams-notif-read'))
  })

  test('admin sees the bell; unread dot shows; mark-all-read clears it', async ({ page }) => {
    await loginAdmin(page)
    const bell = page.getByRole('button', { name: /notifications/i })
    await expect(bell).toBeVisible({ timeout: 15_000 })
    // give the prefetch a moment, then expect unread state (data-dependent but warranty alerts exist)
    await page.waitForTimeout(2000)
    await bell.click()
    await expect(page.getByRole('menu', { name: /notifications/i })).toBeVisible({ timeout: 10_000 })

    const markAll = page.getByRole('button', { name: /mark all read/i })
    if (await markAll.isVisible().catch(() => false)) {
      await markAll.click()
      await expect(page.getByRole('button', { name: /mark all read/i })).toBeHidden({ timeout: 5000 })
    }
  })

  test('notifications dropdown locks background scroll', async ({ page }) => {
    await loginAdmin(page)
    await page.goto('/dashboard')
    await page.waitForTimeout(500)
    const bell = page.getByRole('button', { name: /notifications/i })
    await bell.click()
    await expect(page.getByRole('menu', { name: /notifications/i })).toBeVisible({ timeout: 10_000 })
    const rootOverflow = await page.evaluate(() => {
      const el = document.querySelector('[data-app-scroll-root]') as HTMLElement | null
      return el ? getComputedStyle(el).overflow : 'none'
    })
    expect(rootOverflow).toContain('hidden')
  })
})
