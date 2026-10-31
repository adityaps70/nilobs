// In-app browsers (Facebook, Instagram, LinkedIn…), where Google won't sign anyone in: spotted, and a way out offered.
import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nilobs-inapp-")), "inapp.mjs")
await esbuild.build({ entryPoints: [path.join(here, "../src/inapp.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning" })
const { inAppBrowser, openOutside, browserName } = await import(pathToFileURL(out).href)

const UA = {
  fbIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/489.0.0.38.104;FBBV/668158498;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  fbAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/486.0.0.66.70;]",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.32.97 (iPhone14,5; iOS 17_5; en_IN; en; scale=3.00; 1170x2532; 634108168)",
  linkedin: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1",
  androidWebview: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
}

test("in-app browsers are spotted, with the app and the phone's system", () => {
  assert.deepEqual(inAppBrowser(UA.fbIos), { app: "Facebook", os: "ios" })
  assert.deepEqual(inAppBrowser(UA.fbAndroid), { app: "Facebook", os: "android" })
  assert.deepEqual(inAppBrowser(UA.instagram), { app: "Instagram", os: "ios" })
  assert.deepEqual(inAppBrowser(UA.linkedin), { app: "LinkedIn", os: "ios" })
  assert.deepEqual(inAppBrowser(UA.androidWebview), { app: "this app", os: "android" })
})

test("real browsers are left alone: Safari, Chrome on Android and iPhone, desktop", () => {
  for (const k of ["safari", "chromeAndroid", "chromeIos", "desktop"]) assert.equal(inAppBrowser(UA[k]), null, k)
  assert.equal(inAppBrowser(""), null)
  assert.equal(inAppBrowser(undefined), null)
})

test("the way out: Chrome on Android (path and query kept), Safari on iPhone", () => {
  assert.equal(
    openOutside("https://nilobs.com/join/abcd2345?x=1#app/crew/ABCD2345", "android"),
    "intent://nilobs.com/join/abcd2345?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fnilobs.com%2Fjoin%2Fabcd2345%3Fx%3D1;end",
  )
  assert.equal(openOutside("https://nilobs.com/#app", "ios"), "x-safari-https://nilobs.com/#app")
  assert.equal(openOutside("https://nilobs.com/", "other"), null)
  assert.equal(openOutside("http://localhost:8789/", "ios"), null, "only the real https site")
  assert.equal(openOutside("not a url", "android"), null)
  assert.deepEqual(["ios", "android", "other"].map(browserName), ["Safari", "Chrome", "your browser"])
})
