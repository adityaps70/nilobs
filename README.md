# NilObs

**Aim for nil.** SIRE 2.0 inspection prep for tanker crews: real observations, rank-wise flashcards, inspection stories, a ready kit, daily missions, and Claude-powered AI (an AI inspector that grades answers, with an optional voice interview; Ask NilObs with sources; Photo check, which looks at a photo the way an inspector would; the Close-out helper, which turns your own observation into root cause, corrective and preventive actions, evidence and an operator's comment; a day-by-day prep plan).

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

What things cost: quick AI answer 1, deep answer 4, expert answer 8 (Command), why an observation was raised 1, Close-out helper 4, photo check 3 a photo, AI inspector interview 8 (12 with the studio voice), brief with AI plan 20, a new plan 3, a role pack (AI flashcards and checklist) 3, a story 5, a specialist deck 40, listening to an answer 1, a streak freeze 10. Failed AI calls are refunded automatically.

Plans are **prepaid, and renew only if the buyer picks auto-renew** (see Payments): buying the same plan again adds a month or a year; moving up to a higher plan starts it now and turns the lower plan's months still to come into credits that don't expire; a lower plan can't be bought while a higher one runs.

Credits are spent soonest-expiring first: plan credits refill every 30 days and don't roll over, welcome credits last 30 days, credits earned in the app last 30 days, top-ups never expire.

XP is rank, not money: it never goes down. Ten levels from Cadet to Vetting legend; each level-up pays credits (5 to 40), badges pay 2, the daily chest pays 1, 7/30/100-day streaks pay 5/20/50, and a shared debrief pays 10 (up to 2 a month). Earning is kept small on purpose: learning is free every day, and the AI is what credits are bought for. Streaks of 7+ and 30+ days multiply learning XP by 1.2 and 1.5. AI answers and photo checks give a little XP, capped at 30 a day, so paying for AI doesn't buy rank.

## Roles: every rank, and the shore team

NilObs isn't tied to any one company. Onboarding offers every rank on board (deck officers, engineers and ETO, cadets, ratings, catering), the company's shore staff (marine and technical superintendents, port captain, vetting, HSEQ, DPA, fleet, crewing, training) and "Other", where the user types their own role. An optional company name only tailors the AI's answers. `app/src/roles.ts` lists each role with the topics it usually looks after and the SIRE 2.0 sections it usually covers, following the usual division of duties on a tanker and ashore (each company's SMS may differ, and the app says so).

- **Prepared where it exists:** officers, engineers, cadets and ratings get the hand-written flashcards and interview questions that fit them.
- **The AI fills the gaps:** for roles without prepared material (catering, shore staff, "Other") the AI inspector writes interview questions for that role, and a role pack (3 credits) writes flashcards and a checklist. Shore staff are asked what an inspector, an oil major's vetting team or a TMSA auditor would ask the company. Every AI prompt (Ask, close-outs, plans, photo checks, grading) says who the user is, on board or ashore.

## Sign in (Google or an emailed code)

On nilobs.com the app is for signed-in users on every device: "Start free" (or any link into the app, including a crew invite) shows a sign-in screen first (`app/src/app/AppGate.tsx`), then the app opens on the screen or plan the visitor picked (a new account picks its role first). The demo game and readiness check on the home page stay open to everyone.

People sign in with Google, or with a **6-digit code sent by email** (`worker/auth.js` → `/api/auth/email/start` and `/api/auth/email/verify`; codes are hashed, last 10 minutes, five tries, five sends an hour per address). One account per address: a later Google sign-in with the same email opens the same account, and a code sent to a Google account's address opens that account. Email goes out through Resend (secret `RESEND_API_KEY`) or a Cloudflare Email Service binding `EMAIL` (`worker/email.js`); until one is set, only Google shows. The account's credits and plan live on the server, and XP, streak, briefs and saved screens stay in step on every device. A device opens on the account's own profile and progress (`app/src/auth.tsx` loads them before `app/src/app/AppGate.tsx` lets the app open), and a device that hasn't picked a role never overwrites the account's.

