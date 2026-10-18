# NilObs

**Aim for nil.** SIRE 2.0 inspection prep for tanker crews: real observations, rank-wise flashcards, inspection stories, a ready kit, daily missions, and Claude-powered AI (an AI inspector that grades answers, Ask NilObs with sources, close-out drafts and a day-by-day prep plan).

This repo deploys to **Cloudflare Workers**. The Worker serves the site from `public/` and runs the AI endpoint at `/api/ai`. Your Anthropic API key stays on Cloudflare as a secret and never reaches the browser.

## Deploy on Cloudflare (about 5 minutes)

1. **Create the Worker from this repo.** In the Cloudflare dashboard go to **Workers & Pages → Create → Import a repository**, pick `adityaps70/nilobs`, keep the defaults (no build command, deploy command `npx wrangler deploy`) and deploy. Every push to `main` redeploys.
2. **Add your API key as a secret.** Create a key at <https://console.anthropic.com>. In Cloudflare open **Workers & Pages → nilobs → Settings → Variables and Secrets → Add**, choose type **Secret**, name it `ANTHROPIC_API_KEY`, paste the key and save. Cloudflare redeploys with it.
3. **Check it.** Open `https://nilobs.<your-subdomain>.workers.dev/api/health`. It should say `{"ok":true,"ai":true}`. Then open the site and try **Ask AI**.
4. **Optional: your own domain.** Settings → Domains & Routes → Add → Custom domain.

From a terminal instead: `npm install`, `npx wrangler login`, `npx wrangler secret put ANTHROPIC_API_KEY`, `npm run deploy`.

## Keep costs under control

- In the Anthropic Console, set a **monthly spend limit** for this key.
- The endpoint only accepts requests from the site's own origin, caps input size, and limits each IP to `NILOBS_RATE_PER_MINUTE` requests a minute (default 12, per Worker instance). For a limit shared across Cloudflare's network, uncomment the `ratelimits` block in `wrangler.jsonc`.
- Credits, streaks and progress are stored in each visitor's browser in this version. Before charging money, add real accounts and server-side credit checks.

## Settings (`wrangler.jsonc` → `vars`)

| Variable | Default | What it does |
|---|---|---|
| `NILOBS_MODEL` | `claude-sonnet-5-5` | Model for Ask NilObs and the prep plan |
| `NILOBS_MODEL_QUICK` | `claude-haiku-5-5` | Model for grading answers and close-out drafts |
| `NILOBS_RATE_PER_MINUTE` | `12` | AI requests per IP per minute |
| `NILOBS_ALLOWED_ORIGINS` | (the site's own origin) | Extra origins allowed to call `/api/ai`, comma-separated |

## Work on it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # put your key in .dev.vars (never commit it)
npm run dev                      # site and AI at http://localhost:8787
npm test                         # Worker tests with a fake Anthropic API
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
app/src            app source (React, Tailwind v4, Magic UI components)
app/src/gen        de-identified fleet data (stories, observations, flashcards, ready kit)
app/build.mjs      builds public/index.html
tests/             Worker tests
```

## Data

Stories, observations and flashcards are paraphrased from crew debriefs, SIRE 2.0 / CDI / pre-vetting reports and superintendents' notes, with ship, crew, inspector and company names removed. Confirm you have the right to publish the source material, and have a master mariner review the flashcard answers before launch. AI answers can be wrong; the app tells users to check their SMS and the current rules. Not affiliated with OCIMF.
