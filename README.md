# NilObs

**Aim for nil.** SIRE 2.0 inspection prep for tanker crews: real observations, rank-wise flashcards, inspection stories, a ready kit, daily missions, and Claude-powered AI (an AI inspector that grades answers, with an optional voice interview; Ask NilObs with sources; Photo check, which looks at a photo the way an inspector would; close-out drafts; a day-by-day prep plan).

This repo deploys to **Cloudflare Workers**. The Worker serves the site from `public/`, runs the AI endpoint at `/api/ai` and the voice endpoint at `/api/voice`. Your API keys stay on Cloudflare as secrets and never reach the browser.

## Deploy on Cloudflare (about 5 minutes)

1. **Create the Worker from this repo.** In the Cloudflare dashboard go to **Workers & Pages → Create → Import a repository**, pick `adityaps70/nilobs`, keep the defaults (no build command, deploy command `npx wrangler deploy`) and deploy. Every push to `main` redeploys.
2. **Add your API key as a secret.** Create a key at <https://console.anthropic.com>. In Cloudflare open **Workers & Pages → nilobs → Settings → Variables and Secrets → Add**, choose type **Secret**, name it `ANTHROPIC_API_KEY`, paste the key and save. Cloudflare redeploys with it.
3. **Optional: the inspector's voice.** Create a key in the Rumik dashboard (<https://playground.rumik.ai>) and add it the same way, as a Secret named `RUMIK_API_KEY`. Without it, voice interviews use the phone's built-in voice.
4. **Check it.** Open `https://nilobs.com/api/health` (or `https://nilobs.<your-subdomain>.workers.dev/api/health`). It should say `{"ok":true,"ai":true,"voice":true}`. Then open the site and try **Ask AI** and a **voice interview** with the AI inspector.
5. **Domain.** The site runs on **nilobs.com**. The domain is registered at Namecheap with its nameservers set to Cloudflare (`rajeev.ns.cloudflare.com`, `zita.ns.cloudflare.com`); the Worker has `nilobs.com` and `www.nilobs.com` as custom domains (listed under `routes` in `wrangler.jsonc`, so deploys keep them), and `www` redirects to `nilobs.com`. Email to the domain still uses Namecheap's forwarding MX records, kept in Cloudflare DNS.

If pushes to `main` stop deploying on their own, Cloudflare has lost its link to GitHub: open **nilobs → Settings → Builds → Manage** and reconnect, or press **Retry build** on the latest build.

From a terminal instead: `npm install`, `npx wrangler login`, `npx wrangler secret put ANTHROPIC_API_KEY`, `npx wrangler secret put RUMIK_API_KEY`, `npm run deploy`.

## Pricing and credits

Modelled on usage-credit products such as Emergent: try everything free, then pay once it's useful. All prices and rules live in `app/src/economy.ts` (with tests in `app/tests/economy.test.mjs`).

| | Price (₹ / $) | Credits | Notes |
|---|---|---|---|
| Free | 0 | 60 welcome (30 days) + 20 every month | Learning is free; every AI feature can be tried |
| Watchkeeper | ₹499 / $7 for a month (₹4,990 / $70 for a year) | 400 a month | All stories and specialist decks, voice interviews, a streak freeze a month |
| Command | ₹1,299 / $17 for a month (₹12,990 / $170 for a year) | 1,500 a month | Everything, plus Expert answers and plans |
| Voyage pass | ₹1,199 / $15 once | 1,000 for 180 days | Watchkeeper perks for 6 months, nothing renews |
| Top-ups | ₹249 / ₹699 / ₹1,499 ($3 / $9 / $19) | 150 / 500 / 1,200 | Never expire |

What things cost: quick AI answer 1, deep answer 4, expert answer 8 (Command), observation close-out 1, photo check 3 a photo, AI inspector interview 8 (12 with the studio voice), brief with AI plan 20, a new plan 3, a role pack (AI flashcards and checklist) 3, a story 5, a specialist deck 40, listening to an answer 1, a streak freeze 10. Failed AI calls are refunded automatically.

Plans are **prepaid and never renew by themselves**: buying the same plan again adds a month or a year; moving up to a higher plan starts it now and turns the lower plan's months still to come into credits that don't expire; a lower plan can't be bought while a higher one runs.

