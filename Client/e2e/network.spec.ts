import { test, expect } from '@playwright/test'

// NetworkStatusWatcher lives at the app root (above the router), so connectivity toasts
// work on any route — including /login, which lets us test without an OIDC round-trip.
test.describe('network drop / reconnect toasts', () => {
  test('offline shows a persistent toast; reconnect clears it and confirms', async ({ page, context }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible({ timeout: 15_000 })

    // Drop the network
    await context.setOffline(true)
    const offlineToast = page.getByText(/no internet connection/i)
    await expect(offlineToast).toBeVisible({ timeout: 10_000 })

    // Persistent: still visible after a while (no auto-dismiss)
    await page.waitForTimeout(5000)
    await expect(offlineToast).toBeVisible()

    // Reconnect
    await context.setOffline(false)
    await expect(page.getByText(/back online/i)).toBeVisible({ timeout: 10_000 })
    await expect(offlineToast).toBeHidden({ timeout: 10_000 })
  })

  test('offline toast can be manually dismissed', async ({ page, context }) => {
    await page.goto('/login')
    await context.setOffline(true)
    await expect(page.getByText(/no internet connection/i)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /close notification/i }).first().click()
    await expect(page.getByText(/no internet connection/i)).toBeHidden({ timeout: 5000 })
    await context.setOffline(false)
  })
})
