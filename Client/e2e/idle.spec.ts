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

test.describe('idle auto-logout', () => {
  test.beforeEach(async ({ page }) => {
    // Shorten idle/warning to seconds for the test (prod stays 10min/2min).
    await page.addInitScript(() => {
      ;(window as unknown as { __AMS_IDLE__: unknown }).__AMS_IDLE__ = { idleMs: 2000, warningMs: 6000 }
    })
  })

  test('warning appears after idle; Stay keeps the session', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByRole('dialog').getByText(/you are not active/i)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/auto logout in/i)).toBeVisible()
    await page.getByRole('button', { name: /stay signed in/i }).click()
    await expect(page.getByText(/you are not active/i)).toBeHidden({ timeout: 5000 })
    // still on an app route, not bounced to login
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('no response within the window → auto logout to /login', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByText(/you are not active/i)).toBeVisible({ timeout: 8000 })
    // do nothing; after warningMs the app calls signout — which leaves the app for the
    // OIDC end-session endpoint (authNexus) and ultimately /login.
    await expect(page).toHaveURL(/\/login|auth\.rokkalabs\.com/, { timeout: 25_000 })
  })
})
