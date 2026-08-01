import { test, expect } from '@playwright/test'
import { loadCreds } from './helpers'

test.describe('login-first base url + real credential sign-in', () => {
  test('guest hitting base url lands on the login form', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('public QR scan route stays reachable without auth', async ({ page }) => {
    // regression guard for the login-first change: printed QR labels must keep working
    const res = await page.goto('/scan/some-tag')
    expect(res?.ok()).toBeTruthy()
    await expect(page).toHaveURL(/\/scan\//)
  })

  test('full OIDC login with real credentials reaches the dashboard', async ({ page }) => {
    const { username, password } = loadCreds()

    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    // SignInScreen -> authNexus hosted login (redirect leaves our origin)
    await page.getByRole('button', { name: /sign in/i }).first().click()
    await page.waitForURL(/auth\.rokkalabs\.com/, { timeout: 30_000 })

    // authNexus hosted form: single-step "Username or Email" + "Password" + "Sign In".
    // Role-based locators — the page also carries a HIDDEN mobile duplicate (#mob-username)
    // that CSS selectors match first.
    const userInput = page.getByRole('textbox', { name: /username or email/i })
    await userInput.waitFor({ state: 'visible', timeout: 30_000 })
    await userInput.fill(username)
    await page.getByRole('textbox', { name: /^password$/i }).fill(password)
    await page.getByRole('button', { name: /^sign in$/i }).click()

    // back on our origin: /callback verifies with the backend, then dashboard
    await page.waitForURL(/localhost:11000/, { timeout: 45_000 })
    await expect(page).toHaveURL(/\/dashboard|\/$/, { timeout: 30_000 })
    // callback gating passed => authenticated UI visible (sign-out affordance in the top bar)
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 15_000 })

    // base url now routes the AUTHENTICATED user to the dashboard, not the login form
    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  })
})
