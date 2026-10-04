#!/usr/bin/env node
/**
 * howto.mjs — dev-only how-to slideshow generator.
 *
 * Loads one of this repo's apps in a real browser, drives it with a step script,
 * screenshots each step, and writes a single self-contained HTML slideshow to
 * tools/out/. The app itself is never modified.
 *
 *   node howto.mjs story.cutonce.mjs
 *
 * tools/ is listed in .assetsignore, so none of this ships to Cloudflare.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(toolsDir, '..');
const outDir = path.join(toolsDir, 'out');
const templatePath = path.join(toolsDir, 'slideshow.template.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function startServer(root) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Runs before any app code. Two jobs:
 *   1. Stand in for SpeechRecognition, which headless Chromium does not have —
 *      otherwise the app's engine probe reports "none" and the mic renders dead,
 *      so the voice screenshots would be a lie. The app builds its own engine
 *      from window.SpeechRecognition, so a stub class is all it takes.
 *   2. Silence Cut Once's first-run walkthrough (unless the story asks for it),
 *      so coach marks don't sit on top of unrelated steps.
 */
const INIT_SCRIPT = (suppressWalkthrough) => {
  if (suppressWalkthrough) localStorage.setItem('cutonce_walkthrough_done', '1');
  class StubSpeechRecognition {
    constructor() {
      window.__srStub = this;
      this.continuous = false;
      this.interimResults = false;
      this.lang = 'en-US';
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onresult = null;
    }
    start() { if (this.onstart) this.onstart(); }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = StubSpeechRecognition;
  window.webkitSpeechRecognition = StubSpeechRecognition;
};

async function rectOf(page, target, label) {
  if (!target) return null;
  if (typeof target !== 'string') return target;
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, target);
  if (!rect) throw new Error(`step "${label}": target ${target} not found in the page`);
  return rect;
}

async function waitForQuiet(page) {
  // let transitions/toasts land so the shot is not caught mid-animation
  await page.waitForTimeout(120);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function makeApi(page, config) {
  const api = {
    page,
    config,
    /** Absolute path to a file in the app folder (for setInputFiles). */
    appFile: (rel) => path.join(appRoot, rel),
    sleep: (ms) => page.waitForTimeout(ms),

    async tap(selector, wait = 250) {
      await page.click(selector);
      await page.waitForTimeout(wait);
    },

    async tapAt(x, y, wait = 250) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(wait);
    },

    async drag(from, to, steps = 16) {
      await page.mouse.move(from[0], from[1]);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          from[0] + ((to[0] - from[0]) * i) / steps,
          from[1] + ((to[1] - from[1]) * i) / steps
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(200);
    },

    /** Fire a phrase through the app's own recognition.onresult -> handleTranscript path. */
    async say(phrase, wait = 350) {
      await page.evaluate((text) => {
        const sr = window.__srStub;
        if (!sr || typeof sr.onresult !== 'function') {
          throw new Error('no speech stub wired up — app did not construct a recognizer');
        }
        const result = [{ transcript: text }];
        result.isFinal = true;
        sr.onresult({ results: [result], resultIndex: 0 });
      }, phrase);
      await page.waitForTimeout(wait);
    },

    /** Read something out of the running app (runs in the page). */
    async read(fn) {
      return await page.evaluate(fn);
    },

    /** Print a line under the step — evidence, not decoration. */
    note(text) {
      console.log(`      · ${text}`);
    },

    /** Fail loudly if the app did not do what this step's caption claims. */
    async expect(fn, label) {
      const value = await page.evaluate(fn);
      if (!value) throw new Error(`step did not do what the caption says: ${label}`);
      return value;
    },

    /** Click the draw button until it reaches the named tool — drives the real cycle. */
    async setTool(name) {
      for (let i = 0; i < 4; i++) {
        const cls = await page.evaluate(() => document.getElementById('toolDraw').className);
        if (cls.includes(`mode-${name}`)) return;
        await page.click('#toolDraw');
        await page.waitForTimeout(80);
      }
      throw new Error(`could not reach tool "${name}"`);
    }
  };
  return api;
}

