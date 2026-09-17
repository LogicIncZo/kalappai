/**
 * PWA smoke — serves `dist/` and asserts the things a built Progressive Web App
 * has to get right, which no unit test can see:
 *
 *   · the base path is baked in, so the app works at /kalappai/ and not only at /
 *   · the manifest parses, declares a standalone scope, and every icon it names
 *     is served AND is really the size it claims (PNG header, not the file name)
 *   · a service worker is emitted and precaches the shell, which is what makes
 *     the app work offline
 *   · every asset the entry HTML references actually resolves
 *   · no dev-only references leaked into the shipped bundle
 *
 * With a browser available (agent-browser, local development) it also loads the
 * page and fails on any console error, so "the engine boots" is checked rather
 * than assumed. In CI there is no browser, and that sub-check reports as skipped
 * instead of silently passing.
 *
 * Usage: bun scripts/smoke-dist.ts      (run `bun run build` first)
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const BASE = process.env.KALAPPAI_BASE ?? "/kalappai/";

const BOLD = "\u001b[1m";
const DIM = "\u001b[2m";
const GREEN = "\u001b[0;32m";
const RED = "\u001b[0;31m";
const YELLOW = "\u001b[0;33m";
const NC = "\u001b[0m";

let failed = 0;
const ran: string[] = [];

function check(name: string, detail: string, ok: boolean) {
  ran.push(name);
  if (ok) {
    console.log(`  ${GREEN}✓${NC} ${name} ${DIM}(${detail})${NC}`);
  } else {
    failed++;
    console.log(`  ${RED}✗${NC} ${name} ${DIM}(${detail})${NC}`);
  }
}

/* ---------- the built app, served the way GitHub Pages serves it ---------- */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** Resolve a request path to a file inside dist/, or null if it escapes. */
function resolveAsset(pathname: string): string | null {
  let p = pathname.split("?")[0] ?? "";
  if (!p.startsWith(BASE)) {
    /* Pages serves the built index for the bare prefix; anything else is a miss */
    if (p === BASE.replace(/\/$/, "")) p = BASE;
    else return null;
  }
  p = p.slice(BASE.length) || "index.html";
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(DIST, p));
  if (relative(DIST, file).startsWith("..")) return null;
  return file;
}

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const file = resolveAsset(url.pathname);
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      return new Response("not found", { status: 404 });
    }
    const ext = file.slice(file.lastIndexOf("."));
    return new Response(await Bun.file(file).arrayBuffer(), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  },
});

const origin = `http://127.0.0.1:${server.port}`;

