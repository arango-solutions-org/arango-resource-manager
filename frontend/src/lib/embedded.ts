/**
 * True when the app runs inside another page, as it does in the Arango Platform
 * UI, which already draws the sidebar and the logo. The app then leaves both
 * out and shows its pages as tabs instead.
 */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // A cross-origin parent refuses access to window.top: that is embedding too.
    return true
  }
}
