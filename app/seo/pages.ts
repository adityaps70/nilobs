// Public pages for search engines: one page per inspection topic (what inspectors look for, sample questions with
// short answers, real observations, roles that answer for it), a topic index, robots.txt and sitemap.xml.
// Built by app/build.mjs --hosted into public/sire/. Everything here comes from the app's own de-identified content;
// no OCIMF question wording. Plain HTML and CSS, no scripts.
import { CARDS, CHAPTER_NAMES, OBS, TYPE_NAME } from "@/fleet"
import { TOPIC_EVIDENCE, TOPIC_TASK, type Topic } from "@/data"
import { ROLES } from "@/roles"
import { CONTENT_REVIEWED, OPERATOR } from "@/meta"

export interface Page { path: string; body: string; type?: string }

const TOPICS = Object.keys(TOPIC_EVIDENCE) as Topic[]
export const slug = (t: string) => t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** Why inspectors care, in one or two sentences (our words). */
const WHY: Record<Topic, string> = {
  ECDIS: "Inspectors check that every officer of the watch can use the ship's own ECDIS type, that safety settings follow the company procedure, and that the crew knows what to do if it fails.",
  Radar: "Radar questions are about the equipment as much as the operator: maintenance against the maker's limits, performance checks and the company's guidance on using it.",
  UKC: "Under-keel clearance is a favourite with inspectors because it joins policy, calculation and practice: the company rule, the figures for this port and the echo sounder alarm.",
  "Passage planning": "A passage plan is judged berth to berth: abort points, no-go areas, pilot information and whether the plan on the bridge is the one the team actually follows.",
  GMDSS: "GMDSS findings usually come from the logbook: daily, weekly and monthly tests, battery checks and EPIRB and SART tests that match the equipment.",
  "Alarm & power-fail tests": "Inspectors ask to see power-failure tests for bridge equipment and compare the dates with the planned maintenance system.",
  "Equipment tests vs PMS": "Many observations are simply records that don't match: a test done but not logged, or logged on a different date from the planned maintenance system.",
  "Documents & SMS": "Certificates, the safety management system and the PIQ have to agree with each other and with the ship, and the crew should know where the SMS covers each job.",
  "Rest hours & drills": "Rest-hour records are cross-checked against drill times, the bell book and the log, so a drill outside the recorded hours stands out at once.",
  "Defect reporting": "Inspectors look for defects that are reported, risk-assessed and followed through to close-out, with interim measures where the fix has to wait.",
  Watchkeeping: "Watchkeeping questions test standing orders, handovers and how the bridge team works in practice, often through a short interview with the officer of the watch.",
  Steering: "Steering gear tests, timings and emergency steering drills are checked against the records, and crew may be asked to show the changeover.",
  "LSA & FFA": "Life-saving and fire-fighting equipment is inspected for condition and records: inspection intervals, expiry dates and crew who know how to use it.",
  "Engine room": "In the engine room inspectors look at unmanned machinery space alarms, the oily water separator and the condition and records of critical equipment.",
  Cargo: "Cargo questions cover the current operation, the plan and the people: who is on duty, what they were briefed on and whether officers hold the right endorsements.",
  "PIQ accuracy": "The pre-inspection questionnaire has to match the ship as she is on the day, including photos, so every change on board needs to reach the PIQ.",
  "Permits & RA": "Permits to work and risk assessments are checked for routine jobs as well as big ones, and the names on the permit must match who did the work.",
  "Emergency equipment": "Crew may be asked to start the emergency generator or emergency fire pump and show escape routes, so it pays to have practised it.",
  "Gas testing & enclosed space": "Gas detectors, calibration records, span gas and enclosed space entry procedures are checked closely, along with how the crew uses them.",
  "PPE & personal safety": "Personal protective equipment is checked for condition and dates, such as helmet manufacture dates, and whether working lifejackets are maintained.",
  "Mooring & access": "Mooring observations often come from lines, tails and winch brakes against the mooring system management plan, and from gangway and pilot ladder rigging.",
  "Pollution prevention": "Oil record books, the garbage management plan and ODME records are compared with soundings, printouts and the bridge clock.",
  "Security & cyber": "Security plans, drills and gangway control are checked, and cyber security now includes training records and a register of IT and OT equipment.",
  "Training & certificates": "The officers' matrix, discharge books, endorsements and course certificates have to match each other and the ship type.",
  "Hull & condition": "General condition is judged by eye: hull damage that's reported to class, coatings and corrosion, and photos that match what the inspector sees.",
}