Credits are spent soonest-expiring first: plan credits refill every 30 days and don't roll over, welcome credits last 30 days, credits earned in the app last 60 days, top-ups never expire.

XP is rank, not money: it never goes down. Ten levels from Cadet to Vetting legend; each level-up pays credits (10 to 100), badges pay 5, the daily chest pays 3, 7/30/100-day streaks pay 10/40/100, and a shared debrief pays 25 (up to 4 a month). Streaks of 7+ and 30+ days multiply learning XP by 1.2 and 1.5. AI answers and photo checks give a little XP, capped at 30 a day, so paying for AI doesn't buy rank.

## Roles: every rank, and the shore team

NilObs isn't tied to any one company. Onboarding offers every rank on board (deck officers, engineers and ETO, cadets, ratings, catering), the company's shore staff (marine and technical superintendents, port captain, vetting, HSEQ, DPA, fleet, crewing, training) and "Other", where the user types their own role. An optional company name only tailors the AI's answers. `app/src/roles.ts` lists each role with the topics it usually looks after and the SIRE 2.0 sections it usually covers, following the usual division of duties on a tanker and ashore (each company's SMS may differ, and the app says so).

- **Prepared where it exists:** officers, engineers, cadets and ratings get the hand-written flashcards and interview questions that fit them.
- **The AI fills the gaps:** for roles without prepared material (catering, shore staff, "Other") the AI inspector writes interview questions for that role, and a role pack (3 credits) writes flashcards and a checklist. Shore staff are asked what an inspector, an oil major's vetting team or a TMSA auditor would ask the company. Every AI prompt (Ask, close-outs, plans, photo checks, grading) says who the user is, on board or ashore.

## Sign in with Google

Anyone can practise without an account. The AI features (Ask NilObs, the AI inspector, Photo check, AI plans and close-out drafts) and buying need a Google sign-in. Signed in, the account's credits and plan live on the server, and XP, streak, briefs and saved screens stay in step on every device.

- **Google:** project "NilObs" in Google Cloud, consent screen published (name, email and profile only, so no Google review is needed), Web client with origin `https://nilobs.com` (and `http://localhost:8787` for `wrangler dev`). Its client ID is the `GOOGLE_CLIENT_ID` var; there is no client secret, because the page uses Google's own button and the Worker checks the ID token against Google's public keys.
- **Cloudflare D1** database `nilobs` (binding `DB`) holds users, sessions (only a hash of each session token) and one JSON copy of each user's state with a version number. Tables: `migrations/0001_init.sql`; the Worker also creates them on first use.
- **Session:** an HttpOnly, Secure, SameSite=Lax cookie `nilobs_sid`, 30 days, extended while in use. State-changing routes check the request's origin.
- **Sync (progress and screens, not credits):** the app writes to the browser as before; `app/src/auth.tsx` saves changes to `/api/state` a few seconds later and picks up other devices' changes when the app comes to the front. Two devices saving at once: the second one gets the newer copy back, merges (`app/src/sync.ts`: progress never goes backwards, newest screen wins) and saves again. A `wallet` sent to `/api/state` is dropped.
- **Gate:** with `GOOGLE_CLIENT_ID` and `DB` set, `/api/ai` and `/api/voice` answer 401 to signed-out visitors. Without them, sign-in is simply off and the AI is open (how local tests run).
- **Delete:** Progress & badges → Delete account erases the user, sessions, state and wallet. Payment records stay (no name or email), and a one-way hash of the Google ID is kept in `starts` so a new account with the same Google login doesn't get the free starting credits again. Pages: `public/privacy.html`, `public/terms.html`, `public/refunds.html` (served at `/privacy`, `/terms`, `/refunds`).

## The wallet on the server

Signed in, the browser never decides a balance. `worker/wallet.js` keeps each account's wallet in D1 (one row with a version number; concurrent changes retry on the latest copy) and applies the same rules as the app (`app/src/economy.ts`):

