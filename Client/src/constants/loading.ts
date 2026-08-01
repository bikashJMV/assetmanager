/**
 * Every user-facing "work in progress" string in the app.
 *
 * House style: sentence case, Unicode ellipsis (…) never ASCII "...", and the verb
 * describes what the app is doing ("Saving…"), not what the user should do.
 * Enforced by loading.test.ts.
 */
export const ELLIPSIS = '…'

export const LOADING = {
  /* generic */
  DEFAULT: `Loading${ELLIPSIS}`,
  PLEASE_WAIT: `Please wait${ELLIPSIS}`,

  /* access checks — authNexus sign-in/callback screens are human-owned and keep their
     own copy on purpose (see .claude/context/auth-bff.md); nothing here feeds them. */
  CHECKING_ADMIN_ACCESS: `Checking admin access${ELLIPSIS}`,

  /* reads */
  ASSET: `Loading asset${ELLIPSIS}`,
  ASSETS: `Loading assets${ELLIPSIS}`,
  CATEGORIES: `Loading categories${ELLIPSIS}`,
  LOGS: `Loading logs${ELLIPSIS}`,
  NOTIFICATIONS: `Loading notifications${ELLIPSIS}`,

  /* writes */
  SAVING: `Saving${ELLIPSIS}`,
  SAVING_ASSETS: `Saving assets${ELLIPSIS} do not close this window.`,
  SAVING_EMPLOYEES: `Saving employees${ELLIPSIS}`,
  PROCESSING_ROWS: `Processing rows${ELLIPSIS}`,
  GENERATING: `Generating${ELLIPSIS}`,

  /* transfers */
  DOWNLOADING: `Downloading${ELLIPSIS}`,
  EXPORTING: `Exporting${ELLIPSIS}`,
  PREPARING_PDF: `Preparing PDF${ELLIPSIS}`,
  PREPARING_QR: `Preparing QR${ELLIPSIS}`,
  PREPARING_QR_DOWNLOADS: `Preparing QR downloads${ELLIPSIS}`,
  EXPORT_IN_PROGRESS: `An export is already in progress. Please wait${ELLIPSIS}`,

  /* refresh */
  REFRESHING: `Refreshing${ELLIPSIS}`,
  REFRESHING_ASSETS: `Refreshing assets${ELLIPSIS}`,
  REFRESHING_NOTIFICATIONS: `Refreshing notifications${ELLIPSIS}`,
} as const

export type LoadingMessage = (typeof LOADING)[keyof typeof LOADING]
