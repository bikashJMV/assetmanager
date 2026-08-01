import { test, expect, type Page } from '@playwright/test'
import { loadCreds } from './helpers'

const WIDTHS = [375, 768, 1280, 1536]
// Admin-reachable in-app routes (client-side nav to avoid the /assets nginx hard-nav quirk).
const NAV = [
  { link: /^assets$/i, url: /\/assets/ },
  { link: /^employees$/i, url: /\/employee/ },
  { link: /^analysis$/i, url: /\/analysis/ },
  { link: /^settings$/i, url: /\/settings/ },
]

async function assertNoOverflow(page: Page, label: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 850 })
    await page.waitForTimeout(250)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    expect(overflow, `${label} @ ${w}px must not scroll horizontally`).toBeFalsy()
  }
}

test('responsive: no horizontal overflow across key screens x widths', async ({ page }) => {
  // public pages first (no login)
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible({ timeout: 15_000 })
  await assertNoOverflow(page, 'login')

  const { username, password } = loadCreds()
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/')
  await page.getByRole('button', { name: /sign in/i }).first().click()
  await page.waitForURL(/auth\.rokkalabs\.com/, { timeout: 30_000 })
  await page.getByRole('textbox', { name: /username or email/i }).fill(username)
  await page.getByRole('textbox', { name: /^password$/i }).fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(/localhost:11000/, { timeout: 45_000 })
  await expect(page.getByRole('banner')).toBeVisible({ timeout: 20_000 })
  await assertNoOverflow(page, 'dashboard')

  for (const target of NAV) {
    await page.setViewportSize({ width: 1280, height: 850 })
    await page.getByRole('link', { name: target.link }).first().click()
    await expect(page).toHaveURL(target.url, { timeout: 15_000 })
    await page.waitForTimeout(800)
    await assertNoOverflow(page, target.url.source)
  }
})
