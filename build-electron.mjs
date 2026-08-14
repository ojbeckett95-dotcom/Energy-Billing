#!/usr/bin/env node
/**
 * build-electron.mjs
 * Full pipeline for building the Windows Electron installer.
 *
 * Uses NEXT_BUILD_DIR=.next-prod so the production build doesn't conflict
 * with the running dev server's .next/ Turbopack cache, and so that
 * outputFileTracingRoot can be scoped to the project root (keeping the
 * standalone output clean — no dev cache pollution).
 *
 *   1. next build       → .next-prod/standalone/server.js  (clean, flat)
 *   2. Copy static      → .next-prod/standalone/.next-prod/static/
 *   3. Copy public      → .next-prod/standalone/public/
 *   4. Bundle scheduler → scheduler.cjs
 *   5. Compile electron → dist-electron/
 *   6. electron-builder → dist/  (NSIS installer)
 *
 * Usage:  node build-electron.mjs
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEXT_BUILD_DIR = ".next-prod";

function run(cmd, label, env = {}) {
  console.log(`\n▶ ${label ?? cmd}`);
  execSync(cmd, {
    stdio: "inherit",
    cwd: __dirname,
    env: { ...process.env, ...env },
  });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ── 1. Next.js build ──────────────────────────────────────────────────────────
// Clean the previous prod build to avoid stale artifacts
const buildOut = path.join(__dirname, NEXT_BUILD_DIR);
if (fs.existsSync(buildOut)) {
  console.log(`\n▶ Cleaning previous build (${NEXT_BUILD_DIR})...`);
  fs.rmSync(buildOut, { recursive: true, force: true });
}

run("bun run build", `Next.js build → ${NEXT_BUILD_DIR}/standalone`, {
  NEXT_BUILD_DIR,
});

// ── Verify / fallback hoist ───────────────────────────────────────────────────
// With outputFileTracingRoot = project root the standalone is clean and flat.
// This block handles the edge case where it's still nested.
const standalone = path.join(__dirname, NEXT_BUILD_DIR, "standalone");
const serverJs = path.join(standalone, "server.js");

if (!fs.existsSync(serverJs)) {
  console.log("\n⚠ server.js not at standalone root — hoisting nested output...");
  function findServerJs(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "server.js") return full;
      if (entry.isDirectory()) { const f = findServerJs(full); if (f) return f; }
    }
    return null;
  }
  const nested = findServerJs(standalone);
  if (!nested) throw new Error("server.js not found in standalone output");
  const nestedDir = path.dirname(nested);
  for (const entry of fs.readdirSync(nestedDir)) {
    const src = path.join(nestedDir, entry);
    const dest = path.join(standalone, entry);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(src, dest);
  }
  const topNest = path.join(standalone, path.relative(standalone, nestedDir).split(path.sep)[0]);
  try { fs.rmSync(topNest, { recursive: true, force: true }); } catch { /* fine */ }
  console.log("  Done.");
}

// ── Never ship the build machine's database or PDFs ───────────────────────────
const tracedData = path.join(standalone, "data");
if (fs.existsSync(tracedData)) {
  console.log("\n▶ Removing traced data/ from standalone output...");
  fs.rmSync(tracedData, { recursive: true, force: true });
}

// ── 2 & 3. Copy static assets ─────────────────────────────────────────────────
// server.js uses distDir=".next-prod" so static files must live at
// standalone/.next-prod/static/ — NOT standalone/.next/static/
console.log("\n▶ Copying static assets...");
copyDir(
  path.join(__dirname, NEXT_BUILD_DIR, "static"),
  path.join(standalone, NEXT_BUILD_DIR, "static")
);
copyDir(path.join(__dirname, "public"), path.join(standalone, "public"));
console.log("  Done.");

// ── 4. Bundle scheduler.ts → scheduler.cjs ───────────────────────────────────
run(
  [
    "bunx esbuild scheduler.ts",
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    "--outfile=scheduler.cjs",
    "--external:modbus-serial",
    "--tsconfig=tsconfig.json",
  ].join(" "),
  "Bundle scheduler.ts → scheduler.cjs"
);

// ── 5. Compile electron/ → dist-electron/ ────────────────────────────────────
run("bunx tsc -p tsconfig.electron.json", "Compile electron/ → dist-electron/");

// ── 6. electron-builder ──────────────────────────────────────────────────────
run(
  "bunx electron-builder --config electron-builder.yml --win",
  "electron-builder → dist/"
);

console.log("\n✅ Build complete — installer is in ./dist/");