const CSS = `:root{--bg:#f4f8fc;--ink:#0d1b2e;--mute:#4a5b70;--line:#d9e3ee;--accent:#0d5bc4;--card:#ffffff}
@media (prefers-color-scheme:dark){:root{--bg:#0b1320;--ink:#e8eef6;--mute:#a3b2c4;--line:#22324a;--accent:#7cb3ff;--card:#111c2e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}header,main,footer{max-width:860px;margin:0 auto;padding:0 16px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:20px}
.brand{font-weight:800;font-size:20px;text-decoration:none;color:var(--ink)}.brand span{color:var(--accent)}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;border-radius:999px;padding:10px 18px;font-size:15px}
@media (prefers-color-scheme:dark){.cta{color:#06101f}}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;margin:28px 0 8px}h2{font-size:21px;margin:36px 0 10px}
.lead{font-size:18px;color:var(--mute)}.crumbs{font-size:14px;color:var(--mute);margin-top:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:10px 0}
.q{font-weight:600}.meta{font-size:13px;color:var(--mute)}ul{padding-left:20px}li{margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin:12px 0}
.grid a{display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;text-decoration:none;color:var(--ink)}
.grid a b{display:block}.grid a span{font-size:13px;color:var(--mute)}
.band{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin:32px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
footer{color:var(--mute);font-size:13px;padding-bottom:48px;margin-top:40px;border-top:1px solid var(--line);padding-top:16px}`

function shell(o: { site: string; path: string; title: string; desc: string; body: string; ld: unknown[] }) {
  const url = `${o.site}${o.path}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${esc(o.site)}/brand/nilobs-lockup.png">
<meta name="twitter:card" content="summary_large_image">
<style>${CSS}</style>
${o.ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<header><a class="brand" href="/">Nil<span>Obs</span></a><a class="cta" href="/#app">Practise free</a></header>
<main>
${o.body}
</main>
<footer>NilObs is a study aid for SIRE 2.0 and similar inspections, run by ${esc(OPERATOR)}. Content last reviewed ${esc(CONTENT_REVIEWED)}; written from de-identified inspection reports, crew debriefs and public guidance. It isn't OCIMF guidance and NilObs isn't affiliated with OCIMF: always check against your SMS. <a href="/about">About</a> · <a href="/sire/">All topics</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>
</body>
</html>
`
}

function topicData(t: Topic) {
  const cards = CARDS.filter((c) => c.p === t && c.d === "trending" && c.a && c.q)
  const all = CARDS.filter((c) => c.p === t)
  const obs = OBS.filter((o) => o.p === t)
  const sire = obs.filter((o) => o.i === "SIRE 2.0").sort((a, b) => (a.s === b.s ? 0 : a.s === "2026" ? -1 : 1))
  const roles = ROLES.filter((r) => r.topics.includes(t)).map((r) => r.name)
  return { cards, all, obs, sire, roles }
}