- **Charging:** the app calls `POST /api/wallet/spend { item, ref }` with what it wants (e.g. `{ kind: "photo", n: 2 }`); the server prices it from the plan and balance. For AI items it opens a **ticket** (id = `ref`) that `/api/ai` and `/api/voice` require: each ticket pays for a set number of answers, on set models, with a size limit, a photo count and an expiry. Without a valid ticket the AI answers 402.
- **Refunds:** an AI charge is kept the moment the answer starts arriving. If nothing arrives, `POST /api/wallet/refund` gives it back (and a charge left hanging is refunded after 10 minutes). Replies that must be JSON (photo checks, grades) are checked on the server before anything is sent, so a malformed or "not a ship" reply is refundable and leaks nothing.
- **Earning:** badges, levels and streak milestones pay once per account (`POST /api/wallet/earn`, and `/api/wallet/claims` after signing in); the chest once a day; shared debriefs within the daily and monthly limits. These are still reported by the app, so the most anyone can collect this way is the one-off rewards (about 630 credits) plus the chest and 4 debriefs a month.
- Signed out (and in the Claude artifact) the app keeps a practice wallet in the browser, with simulated purchases.

## Payments

Payments go through **Cashfree Payments** (`worker/pay.js`): UPI, cards, netbanking and wallets. Prices come only from `app/src/economy.ts`. The Worker creates a Cashfree order at that price, the app opens Cashfree's checkout pop-up, and credits are added only once Cashfree says the order is `PAID`: either the Worker asks Cashfree (Get Order, with the secret key) or Cashfree's signed notification arrives (base64 HMAC-SHA256 of timestamp + raw body). Each payment is credited once (a `pay:<id>` claim), however many times it's confirmed. Cashfree needs a mobile number on every order, so the app asks for one at checkout.

1. In the Cashfree Merchant Dashboard, switch to **Test** and open Developers → API Keys. Add the App ID and Secret Key as Cloudflare secrets `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` (nilobs → Settings → Variables and Secrets). Nothing else to set up: each order tells Cashfree to notify `https://nilobs.com/api/pay/cashfree/webhook`.
2. Buy something on nilobs.com with Cashfree's test card or test UPI and check the credits arrive.
3. When your account is activated, replace the two secrets with the live keys. The Worker works out whether keys are test (sandbox) or live by itself; `CASHFREE_ENV` = `sandbox` / `production` fixes it if ever needed.

Prices are in rupees. Paying in dollars stays closed ("pay in rupees with an international card") until Cashfree turns on international payments for the account; then set `CASHFREE_CURRENCIES` to `INR,USD` in `wrangler.jsonc`. Until the secrets are set, buying shows "Payments in rupees open soon". `NILOBS_SIMULATED_CHECKOUT = "1"` turns on free test purchases for demos (never on the live site). Every payment is recorded in the D1 table `payments`.

## Photo check

Crew photograph an area, a piece of equipment or a record (up to 3 photos per check) and pick where it is on board. Claude looks at it the way a SIRE 2.0 inspector would and returns what would be flagged, how serious it is, why, and the fix, with numbered markers on the photo and similar findings from the real, de-identified observations in `app/src/gen/obs.json`. Results can be copied as a defect list, and any finding can be taken to Ask NilObs.

- Photos are shrunk on the phone to at most 1280 px and re-encoded as JPEG, which drops GPS and other metadata. They go to `/api/ai` for that one check and are never stored or logged; only a small thumbnail and the findings stay in the browser (`sr.photos`, last 10 checks).
- The app asks crews to keep faces, the ship's name and the IMO number out of the frame, and Claude is told never to write any of them down.
- Photos always use `NILOBS_MODEL` (the vision model), have their own per-IP limit (`NILOBS_PHOTO_PER_MINUTE`, default 4) and are checked on the server: at most 3 per request, JPEG/PNG/WebP/GIF, about 1.5 MB each.
- If the photo isn't of a ship, the check is refunded. The pure logic (areas, examples, prompt, clean-up of the reply) is in `app/src/photo.ts`, tested in `app/tests/photo.test.mjs`.

## Keep costs under control

- In the Anthropic Console, set a **monthly spend limit** for this key.
- The endpoint only accepts requests from the site's own origin, caps input size, and limits each IP to `NILOBS_RATE_PER_MINUTE` requests a minute (default 12, per Worker instance), with a tighter `NILOBS_PHOTO_PER_MINUTE` (default 4) for photo checks. For limits shared across Cloudflare's network, uncomment the `ratelimits` block in `wrangler.jsonc`.
- Every AI and voice call needs a paid ticket from the server wallet, so usage is bounded by credits; `NILOBS_WALLET_PER_MINUTE` (default 60) and `NILOBS_PAY_PER_MINUTE` (default 8) limit wallet changes and checkout starts per IP.