async function main() {
  const storyFile = process.argv[2];
  if (!storyFile) {
    console.error('usage: node howto.mjs <story.mjs>');
    process.exit(1);
  }
  const story = (await import(pathToFileURL(path.resolve(toolsDir, storyFile)).href)).default;
  const viewport = story.viewport || { width: 412, height: 915 };
  const appPath = story.appPath || '/index.html';

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const { server, port } = await startServer(appRoot);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await context.addInitScript(INIT_SCRIPT, story.suppressWalkthrough !== false);

  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}${appPath}`, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const api = makeApi(page, story);
  const slides = [];

  for (const [index, step] of story.steps.entries()) {
    const label = step.id || `step-${index + 1}`;
    if (step.run) await step.run(api);
    await waitForQuiet(page);

    const shot = `step-${String(index + 1).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: path.join(outDir, shot), type: 'png' });

    const target = await rectOf(page, step.target, label);
    if (target) {
      // An arrow pointing at nothing is worse than no arrow: a zero-sized or
      // off-screen target means the caption is annotating the wrong thing.
      if (target.w < 8 || target.h < 8) {
        throw new Error(`step "${label}": target is ${Math.round(target.w)}x${Math.round(target.h)}px — too small to point at`);
      }
      const offBy = Math.max(0, -target.x, -target.y, target.x + target.w - viewport.width, target.y + target.h - viewport.height);
      if (offBy > 4) {
        throw new Error(`step "${label}": target sits ${Math.round(offBy)}px outside the ${viewport.width}x${viewport.height} viewport`);
      }
    }

    slides.push({
      file: shot,
      title: step.title || `Step ${index + 1}`,
      caption: step.caption || '',
      sub: step.sub || '',
      target,
      arrow: step.arrow || null,
      cta: step.cta || null
    });
    console.log(`  ✓ ${index + 1}/${story.steps.length}  ${label}`);
  }

  // Re-encode for the slideshow: the PNGs stay on disk for debugging, but flat UI
  // screenshots at 2x cost ~9 MB across a story this long, which is miserable to
  // email. JPEG at 0.9 brings the same slides in around a sixth of that.
  const slidesWithImages = [];
  for (const slide of slides) {
    const png = fs.readFileSync(path.join(outDir, slide.file)).toString('base64');
    const jpeg = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.9);
    }, png);
    slidesWithImages.push({ ...slide, data: jpeg });
  }

  const template = fs.readFileSync(templatePath, 'utf8');

  const html = template
    .replaceAll('__TITLE__', story.title)
    .replaceAll('__SUMMARY__', story.summary || '')
    .replaceAll('__VIEWPORT_W__', String(viewport.width))
    .replaceAll('__VIEWPORT_H__', String(viewport.height))
    .replace('__SLIDES_JSON__', JSON.stringify(slidesWithImages));

  const outFile = path.join(outDir, story.output || 'howto.html');
  fs.writeFileSync(outFile, html);

  // Walk the built slideshow once. A dead Next button or an overlay that throws
  // should fail here, not in someone's hands.
  const check = await context.newPage();
  const checkErrors = [];
  check.on('console', (m) => { if (m.type() === 'error') checkErrors.push(m.text()); });
  check.on('pageerror', (e) => checkErrors.push(String(e)));
  await check.goto(pathToFileURL(outFile).href, { waitUntil: 'load' });
  await check.waitForTimeout(250);
  for (let n = 1; n < slides.length; n++) await check.click('#next');
  const counter = (await check.textContent('#count')).trim();
  await check.click('#prev');
  await check.click('#prev');
  const marks = await check.evaluate(() => ({
    ring: document.querySelectorAll('#overlay .ring').length,
    arrow: document.querySelectorAll('#overlay .arrow-head').length
  }));

  // Every inlined frame must actually decode, and nothing may reach off the file
  // for a network resource — this file is meant to open on a phone in a truck.
  const integrity = await check.evaluate(async () => {
    const probe = new Image();
    const bad = [];
    let width = 0, height = 0;
    for (let i = 0; i < SLIDES.length; i++) {
      if (!SLIDES[i].caption || !SLIDES[i].title) bad.push(`slide ${i + 1} has no caption`);
      probe.src = SLIDES[i].data;
      try { await probe.decode(); } catch (err) { bad.push(`slide ${i + 1} will not decode`); continue; }
      width = probe.naturalWidth;
      height = probe.naturalHeight;
      if (width < 200 || height < 400) bad.push(`slide ${i + 1} decoded at a suspicious ${width}x${height}`);
    }
    const external = [...document.querySelectorAll('[src]')]
      .map((el) => el.getAttribute('src'))
      .filter((src) => /^https?:/i.test(src));
    return { total: SLIDES.length, bad, width, height, external: external.length };
  });
  await check.close();
  await browser.close();
  server.close();

  if (checkErrors.length) throw new Error(`slideshow console errors: ${checkErrors.join(' | ')}`);
  if (counter !== `${slides.length} / ${slides.length}`) throw new Error(`slideshow navigation ended on "${counter}"`);
  if (!marks.ring || !marks.arrow) throw new Error('annotated slide rendered without a ring/arrow overlay');
  if (integrity.bad.length) throw new Error(`slideshow integrity: ${integrity.bad.join('; ')}`);
  if (integrity.external) throw new Error(`slideshow reaches out to ${integrity.external} external resource(s) — it must work offline`);

  const rawBytes = slidesWithImages.reduce((n, s) => n + Buffer.byteLength(s.data), 0);
  console.log(`\n${slides.length} slides -> ${path.relative(appRoot, outFile)}`);
  console.log(`   inline images ${(rawBytes / 1024 / 1024).toFixed(2)} MB raw, file ${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   ${integrity.total} frames decode at ${integrity.width}x${integrity.height}px, ${integrity.external} external refs`);
  console.log(`   page console errors: ${consoleErrors.length}`);
  for (const line of consoleErrors.slice(0, 10)) console.log(`   ! ${line}`);
}

main().catch((err) => { console.error('\nfailed:', err.message); process.exit(1); });
