// Links opened from Facebook, Instagram, LinkedIn and other apps load in the app's own built-in browser (a
// webview). Google doesn't allow "Sign in with Google" there: the sign-in window fails (people see "Access
// blocked: Authorization Error"). So in those browsers the sign-in screen asks people to open NilObs in Safari or
// Chrome, with a button that does it where the platform allows, and a link to copy. Pure functions, tested in
// app/tests/inapp.test.mjs.

export type InApp = { app: string; os: "ios" | "android" | "other" }

const APPS: [RegExp, string][] = [
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A|FBSN|FBDV/, "Facebook"],
  [/Instagram/, "Instagram"],
  [/LinkedInApp/, "LinkedIn"],
  [/\bLine\//, "LINE"],
  [/BytedanceWebview|musical_ly|TikTok|trill_/i, "TikTok"],
  [/Snapchat/, "Snapchat"],
  [/Pinterest/, "Pinterest"],
  [/MicroMessenger/, "WeChat"],
  [/Twitter/, "X"],
]

/** Which app's built-in browser this is, or null in a real browser (Safari, Chrome, Firefox, Edge…). */
export function inAppBrowser(ua: string): InApp | null {
  const s = String(ua || "")
  const os = /iPhone|iPad|iPod/.test(s) ? "ios" : /Android/.test(s) ? "android" : "other"
  for (const [re, app] of APPS) if (re.test(s)) return { app, os }
  // a bare Android webview inside some other app ("; wv)") isn't Chrome either
  if (os === "android" && /; wv\)/.test(s)) return { app: "this app", os }
  return null
}

/**
 * A link that opens this page in the phone's own browser, where the platform allows one:
 * Android: an intent for Chrome (falling back to the page itself); iOS 17+: Safari's x-safari-https scheme.
 * The #fragment can't travel in an Android intent, so the path and query go and the page opens on its start.
 */
export function openOutside(href: string, os: InApp["os"]): string | null {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== "https:") return null
  if (os === "android") {
    const fallback = encodeURIComponent(u.origin + u.pathname + u.search)
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
  }
  if (os === "ios") return "x-safari-" + u.href
  return null
}

/** What to call the browser people should use. */
export const browserName = (os: InApp["os"]) => (os === "ios" ? "Safari" : os === "android" ? "Chrome" : "your browser")