## Settings (`wrangler.jsonc` → `vars`)

| Variable | Default | What it does |
|---|---|---|
| `NILOBS_MODEL` | `claude-sonnet-5-5` | Model for Ask NilObs, the prep plan and Photo check (needs vision) |
| `NILOBS_MODEL_QUICK` | `claude-haiku-5-5` | Model for grading answers and close-out drafts |
| `NILOBS_RATE_PER_MINUTE` | `12` | AI requests per IP per minute |
| `NILOBS_PHOTO_PER_MINUTE` | `4` | Photo checks per IP per minute |
| `NILOBS_ALLOWED_ORIGINS` | (the site's own origin) | Extra origins allowed to call `/api/ai` and `/api/voice`, comma-separated |
| `NILOBS_VOICE_MODEL` | `muga` | Rumik voice model (`muga` or `mulberry`) |
| `NILOBS_VOICE_SPEAKER` | (Rumik default) | Rumik preset voice, e.g. `speaker_2` |
| `NILOBS_VOICE_TONE` | (none) | Tone tag for muga, e.g. `neutral` |
| `NILOBS_VOICE_DESCRIPTION` | (none) | Voice description for mulberry, e.g. `calm, firm male inspector` |
| `NILOBS_VOICE_PER_MINUTE` | `20` | Voice requests per IP per minute |
| `NILOBS_WALLET_PER_MINUTE` | `60` | Wallet changes per IP per minute |
| `NILOBS_PAY_PER_MINUTE` | `8` | Checkouts started per IP per minute |
| `NILOBS_SIMULATED_CHECKOUT` | (off) | `"1"`: purchases are free test grants (demos only) |
| `CASHFREE_CURRENCIES` | `INR` | Currencies paid through Cashfree (`INR,USD` once international payments are on) |
| `CASHFREE_ENV` | (worked out from the keys) | `sandbox` or `production`, to fix Cashfree's environment |

Secrets (never in this file): `ANTHROPIC_API_KEY`, `RUMIK_API_KEY`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`.

## Work on it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # put your key in .dev.vars (never commit it)
npm run dev                      # site and AI at http://localhost:8787
npm test                         # Worker tests (fake Anthropic, Rumik and Cashfree) and economy tests
```

The site is built from `app/src` (React + Tailwind) into one file, `public/index.html`:

```bash
cd app && npm install && npm run build
```

`npm run build:artifact` in `app/` builds the Claude-artifact version instead, where the AI runs on the viewer's own Claude account.

## Layout

```
public/            built site, favicon and brand files (served by the Worker)
worker/index.js    Cloudflare Worker: static site + /api/ai + /api/health
worker/ai.js       AI endpoint: checks origin and input, rate-limits, streams Claude's answer
worker/voice.js    voice endpoint: Rumik text-to-speech, cached per line
worker/guard.js    shared origin check and rate limit
worker/wallet.js   the account's wallet: charges, tickets, refunds, earning (D1)
worker/pay.js      Cashfree orders, payment checks and signed notifications
public/sw.js       offline copy of the app for use at sea
app/src            app source (React, Tailwind v4, Magic UI components)
app/src/gen        de-identified fleet data (stories, observations, flashcards, ready kit)
app/src/economy.ts plans, prices, credit rules (pure functions, tested)
app/src/photo.ts   Photo check: areas, examples, prompt, reply clean-up (pure, tested)
app/src/auth.tsx   Sign in with Google, account card, sync with the account
app/src/sync.ts    merge rules for two devices' copies of progress (pure, tested)
app/src/credits.tsx the wallet in the app: the server's copy when signed in, a practice wallet otherwise
worker/auth.js     Google token check, sessions, /api/me, /api/state (D1)
migrations/        D1 schema
app/build.mjs      builds public/index.html
tests/             Worker, sign-in, wallet and payment tests (app/tests: economy, purchases, Photo check, sync)
```

## Data

Stories, observations and flashcards are paraphrased from crew debriefs, SIRE 2.0 / CDI / pre-vetting reports and superintendents' notes, with ship, crew, inspector and company names removed. Confirm you have the right to publish the source material, and have a master mariner review the flashcard answers before launch. AI answers can be wrong; the app tells users to check their SMS and the current rules. Not affiliated with OCIMF.
