// Copies the real web app (../index.html at the repo root, the same file
// Cloudflare serves) into mobile/www so Capacitor can bundle it into the APK.
//
// There is deliberately no build step: the web app is a single hand-written
// HTML file. This script is the only thing that keeps the native copy in sync,
// and `npm run sync` runs it automatically before `cap sync`.

import { copyFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(here, '..');
const repoRoot = resolve(mobileDir, '..');
const wwwDir = join(mobileDir, 'www');

// Everything the web app needs to run. Add files here if the app ever grows
// past a single document.
const WEB_FILES = ['index.html'];

if (process.argv.includes('--clean')) {
  if (existsSync(wwwDir)) rmSync(wwwDir, { recursive: true, force: true });
  console.log('cleaned mobile/www');
  process.exit(0);
}

mkdirSync(wwwDir, { recursive: true });

for (const name of WEB_FILES) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) {
    console.error(`missing web asset: ${name}`);
    process.exit(1);
  }
  copyFileSync(from, join(wwwDir, name));
  console.log(`synced ${name}`);
}
