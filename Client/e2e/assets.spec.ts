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

// NOTE: navigate to /assets via the in-app sidebar link (client-side routing), NOT
// page.goto('/assets'). A full-page load of /assets hits a pre-existing nginx bug:
// try_files matches the physical build dir dist/assets/ and 301-redirects to
// http://localhost/assets/ (port dropped) => connection refused. See rule-debt.md.
async function gotoAssets(page: Page) {
  await page.getByRole('link', { name: /^assets$/i }).first().click()
  await expect(page).toHaveURL(/\/assets(\?|$)/, { timeout: 15_000 })
}

test.describe('assets page (post-refactor smoke)', () => {
  test('list renders with toolbar, table, and data/empty state', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAssets(page)
    await expect(page.getByRole('textbox', { name: /search assets/i })).toBeVisible({ timeout: 20_000 })
    // admin sees the table header; if there is data at least one row renders
    await expect(page.getByRole('columnheader', { name: /asset tag/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
  })

  test('search input updates the URL query', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAssets(page)
    await page.getByRole('textbox', { name: /search assets/i }).fill('JMV')
    await expect(page).toHaveURL(/search=JMV/, { timeout: 5000 })
  })

  test('hard navigation / refresh on /assets no longer 301s to a dead port', async ({ page }) => {
    // Regression guard for the nginx dist/assets/ collision (fixed via Vite build.assetsDir:'static').
    const res = await page.goto('/assets')
    expect(res?.status(), 'direct GET /assets must not redirect to a portless host').toBeLessThan(300)
    await expect(page).toHaveURL(/localhost:11000\/(assets|login)/)
  })

  test('inventory-status filter deselects when the selected option is re-clicked', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAssets(page)
    await page.getByRole('button', { name: /filter/i }).first().click()
    const statusTrigger = page.getByRole('button', { name: /filter by inventory status/i })
    await statusTrigger.click()
    await page.getByRole('option', { name: /^assigned$/i }).click()
    await expect(statusTrigger).toContainText(/assigned/i)
    // re-clicking the already-selected option toggles back to the neutral "All" value
    await statusTrigger.click()
    await page.getByRole('option', { name: /^assigned$/i }).click()
    await expect(statusTrigger).toContainText(/all inventory status/i)
  })
})
