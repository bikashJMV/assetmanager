import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Read credentials from Server/.env (same source the live pytest suite uses) —
 * never hardcode credentials in test files. Env vars override. */
export function loadCreds(): { username: string; password: string } {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const envPath = path.resolve(here, '..', '..', 'Server', '.env')
  const values: Record<string, string> = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m) values[m[1]] = m[2]
    }
  }
  const username = process.env.AMS_E2E_USER ?? values.AUTHNEXUS_ADMIN_USER
  const password = process.env.AMS_E2E_PASSWORD ?? values.AUTHNEXUS_ADMIN_PASSWORD
  if (!username || !password) {
    throw new Error('No credentials: set AMS_E2E_USER/AMS_E2E_PASSWORD or AUTHNEXUS_ADMIN_* in Server/.env')
  }
  return { username, password }
}