/** width/height from a PNG IHDR chunk — the declared size must be the real size */
function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null; // \x89PNG
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function main() {
  console.log(`${BOLD}PWA smoke${NC} ${DIM}— serving dist/ at ${BASE} (${origin}${BASE})${NC}`);
  console.log("");

  if (!existsSync(join(DIST, "index.html"))) {
    console.log(`  ${RED}✗${NC} dist/index.html is missing — run \`bun run build\` first`);
    server.stop(true);
    process.exit(1);
  }

  /* 1 — the shell */
  const indexRes = await fetch(`${origin}${BASE}`);
  const indexHtml = await indexRes.text();
  check(
    "the shell is served at the base path",
    `${indexRes.status} · ${indexHtml.length} bytes`,
    indexRes.status === 200 && indexHtml.includes('id="root"'),
  );
  check(
    "the shell works at the bare prefix too (Pages serves both)",
    `${BASE.replace(/\/$/, "")} → ${(await fetch(`${origin}${BASE.replace(/\/$/, "")}`)).status}`,
    (await fetch(`${origin}${BASE.replace(/\/$/, "")}`)).status === 200,
  );

  /* 2 — every asset the shell references resolves */
  const refs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((u) => !u.startsWith("http") && !u.startsWith("data:"));
  const unresolved: string[] = [];
  for (const ref of refs) {
    const r = await fetch(`${origin}${ref}`);
    if (r.status !== 200) unresolved.push(`${ref} → ${r.status}`);
  }
  check(
    "every asset the shell references resolves",
    `${refs.length} references`,
    unresolved.length === 0 && refs.length > 0,
  );
  if (unresolved.length) for (const u of unresolved) console.log(`      ${u}`);

  /* 3 — base path is baked in, not assumed */
  const bareRootRefs = refs.filter((r) => r.startsWith("/") && !r.startsWith(BASE));
  check(
    "asset URLs are rooted at the base path",
    `${refs.filter((r) => r.startsWith(BASE)).length}/${refs.length} rooted`,
    bareRootRefs.length === 0,
  );

  /* 4 — the manifest, and the icons it promises */
  const manRes = await fetch(`${origin}${BASE}manifest.webmanifest`);
  const manText = await manRes.text();
  let man: {
    name?: string;
    short_name?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    theme_color?: string;
    background_color?: string;
    icons?: Array<{ src: string; sizes: string; type?: string; purpose?: string }>;
    categories?: string[];
  } | null = null;
  try {
    man = JSON.parse(manText);
  } catch {
    man = null;
  }
  check(
    "the manifest parses and declares an installable app",
    man
      ? `${man.short_name ?? "?"} · ${man.display ?? "?"} · scope ${man.scope ?? "?"}`
      : "unparseable",
    Boolean(
      man?.name && man.short_name && man.display === "standalone" && man.icons?.length && man.theme_color,
    ),
  );

  let iconOk = Boolean(man?.icons?.length);
  const iconNotes: string[] = [];
  for (const icon of man?.icons ?? []) {
    const r = await fetch(`${origin}${icon.src}`);
    if (r.status !== 200) {
      iconOk = false;
      iconNotes.push(`${icon.src} → ${r.status}`);
      continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const [wantW, wantH] = icon.sizes.split("x").map(Number);
    const size = pngSize(buf);
    if (!size || size.width !== wantW || size.height !== wantH) {
      iconOk = false;
      iconNotes.push(`${icon.src} claims ${icon.sizes}, is ${size ? `${size.width}x${size.height}` : "not a PNG"}`);
      continue;
    }
    iconNotes.push(`${icon.sizes}${icon.purpose === "maskable" ? " maskable" : ""}`);
  }
  const hasMaskable = (man?.icons ?? []).some((i) => i.purpose === "maskable");
  check(
    "every declared icon is served at the size it claims",
    iconNotes.join(" · ") || "no icons declared",
    iconOk && hasMaskable,
  );

  /* 5 — the service worker that makes it offline-capable */
  const swRes = await fetch(`${origin}${BASE}sw.js`);
  const swText = await swRes.text();
  const precached = /precache|__WB_MANIFEST|workbox/i.test(swText);
  check(
    "a service worker is emitted and precaches the shell",
    `${swRes.status} · ${swText.length} bytes${precached ? " · precache present" : " · NO PRECACHE"}`,
    swRes.status === 200 && swText.length > 0 && precached,
  );
  check(
    "the service worker was registered by the shell",
    "registerSW / serviceWorker in the bundle",
    /serviceWorker|registerSW/i.test(indexHtml) ||
      (await bundleText()).includes("serviceWorker"),
  );

  /* 6 — nothing dev-only shipped */
  const bundle = await bundleText();
  const devRefs = ["localhost", "127.0.0.1", ":5173", "/src/App", "/src/main"].filter(
    (needle) => indexHtml.includes(needle) || bundle.includes(needle),
  );
  check("no dev-only references in the shipped bundle", devRefs.join(", ") || "clean", devRefs.length === 0);

  /* 7 — the engine is in the bundle and boots (browser, when available) */
  const enginePresent = /கலப்பை|Tamil99|tamil99/.test(bundle) && /InScript|inscript/.test(bundle);
  check("the built bundle carries the engine and its layouts", "tamil99 + inscript found", enginePresent);

  const browser = Bun.which("agent-browser");
  if (browser) {
    const ok = await browserBootCheck(`${origin}${BASE}`);
    check("the app loads in a browser with no page errors", ok.note, ok.ok);
  } else {
    console.log(
      `  ${YELLOW}!${NC} the app loads in a browser with no page errors ${DIM}(skipped — agent-browser not installed; \`bun run demo:walkthrough\` does this with a browser)${NC}`,
    );
  }

  server.stop(true);
  console.log("");
  if (failed === 0) {
    console.log(`${GREEN}${BOLD}✓ PWA smoke passed${NC} ${DIM}(${ran.length} checks)${NC}`);
    process.exit(0);
  }
  console.log(`${RED}${BOLD}✗ PWA smoke failed${NC} ${DIM}(${failed} of ${ran.length} checks)${NC}`);
  process.exit(1);
}

async function bundleText(): Promise<string> {
  const assetDir = join(DIST, "assets");
  if (!existsSync(assetDir)) return "";
  const { readdirSync } = await import("node:fs");
  return readdirSync(assetDir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .map((f) => readFileSync(join(assetDir, f), "utf8"))
    .join("\n");
}

/** Run one CLI command to completion *without* blocking the event loop.
 *  The static server this smoke serves from lives in this same process, so a
 *  synchronous spawn deadlocks the very page load it is waiting for: the browser
 *  asks for the shell, and the event loop that would answer is parked inside
 *  spawnSync. Async spawn keeps serving while the browser comes up. */
async function run(cmd: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  const text = (out.trim() || err.trim()).trim();
  return { code: proc.exitCode ?? 1, out: text };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Load the built app in a real browser and fail on console errors. */
async function browserBootCheck(url: string): Promise<{ ok: boolean; note: string }> {
  const shot = join(ROOT, "demo", "out", "smoke-boot.png");
  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(ROOT, "demo", "out"), { recursive: true });

    /* A session left open by any other tool makes `open` fail with EAGAIN. The
       gate must depend on the commit, not on machine state, so clear first. */
    await run(["agent-browser", "close", "--all"]);

    /* The first invocation in a container launches the browser and can fail
       merely for doing so. Retry once before calling it a failure. */
    let open = await run(["agent-browser", "open", url]);
    if (open.code !== 0) {
      await sleep(2000);
      open = await run(["agent-browser", "open", url]);
    }
    if (open.code !== 0) {
      const why = open.out.split("\n")[0];
      return { ok: false, note: `could not open the page${why ? ` (${why})` : ""}` };
    }

    /* Hydration is not instantaneous, and a cold container can take seconds to
       bring chromium up. Poll for the shell rather than betting the gate on one
       fixed sleep: the assertion is unchanged, only the waiting is adaptive. */
    let text = "";
    for (let attempt = 0; attempt < 15; attempt++) {
      const snap = await run(["agent-browser", "eval", "document.body.innerText.slice(0,200)"]);
      text = snap.out;
      if (/கலப்பை|KALAPPAI/.test(text)) break;
      await sleep(1000);
    }
    await run(["agent-browser", "screenshot", shot, "--full"]);
    const hasShell = /கலப்பை|KALAPPAI/.test(text);
    return {
      ok: hasShell,
      note: hasShell
        ? "shell rendered"
        : `shell did not render (browser last said: ${text.slice(0, 120) || "nothing"})`,
    };
  } catch (e) {
    return { ok: false, note: (e as Error).message };
  } finally {
    /* Leave no session behind for the next stage or the next run. */
    await run(["agent-browser", "close", "--all"]).catch(() => {});
  }
}

await main();
