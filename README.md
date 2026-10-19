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
| Watchkeeper | ₹499 / $7 a month (₹4,990 / $70 a year) | 400 a month | All stories and specialist decks, voice interviews, a streak freeze a month |
| Command | ₹1,299 / $17 a month (₹12,990 / $170 a year) | 1,500 a month | Everything, plus Expert answers and plans |
| Voyage pass | ₹1,199 / $15 once | 1,000 for 180 days | Watchkeeper perks for 6 months, nothing renews |
| Top-ups | ₹249 / ₹699 / ₹1,499 ($3 / $9 / $19) | 150 / 500 / 1,200 | Never expire |

What things cost: quick AI answer 1, deep answer 4, expert answer 8 (Command), observation close-out 1, photo check 3 a photo, AI inspector interview 8 (12 with the studio voice), brief with AI plan 20, a new plan 3, a story 5, a specialist deck 40, listening to an answer 1, a streak freeze 10. Failed AI calls are refunded automatically.

Credits are spent soonest-expiring first: plan credits refill every 30 days and don't roll over, welcome credits last 30 days, credits earned in the app last 60 days, top-ups never expire.

XP is rank, not money: it never goes down. Ten levels from Cadet to Vetting legend; each level-up pays credits (10 to 100), badges pay 5, the daily chest pays 3, 7/30/100-day streaks pay 10/40/100, and a shared debrief pays 25 (up to 4 a month). Streaks of 7+ and 30+ days multiply learning XP by 1.2 and 1.5. AI answers and photo checks give a little XP, capped at 30 a day, so paying for AI doesn't buy rank.

## Photo check

Crew photograph an area, a piece of equipment or a record (up to 3 photos per check) and pick where it is on board. Claude looks at it the way a SIRE 2.0 inspector would and returns what would be flagged, how serious it is, why, and the fix, with numbered markers on the photo and similar findings from the real, de-identified observations in `app/src/gen/obs.json`. Results can be copied as a defect list, and any finding can be taken to Ask NilObs.

- Photos are shrunk on the phone to at most 1280 px and re-encoded as JPEG, which drops GPS and other metadata. They go to `/api/ai` for that one check and are never stored or logged; only a small thumbnail and the findings stay in the browser (`sr.photos`, last 10 checks).
- The app asks crews to keep faces, the ship's name and the IMO number out of the frame, and Claude is told never to write any of them down.
- Photos always use `NILOBS_MODEL` (the vision model), have their own per-IP limit (`NILOBS_PHOTO_PER_MINUTE`, default 4) and are checked on the server: at most 3 per request, JPEG/PNG/WebP/GIF, about 1.5 MB each.
- If the photo isn't of a ship, the check is refunded. The pure logic (areas, examples, prompt, clean-up of the reply) is in `app/src/photo.ts`, tested in `app/tests/photo.test.mjs`.

**Checkout is simulated in this version** and credits live in each visitor's browser. Before charging money: add accounts, move the wallet to the server (Cloudflare D1 works well) and connect Razorpay or Stripe.

## Keep costs under control

- In the Anthropic Console, set a **monthly spend limit** for this key.
- The endpoint only accepts requests from the site's own origin, caps input size, and limits each IP to `NILOBS_RATE_PER_MINUTE` requests a minute (default 12, per Worker instance), with a tighter `NILOBS_PHOTO_PER_MINUTE` (default 4) for photo checks. For limits shared across Cloudflare's network, uncomment the `ratelimits` block in `wrangler.jsonc`.
- Credits, streaks and progress are stored in each visitor's browser in this version. Before charging money, add real accounts and server-side credit checks.

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

## Work on it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # put your key in .dev.vars (never commit it)
npm run dev                      # site and AI at http://localhost:8787
npm test                         # Worker tests (fake Anthropic and Rumik APIs) and credit-economy tests
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
public/sw.js       offline copy of the app for use at sea
app/src            app source (React, Tailwind v4, Magic UI components)
app/src/gen        de-identified fleet data (stories, observations, flashcards, ready kit)
app/src/economy.ts plans, prices, credit rules (pure functions, tested)
app/src/photo.ts   Photo check: areas, examples, prompt, reply clean-up (pure, tested)
app/build.mjs      builds public/index.html
tests/             Worker tests (app/tests: economy and Photo check)
```

## Data

Stories, observations and flashcards are paraphrased from crew debriefs, SIRE 2.0 / CDI / pre-vetting reports and superintendents' notes, with ship, crew, inspector and company names removed. Confirm you have the right to publish the source material, and have a master mariner review the flashcard answers before launch. AI answers can be wrong; the app tells users to check their SMS and the current rules. Not affiliated with OCIMF.