export function buildPages(site: string): Page[] {
  const pages: Page[] = []
  const counts = TOPICS.map((t) => ({ t, ...topicData(t) }))
  for (const { t, cards, all, obs, sire, roles } of counts) {
    const path = `/sire/${slug(t)}`
    const sample = cards.slice(0, 6)
    const shown = (sire.length ? sire : obs).slice(0, 8)
    const title = `${t}: what SIRE 2.0 inspectors ask and find | NilObs`
    const desc = `${t} in SIRE 2.0 tanker inspections: what inspectors want to see, ${sample.length ? "sample questions with answers, " : ""}${shown.length} real observations and how to avoid them.`.slice(0, 300)
    const others = TOPICS.filter((x) => x !== t).slice(0, 25)
    const body = `<nav class="crumbs"><a href="/">NilObs</a> › <a href="/sire/">SIRE 2.0 topics</a> › ${esc(t)}</nav>
<h1>${esc(t)}: what SIRE 2.0 inspectors ask and find</h1>
<p class="lead">${esc(WHY[t])}</p>
${TOPIC_TASK[t] ? `<div class="card"><b>Do this before the inspector arrives:</b> ${esc(TOPIC_TASK[t])}.</div>` : ""}
<h2>What the inspector wants to see</h2>
<ul>${TOPIC_EVIDENCE[t].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${sample.length ? `<h2>Questions inspectors ask about ${esc(t)}</h2>
${sample.map((c) => `<div class="card"><div class="q">${esc(c.q)}</div><div>${esc(c.a)}</div></div>`).join("\n")}
${all.length > sample.length ? `<p>There are ${all.length} ${esc(t)} questions in NilObs, with spaced repetition so the ones you miss come back. <a href="/#app/train">Practise them free</a>.</p>` : ""}` : ""}
${shown.length ? `<h2>Real ${esc(t)} observations, and how to avoid them</h2>
<p class="meta">From ${obs.length} de-identified observations in SIRE 2.0, CDI and pre-vetting reports from 2025 and 2026. Wording paraphrased; ship, crew and company names removed.</p>
${shown.map((o) => `<div class="card"><div class="q">${esc(o.t)}</div><div><b>Avoid it:</b> ${esc(o.f)}</div><div class="meta">${esc(o.i)}${o.c ? ` · Chapter ${o.c} ${esc(CHAPTER_NAMES[o.c] || "")}` : ""}${o.y ? ` · ${esc(TYPE_NAME[o.y])} observation` : ""}</div></div>`).join("\n")}` : ""}
${roles.length ? `<h2>Who answers for ${esc(t)}</h2><p>${roles.map(esc).join(", ")}. NilObs picks the questions and the daily drill for your role.</p>` : ""}
<div class="band"><span><b>Rehearse ${esc(t)} before your next inspection.</b><br><span class="meta">A 5-minute daily drill for your role, an AI inspector that grades your answers, and live industry updates. Free to start.</span></span><a class="cta" href="/#app">Start free</a></div>
<h2>Other topics</h2>
<div class="grid">${others.map((x) => `<a href="/sire/${slug(x)}"><b>${esc(x)}</b><span>${counts.find((c) => c.t === x)!.obs.length} observations</span></a>`).join("")}</div>`
    const ld: unknown[] = [
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "NilObs", item: `${site}/` },
        { "@type": "ListItem", position: 2, name: "SIRE 2.0 topics", item: `${site}/sire/` },
        { "@type": "ListItem", position: 3, name: t, item: `${site}${path}` },
      ] },
      { "@context": "https://schema.org", "@type": "Article", headline: `${t}: what SIRE 2.0 inspectors ask and find`, description: desc, dateModified: "2026-10-28", publisher: { "@type": "Organization", name: OPERATOR, url: `${site}/about` }, mainEntityOfPage: `${site}${path}` },
    ]
    if (sample.length) ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: sample.map((c) => ({ "@type": "Question", name: c.q, acceptedAnswer: { "@type": "Answer", text: c.a } })) })
    pages.push({ path: `${path}.html`, body: shell({ site, path, title, desc, body, ld }) })
  }
  // the index
  const total = OBS.length
  const indexBody = `<nav class="crumbs"><a href="/">NilObs</a> › SIRE 2.0 topics</nav>
<h1>SIRE 2.0 inspection topics: what inspectors ask and find</h1>
<p class="lead">${TOPICS.length} topics that come up in SIRE 2.0 tanker inspections, each with what the inspector wants to see, sample questions and some of the ${total} real observations NilObs has gathered from de-identified inspection reports. Pick a topic to start.</p>
<div class="grid">${counts.map((c) => `<a href="/sire/${slug(c.t)}"><b>${esc(c.t)}</b><span>${c.obs.length} observations · ${c.all.length} questions</span></a>`).join("")}</div>
<div class="band"><span><b>Practise the topics for your role.</b><br><span class="meta">Every rank on board and the shore team. A daily drill, flashcards and an AI inspector. Free to start.</span></span><a class="cta" href="/#app">Start free</a></div>`
  pages.push({
    path: "/sire/index.html",
    body: shell({
      site, path: "/sire/", title: "SIRE 2.0 inspection topics: questions and observations | NilObs",
      desc: `What SIRE 2.0 inspectors ask and find across ${TOPICS.length} topics, from ECDIS to mooring: what to have ready, sample questions and real observations.`,
      body: indexBody,
      ld: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "SIRE 2.0 inspection topics", url: `${site}/sire/`, hasPart: TOPICS.map((t) => ({ "@type": "WebPage", name: t, url: `${site}/sire/${slug(t)}` })) }],
    }),
  })
  // robots and sitemap
  const urls = ["/", "/sire/", ...TOPICS.map((t) => `/sire/${slug(t)}`), "/about", "/privacy", "/terms", "/refunds"]
  pages.push({ path: "/sitemap.xml", type: "xml", body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site}${u}</loc><lastmod>2026-10-28</lastmod></url>`).join("\n")}\n</urlset>\n` })
  pages.push({ path: "/robots.txt", type: "txt", body: `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /receipt/\nDisallow: /join/\n\nSitemap: ${site}/sitemap.xml\n` })
  return pages
}