- **Google:** project "NilObs" in Google Cloud, consent screen published (name, email and profile only, so no Google review is needed), Web client with origin `https://nilobs.com` (and `http://localhost:8787` for `wrangler dev`). Its client ID is the `GOOGLE_CLIENT_ID` var; there is no client secret, because the page uses Google's own button and the Worker checks the ID token against Google's public keys.
- **Cloudflare D1** database `nilobs` (binding `DB`) holds users, sessions (only a hash of each session token) and one JSON copy of each user's state with a version number. Tables: `migrations/0001_init.sql`; the Worker also creates them on first use.
- **Session:** an HttpOnly, Secure, SameSite=Lax cookie `nilobs_sid`, 30 days, extended while in use. State-changing routes check the request's origin.
- **Sync (progress and screens, not credits):** the app writes to the browser as before; `app/src/auth.tsx` saves changes to `/api/state` a few seconds later and picks up other devices' changes when the app comes to the front. Two devices saving at once: the second one gets the newer copy back, merges (`app/src/sync.ts`: progress never goes backwards, newest screen wins) and saves again. A `wallet` sent to `/api/state` is dropped.
- **Gate:** with `GOOGLE_CLIENT_ID` and `DB` set, `/api/ai` and `/api/voice` answer 401 to signed-out visitors. Without them, sign-in is simply off and the AI is open (how local tests run).
- **Delete:** Profile & progress → Delete account erases the user, sessions, state, wallet, reminders, shared debriefs, crew memberships and certificate (crews they own close). Payment records stay (no name or email), and a one-way hash of the Google ID is kept in `starts` so a new account with the same Google login doesn't get the free starting credits again. Pages: `public/privacy.html`, `public/terms.html`, `public/refunds.html` (served at `/privacy`, `/terms`, `/refunds`).

## The wallet on the server

Signed in, the browser never decides a balance. `worker/wallet.js` keeps each account's wallet in D1 (one row with a version number; concurrent changes retry on the latest copy) and applies the same rules as the app (`app/src/economy.ts`):

- **Charging:** the app calls `POST /api/wallet/spend { item, ref }` with what it wants (e.g. `{ kind: "photo", n: 2 }`); the server prices it from the plan and balance. For AI items it opens a **ticket** (id = `ref`) that `/api/ai` and `/api/voice` require: each ticket pays for a set number of answers, on set models, with a size limit, a photo count and an expiry. Without a valid ticket the AI answers 402.
- **Refunds:** an AI charge is kept the moment the answer starts arriving. If nothing arrives, `POST /api/wallet/refund` gives it back (and a charge left hanging is refunded after 10 minutes). Replies that must be JSON (photo checks, grades) are checked on the server before anything is sent, so a malformed or "not a ship" reply is refundable and leaks nothing.
- **Earning:** badges, levels and streak milestones pay once per account (`POST /api/wallet/earn`, and `/api/wallet/claims` after signing in); the chest once a day; shared debriefs within the daily and monthly limits. These are still reported by the app, so the most anyone can collect this way is the one-off rewards (about 270 credits) plus the chest and 2 debriefs a month.
- In a local test build (no sign-in) the app keeps a practice wallet in the browser, with simulated purchases.

## Live features (worth opening every day)

