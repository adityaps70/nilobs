// Builds NilObs into one self-contained HTML file.
//   node build.mjs --hosted   -> ../public/index.html  (your own domain; AI calls /api/ai on the Worker)
//   node build.mjs            -> dist/page.html        (Claude artifact; AI runs on the viewer's Claude)
// Normal use: `npm install` here, then `npm run build`. NILOBS_VENDOR / NILOBS_NODE_PATH are only for offline sandboxes.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"
import { compile } from "tailwindcss"

const here = path.dirname(fileURLToPath(import.meta.url))
const hosted = process.argv.includes("--hosted")
const outIdx = process.argv.indexOf("--out")
const out = outIdx > 0 ? path.resolve(process.argv[outIdx + 1]) : hosted ? path.join(here, "..", "public", "index.html") : path.join(here, "dist", "page.html")
const vendor = process.env.NILOBS_VENDOR || ""
const extraNodePath = process.env.NILOBS_NODE_PATH || ""

const define = {
  "process.env.NODE_ENV": '"production"',
  __AI_ENDPOINT__: JSON.stringify(hosted ? "/api/ai" : ""),
}
let alias = {}
if (vendor) {
  // Offline sandbox: compile motion, cobe and canvas-confetti from source checkouts
  const texture = (await import(pathToFileURL(path.join(vendor, "cobe064/src/texture.js")))).default
  const shader = await import(pathToFileURL(path.join(vendor, "cobe064/src/shader.min.js")))
  define.__TEXTURE__ = JSON.stringify(texture)
  for (const [k, v] of Object.entries(shader)) define[k] = JSON.stringify(v)
  const mp = (p) => path.join(vendor, "motion/packages", p)
  alias = {
    "motion/react": mp("framer-motion/src/index.ts"),
    "framer-motion": mp("framer-motion/src/index.ts"),
    "motion-dom": mp("motion-dom/src/index.ts"),
    "motion-utils": mp("motion-utils/src/index.ts"),
    phenomenon: path.join(vendor, "phenomenon/src/index.ts"),
    cobe: path.join(vendor, "cobe064/src/index.js"),
    "canvas-confetti": path.join(vendor, "canvas-confetti/src/confetti.js"),
  }
}

const result = await esbuild.build({
  entryPoints: [path.join(here, "src/main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  legalComments: "none",
  define,
  alias,
  nodePaths: [path.join(here, "node_modules"), ...(extraNodePath ? [extraNodePath] : [])],
  external: ["@emotion/is-prop-valid"],
  logLevel: "warning",
})
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")

// ---- Tailwind v4
const req = createRequire(path.join(here, "package.json"))
const resolveTw = (sub) => {
  for (const base of [here, extraNodePath].filter(Boolean)) {
    try {
      return createRequire(path.join(base, "x.js")).resolve(`tailwindcss/${sub}`)
    } catch {
      /* try the next */
    }
  }
  return req.resolve(`tailwindcss/${sub}`)
}
const cssEntry = path.join(here, "src/index.css")
const compiler = await compile(fs.readFileSync(cssEntry, "utf8"), {
  base: path.dirname(cssEntry),
  async loadStylesheet(id, base) {
    let file
    if (id === "tailwindcss") file = resolveTw("index.css")
    else if (id.startsWith("tailwindcss/")) file = resolveTw(id.slice(12))
    else file = path.resolve(base, id)
    return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") }
  },
  async loadModule(id) {
    throw new Error("no module loading: " + id)
  },
})
const candidates = new Set()
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(f))
      for (const re of [/[\s"'`{}<>]+/, /[\s"'`{}]+/])
        for (const t of fs.readFileSync(p, "utf8").split(re)) if (t) candidates.add(t.replace(/^\$\{?|[,;]$/g, ""))
  }
}
walk(path.join(here, "src"))
const css = compiler.build([...candidates])

const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">`
// The public address. Social previews need absolute links; set NILOBS_SITE_URL to build for another domain.
const SITE = (process.env.NILOBS_SITE_URL || "https://nilobs.com").replace(/\/$/, "")
const DESC = "SIRE 2.0 inspection prep for every tanker rank and the shore team: real observations, rank-wise flashcards, an AI inspector and daily missions. Aim for nil."
fs.mkdirSync(path.dirname(out), { recursive: true })
if (hosted) {
  fs.writeFileSync(
    out,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>NilObs</title>
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#0d5bc4">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/nilobs-app-icon-512.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="canonical" href="${SITE}/">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:title" content="NilObs">
<meta property="og:description" content="${DESC}">
<meta property="og:image" content="${SITE}/brand/nilobs-lockup.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${FONTS}
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`
  )
} else {
  const page = `<title>NilObs</title>
<meta name="claude:viewport-fit-sides" content="cover">
${FONTS}
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`
  fs.writeFileSync(out, page)
  fs.writeFileSync(out.replace(/\.html$/, ".preview.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${page}</body></html>`)
}
if (hosted) {
  // The admin dashboard is served by the Worker itself (only to admins), never as a public file
  const admin = fs.readFileSync(path.join(here, "admin", "admin.html"), "utf8")
  const adminOut = path.join(here, "..", "worker", "admin-page.js")
  fs.writeFileSync(adminOut, `// Built from app/admin/admin.html by app/build.mjs --hosted. Edit that file, not this one.\nexport default ${JSON.stringify(admin)}\n`)
  console.log("ok admin", adminOut, (fs.statSync(adminOut).size / 1024).toFixed(0) + "KB")
}
if (hosted) {
  // Public topic pages for search engines (app/seo/pages.ts), plus robots.txt and sitemap.xml
  const seo = await esbuild.build({
    entryPoints: [path.join(here, "seo/pages.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: ["node18"],
    nodePaths: [path.join(here, "node_modules"), ...(extraNodePath ? [extraNodePath] : [])],
    logLevel: "warning",
  })
  const mod = await import("data:text/javascript;base64," + Buffer.from(seo.outputFiles[0].text).toString("base64"))
  const pub = path.join(here, "..", "public")
  fs.rmSync(path.join(pub, "sire"), { recursive: true, force: true })
  const pages = mod.buildPages(SITE)
  for (const pg of pages) {
    const file = path.join(pub, pg.path.replace(/^\//, ""))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, pg.body)
  }
  console.log("ok seo", pages.length, "files (public/sire, sitemap.xml, robots.txt)")
}
console.log("ok", hosted ? "hosted" : "artifact", out, (fs.statSync(out).size / 1024).toFixed(0) + "KB")