- **Live updates** (`worker/feed.js`, `app/src/components/Live.tsx`): the Worker reads public sources about every 3 hours, a few per run, oldest first (UK MAIB reports and MCA guidance through GOV.UK's search API; CHIRP Maritime and the P&I clubs Britannia and UK P&I; and Splash247, gCaptain, Marine Insight, The Maritime Executive, Hellenic Shipping News, Offshore Energy and Seatrade Maritime. The US Coast Guard, Paris MoU, AMSA, OCIMF, Gard, NorthStandard, Steamship Mutual and SAFETY4SEA were dropped: they block automated readers or have no readable feed). A source without a fixed feed address is found from its page's `<link rel="alternate">` and remembered; one that fails is retried after 12 hours. It keeps what's new, and has Claude (the quick model) judge each item's relevance to tanker crews and write a short takeaway and one thing to check on board, tagged by role and topic. Only relevant items show: on Today, on the Live screen (for your role or everything), on the home page for visitors (`GET /api/feed`, public), and as step 3 of today's drill. Each source's health is on the dashboard.
- **Today's drill**: 3 flashcards (your brief's focus topics if the inspection is within 21 days, otherwise your weakest), 2 Spot rounds and one live update; +30 XP once a day (`progress.drill`).
- **Daily reminders** (`worker/push.js`, `public/sw.js`): opt-in web push at the hour each person picks, in their own time zone, once a day. The Worker makes its own VAPID signing key on first use (kept in D1), sends empty pushes, and the service worker asks `/api/push/message` for a personal line (inspection countdown, streak, new updates). Only Google, Mozilla, Apple and Microsoft push addresses are accepted. On iPhone it works once NilObs is added to the Home Screen.
- **Inspection pulse** (`worker/pulse.js`): debriefs shared from the app are checked and de-identified by Claude (names of ships, people, companies, oil majors, terminals and ports removed; a last regex pass catches ship prefixes, IMO numbers and emails). Others see only that version, plus trending topics for the last 14 days. Three a day per person; the owner can hide any of them on the dashboard.
- **Weekly leagues** (`worker/league.js`): this week's XP (Monday to Sunday, UTC) by role group, from synced progress, at most 500 XP a day counted. Anonymous ("Second Officer 4821") unless someone chooses a display name.
- **Schedule**: `wrangler.jsonc` → `triggers.crons` runs every 15 minutes (reminders due, debriefs the AI couldn't check yet, and up to four feed sources that are due), so a deploy or a missed run catches up by itself. Database writes are batched to stay inside Cloudflare's per-run limits.

## Crews, fleet plans, certificates and receipts

- **Crews** (`worker/crews.js`, `app/src/components/Crew.tsx`): anyone signed in makes a crew and shares its link (`nilobs.com/join/CODE`, which opens `#app/crew/CODE`). Members see a private weekly board: first name, role, XP this week, streak, today's drill. The owner can rename it, make a new link (the old one stops working), remove people or delete it. Up to 5 crews per person.
- **Fleet plans:** the owner buys seats through Razorpay (product `fleet:<crew>:<new|renew|add>:<seats>:<monthly|annual>`, priced by `fleetQuote` in `app/src/economy.ts`: ₹399 or $5 a seat a month, from 5 seats, a year for ten months, extra seats at the monthly price for each month left). Members take seats in the order they joined; a seat is Watchkeeper until the fleet's paid end, applied to the member's wallet the next time it's read (`seatFor` in `worker/wallet.js`). Someone who leaves keeps their seat to the end of the period. The owner gets a **readiness report** (name, email, role, last active, streak, drills, XP this week, practice scores by topic, weakest topics; CSV download). Members are told exactly that before joining a fleet.
- **Certificates** (`app/src/cert.ts`, `worker/certs.js`): earned from synced progress (5+ cards in every topic for the role, 7 daily drills, an AI inspector session scored 6/10+). The public page `nilobs.com/c/<number>` is printable and is how anyone checks one. It says it isn't an official or STCW certificate.
- **Receipts:** `GET /api/pay/receipts` lists the account's payments (Plans & credits shows them); `/receipt/<payment id>` is a printable receipt for the account that paid, from `NILOBS_BILLING_NAME` (Sea N Shore IT Solutions LLP). No GST is charged, so it's a payment receipt, not a tax invoice.

## Public topic pages (for search engines)

`app/seo/pages.ts` writes a page for each SIRE 2.0 topic at build time (`public/sire/<topic>.html`, served as `/sire/<topic>`), plus `/sire/` (the index), `/sitemap.xml` and `/robots.txt`. Each page explains why inspectors look at the topic, what to have ready, the records they ask for, a few real questions with model answers, de-identified observations from the fleet data and the roles that answer for it, with structured data (breadcrumbs, article, FAQ). They are plain HTML, so they load fast and are readable without the app. After a deploy, submit `https://nilobs.com/sitemap.xml` in Google Search Console.

## About and content review

`public/about.html` (`/about`) says who runs NilObs, where the content comes from, that no named master mariner or inspector has reviewed it yet, and how to report a mistake. The study screens show the last review date (`app/src/meta.ts` → `CONTENT_REVIEWED`); update both when the content is reviewed.

## Android app (Play Store)

NilObs is a PWA (`public/manifest.webmanifest`, `public/sw.js`), so the Play Store version is a Trusted Web Activity that opens nilobs.com full screen:

1. Open [PWABuilder](https://www.pwabuilder.com), enter `https://nilobs.com`, choose **Package for stores → Android**, package ID e.g. `com.nilobs.app`, and download the package. Keep the signing key and its passwords it gives you somewhere safe: every update needs them.
2. In Cloudflare, add the vars `ANDROID_PACKAGE` (the package ID) and `ANDROID_CERT_SHA256` (the SHA-256 fingerprint PWABuilder shows; after enrolling in Play App Signing, add Google's fingerprint too, comma-separated). The Worker then serves `/.well-known/assetlinks.json`, which removes the browser bar in the app.
3. In the Google Play Console (a one-time $25 developer account; an organisation account for the LLP skips the 14-day closed test that new personal accounts need), create the app and upload the `.aab`.

## Analytics dashboard (nilobs.com/admin)

For the owner only. Set the Cloudflare **secret** `ADMIN_EMAILS` to the Google account(s) allowed in (comma-separated), sign in on nilobs.com with that account, then open `nilobs.com/admin`. Everyone else, signed in or not, gets the site's ordinary "not found", and so does everyone while `ADMIN_EMAILS` isn't set. It's a secret rather than a var only so the address isn't in this public repo.

- **Shows:** sign-ups, active people and returning people; sign-ups, active people, credits spent and revenue per day for 30 days; credits and uses per feature; the funnel (signed up → picked a role → used the AI → paid); roles, on board vs ashore, ship types, plans and companies; the latest payments; and a searchable, sortable list of everyone (name, email, role, ship, company, sign-up and last activity, XP, streak, plan, credits left and used, AI uses, paid) with a CSV download.
- **How:** `worker/admin.js` reads the tables the app already keeps (`users`, `user_state`, `wallets`, `payments`, `starts`) and writes nothing. It never returns chats, answers, briefs or photos. Per-feature use comes from each wallet's latest 120 entries. Days are UTC.
- **Page:** `app/admin/admin.html` (plain HTML, no libraries), built into `worker/admin-page.js` by `node build.mjs --hosted` and served by the Worker with `no-store`, `noindex` and a strict content security policy. People's names and companies are inserted as text, never as HTML.

## Payments

Payments go through **Razorpay** (`worker/pay.js`): UPI, cards, netbanking and wallets. Prices come only from `app/src/economy.ts`. The Worker creates a Razorpay order at that price and the app opens Razorpay Checkout for it. Credits are added only once the money is captured: the browser hands back Razorpay's payment id and signature (HMAC-SHA256 of `order_id|payment_id` with the key secret), the Worker checks the signature and then asks Razorpay about the payment itself (right order, right amount, captured; an authorized payment is captured there). Razorpay's signed webhook (HMAC-SHA256 of the raw body with the webhook secret) covers a closed tab, and a page that went away mid-payment checks the order again when it comes back. Each payment is credited once (a `pay:<id>` claim), however many times it's confirmed.

1. In the Razorpay Dashboard, switch to **Test mode** and open Account & Settings → API Keys → Generate Key. Add the Key ID and Key Secret as Cloudflare secrets `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (nilobs → Settings → Variables and Secrets).
2. In Razorpay, Account & Settings → Webhooks → Add New Webhook: URL `https://nilobs.com/api/pay/razorpay/webhook`, a secret you make up, and the events `payment.captured`, `order.paid` and, for auto-renew, `subscription.charged`, `subscription.activated`, `subscription.pending`, `subscription.halted`, `subscription.cancelled` and `subscription.completed`. Add the same secret in Cloudflare as `RAZORPAY_WEBHOOK_SECRET`.
3. Buy something on nilobs.com with Razorpay's test card or test UPI and check the credits arrive.
4. When the account is activated, generate live keys (and a live-mode webhook) and replace the secrets. Keys starting `rzp_test_` take test payments, `rzp_live_` real ones.

Prices are in rupees. Paying in dollars stays closed ("pay in rupees with an international card") until Razorpay turns on international payments for the account; then set `RAZORPAY_CURRENCIES` to `INR,USD` in `wrangler.jsonc`. Until the key secrets are set, buying shows "Payments in rupees open soon". `NILOBS_SIMULATED_CHECKOUT = "1"` turns on free test purchases for demos (never on the live site). Every payment is recorded in the D1 table `payments`.

### Auto-renew (Razorpay Subscriptions)

When buying a plan in rupees, people choose **Pay once** (the default) or **Renew automatically** (`worker/subs.js`). Auto-renew makes a Razorpay plan once per price (every 30 days for monthly plans, every 360 days for yearly ones, the same lengths as NilObs plans) and a subscription for the buyer; Checkout takes the first payment and sets up the UPI Autopay, card or e-mandate, and Razorpay notifies the customer before each later charge. Each charge (from Checkout's signed reply or the `subscription.charged` webhook) is credited once, through its own `payments` row and wallet claim, and extends the plan from where its term ended (`grantRenewal` in `app/src/economy.ts`). At the end of a term an auto-renewing plan waits up to 7 days for the charge, without that month's credits, before it lapses. While auto-renew is on, a different plan can't be bought (it would be charged twice). **Plans & credits → Turn off auto-renew** cancels it at Razorpay at once and the paid time runs out normally; deleting the account cancels it first.

Razorpay has to have Subscriptions switched on for the account. The Worker asks Razorpay's plan API at most every 12 hours and only offers auto-renew when it answers; set `RAZORPAY_SUBSCRIPTIONS = "0"` to hide it. Subscriptions are kept in the D1 table `subscriptions`; the dashboard shows how many are on.

## Photo check

Crew photograph an area, a piece of equipment or a record (up to 3 photos per check) and pick where it is on board. Claude looks at it the way a SIRE 2.0 inspector would and returns what would be flagged, how serious it is, why, and the fix, with numbered markers on the photo and similar findings from the real, de-identified observations in `app/src/gen/obs.json`. Results can be copied as a defect list, and any finding can be taken to Ask NilObs.

- Photos are shrunk on the phone to at most 1280 px and re-encoded as JPEG, which drops GPS and other metadata. They go to `/api/ai` for that one check and are never stored or logged; only a small thumbnail and the findings stay in the browser (`sr.photos`, last 10 checks).
- The app asks crews to keep faces, the ship's name and the IMO number out of the frame, and Claude is told never to write any of them down.
- Photos always use `NILOBS_MODEL` (the vision model), have their own per-IP limit (`NILOBS_PHOTO_PER_MINUTE`, default 4) and are checked on the server: at most 3 per request, JPEG/PNG/WebP/GIF, about 1.5 MB each.
- If the photo isn't of a ship, the check is refunded. The pure logic (areas, examples, prompt, clean-up of the reply) is in `app/src/photo.ts`, tested in `app/tests/photo.test.mjs`.

## Close-out helper

An officer pastes an observation from their own inspection, optionally with the SIRE 2.0 chapter, the type (Human, Process, Hardware), what's already been done and how their company words close-outs. Claude drafts what the inspector saw, the root cause, the immediate correction, corrective and preventive actions, evidence to attach, owners and target dates, and an operator's comment ready to submit (4 credits, refunded if nothing comes back).

- Ship names (MT/MV …), IMO numbers and email addresses are taken out in the browser before anything is sent (`scrubObservation` in `app/src/components/Closeout.tsx`); the prompt tells Claude never to name people, ships or companies, nor to invent regulation or OCIMF question numbers.
- The last 12 drafts are kept in the browser (`sr.closeouts`) and synced with the account like other progress. The operator's comment can be copied on its own, and the whole draft saved as a Word file.

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
| `RAZORPAY_CURRENCIES` | `INR` | Currencies paid through Razorpay (`INR,USD` once international payments are on) |

Secrets (never in this file): `ANTHROPIC_API_KEY`, `RUMIK_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `ADMIN_EMAILS` (who can open the analytics dashboard).

## Work on it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # put your key in .dev.vars (never commit it)
npm run dev                      # site and AI at http://localhost:8787
npm test                         # Worker tests (fake Anthropic, Rumik and Razorpay) and economy tests
```

The site is built from `app/src` (React + Tailwind) into one file, `public/index.html`:

```bash
cd app && npm install && npm run build
```

`npm run build:artifact` in `app/` builds a single standalone file for local testing only: no sign-in and no AI. NilObs itself runs only on nilobs.com, where every AI call goes through our own server and API key.

## Layout

```
public/            built site, favicon and brand files (served by the Worker)
worker/index.js    Cloudflare Worker: static site + /api/ai + /api/health
worker/ai.js       AI endpoint: checks origin and input, rate-limits, streams Claude's answer
worker/voice.js    voice endpoint: Rumik text-to-speech, cached per line
worker/guard.js    shared origin check and rate limit
worker/wallet.js   the account's wallet: charges, tickets, refunds, earning (D1)
worker/pay.js      Razorpay orders, payment checks and signed notifications
worker/subs.js     auto-renewing plans (Razorpay Subscriptions)
worker/admin.js    the owner's analytics (/admin, /api/admin/stats), only for ADMIN_EMAILS
worker/feed.js     the live industry feed: sources, AI takeaways, /api/feed
worker/push.js     daily reminders: VAPID key, subscriptions, sending, the reminder text
worker/pulse.js    the inspection pulse: shared debriefs, de-identified by the AI
worker/league.js   weekly leagues
worker/crews.js    crews, fleet plans (seats), the board and the readiness report
worker/certs.js    certificates of completion and their public pages (/c/<number>)
worker/email.js    sending sign-in codes (Resend or Cloudflare Email Service)
worker/live.js     tables and helpers shared by the live features
app/admin/         the analytics page (built into worker/admin-page.js)
public/sw.js       offline copy of the app for use at sea
app/src            app source (React, Tailwind v4, Magic UI components)
app/src/gen        de-identified fleet data (stories, observations, flashcards, ready kit)
app/src/economy.ts plans, prices, credit rules (pure functions, tested)
app/src/photo.ts   Photo check: areas, examples, prompt, reply clean-up (pure, tested)
app/src/auth.tsx   sign-in (Google, emailed code), account card, sync with the account
app/src/cert.ts    what a certificate takes (shared with the Worker)
app/src/components/Crew.tsx  crews, fleet plan, readiness report, certificate, receipts
app/src/sync.ts    merge rules for two devices' copies of progress (pure, tested)
app/src/credits.tsx the wallet in the app: the server's copy when signed in, a practice wallet otherwise
worker/auth.js     Google token check, sessions, /api/me, /api/state (D1)
migrations/        D1 schema
app/build.mjs      builds public/index.html, the admin page and the topic pages
app/seo/pages.ts   public SIRE 2.0 topic pages, sitemap.xml and robots.txt
app/src/components/Closeout.tsx  the Close-out helper
tests/             Worker, sign-in, wallet and payment tests (app/tests: economy, purchases, Photo check, sync)
```

## Data

Stories, observations and flashcards are paraphrased from crew debriefs, SIRE 2.0 / CDI / pre-vetting reports and superintendents' notes, with ship, crew, inspector and company names removed. Confirm you have the right to publish the source material, and have a master mariner review the flashcard answers before launch. AI answers can be wrong; the app tells users to check their SMS and the current rules. Not affiliated with OCIMF.
