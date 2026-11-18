// Renders the pictures for the Chrome Web Store listing into store\ :
//   store\screenshots\de\*.png and store\screenshots\en\*.png   (1280 x 800)
//   store\promo-tile-440x280.png
//
//   node tools\make-store-images.mjs
//
// It starts a hidden Microsoft Edge with the extension loaded (the installed Chrome refuses
// --load-extension), photographs the real popup in a few states and places those pictures
// on a canvas with a caption. Needs Node 22+ and Edge; set EDGE_PATH if Edge lives elsewhere.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Upper-case drive letter: that is the form Chromium uses when it derives the extension id.
const extensionDir = path
  .join(root, 'extension')
  .replace(/^[a-z](?=:)/, (letter) => letter.toUpperCase());
const outDir = path.join(root, 'store');
const EDGE =
  process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

// ---------------------------------------------------------------------------
// Texts on the screenshots
// ---------------------------------------------------------------------------

const TEXTS = {
  de: {
    browserLanguage: 'de',
    timer: {
      title: 'Sitzen. Stehen.<br>Im Wechsel.',
      text: 'Lege fest, wie lange du sitzen und stehen möchtest. Der Countdown läuft direkt im Symbol mit.',
      badge: 'noch 32 Minuten sitzen',
    },
    reminder: {
      title: 'Erinnerung mit Animation und Ton',
      text: 'Ist die Zeit um, klappt die Erinnerung unter dem Symbol auf.',
    },
    settings: {
      title: 'Passt sich deinem Arbeitstag an',
      points: [
        'Zeiten frei wählbar',
        'Ton mit Lautstärkeregler',
        'Wechsel bestätigen oder automatisch weiter',
        'Helles und dunkles Design',
      ],
    },
  },
  en: {
    browserLanguage: 'en-US',
    timer: {
      title: 'Sit. Stand. Repeat.',
      text: 'Choose how long you want to sit and stand. The countdown runs right on the toolbar icon.',
      badge: '32 minutes of sitting left',
    },
    reminder: {
      title: 'A reminder with animation and sound',
      text: 'When time is up, the reminder opens right under the icon.',
    },
    settings: {
      title: 'Fits the way<br>you work',
      points: [
        'Your own durations',
        'Chime with volume control',
        'Confirm changes or continue automatically',
        'Light and dark theme',
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Edge, driven over the DevTools protocol
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT = 30_000;

class Browser {
  static async launch(language) {
    const profile = mkdtempSync(path.join(os.tmpdir(), 'sit-stand-store-'));
    const child = spawn(
      EDGE,
      [
        '--headless=new',
        `--user-data-dir=${profile}`,
        '--remote-debugging-port=0',
        '--no-first-run',
        '--no-default-browser-check',
        // Without these two, Edge signs the throwaway profile in with the Windows account
        // and opens a "turn on sync?" dialog.
        '--disable-sync',
        '--allow-browser-signin=false',
        '--mute-audio',
        `--lang=${language}`,
        `--load-extension=${extensionDir}`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    );

    // Edge writes the port it picked and the path of its DevTools endpoint into this file.
    let endpoint;
    for (let i = 0; i < 150 && !endpoint; i += 1) {
      await sleep(100);
      try {
        const [port, browserPath] = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8')
          .trim()
          .split('\n');
        if (port && browserPath) endpoint = `ws://127.0.0.1:${port}${browserPath}`;
      } catch {
        // not written yet
      }
    }
    if (!endpoint) {
      child.kill();
      throw new Error(`Edge did not start (${EDGE}).`);
    }

    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('Cannot reach Edge.')), { once: true });
    });
    return new Browser(child, socket, profile);
  }

  constructor(child, socket, profile) {
    this.child = child;
    this.socket = socket;
    this.profile = profile;
    this.lastId = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = (this.lastId += 1);
    return new Promise((resolve, reject) => {
      // A page or worker can go away without answering: never wait for it forever.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: no answer from Edge.`));
      }, REQUEST_TIMEOUT);
      this.pending.set(id, { resolve, reject, method, timer });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  // Opens a tab, waits until it has loaded and returns the session that talks to it.
  async open(url) {
    const { targetId } = await this.send('Target.createTarget', { url });
    const { sessionId: session } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    for (let i = 0; i < 100; i += 1) {
      const loaded = await this.evaluate(
        session,
        'return document.readyState === "complete" ? location.href : "";',
      ).catch(() => '');
      if (loaded && (url === 'about:blank' || loaded !== 'about:blank')) break;
      await sleep(100);
    }
    return { targetId, session };
  }

  closeTab(targetId) {
    return this.send('Target.closeTarget', { targetId });
  }

  // Runs the body of an async function in the page and returns its result.
  async evaluate(session, body) {
    const { result, exceptionDetails } = await this.send(
      'Runtime.evaluate',
      { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true },
      session,
    );
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  }

  async screenshot(session, clip) {
    const { data } = await this.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: true, clip },
      session,
    );
    return Buffer.from(data, 'base64');
  }

  async close() {
    await Promise.race([this.send('Browser.close').catch(() => {}), sleep(3000)]);
    await sleep(500);
    this.child.kill();
    for (const request of this.pending.values()) clearTimeout(request.timer);
    this.pending.clear();
    this.socket.close();
    try {
      rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      // Edge still holds a file; the folder lives in the temp directory anyway.
    }
  }
}

// Chromium derives the id of an unpacked extension from its folder: the first 16 bytes of
// the SHA-256 of the path (as UTF-16), written with the letters a-p instead of hex digits.
function unpackedExtensionId(folder) {
  const hex = createHash('sha256').update(Buffer.from(folder, 'utf16le')).digest('hex').slice(0, 32);
  return [...hex].map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16))).join('');
}

// Opens the extension's popup page in a tab and makes sure it really is our extension.
async function openPopup(browser, name) {
  const url = `chrome-extension://${unpackedExtensionId(extensionDir)}/popup.html`;
  const tab = await browser.open(url);
  const found = await browser
    .evaluate(tab.session, 'return globalThis.chrome?.runtime?.getManifest?.().name ?? null;')
    .catch(() => null);
  if (found !== name) {
    throw new Error(`The extension did not load in Edge (expected "${name}" at ${url}).`);
  }
  return tab;
}

// ---------------------------------------------------------------------------
// Photos of the real popup
// ---------------------------------------------------------------------------

const running = (phase, minutes, secondsLeft) => ({
  status: 'running',
  phase,
  endTime: Date.now() + secondsLeft * 1000 + 300,
  remainingMs: null,
  durationMs: minutes * 60_000,
  prompt: null,
});

const waiting = (phase, to) => ({
  status: 'waiting',
  phase,
  endTime: null,
  remainingMs: null,
  durationMs: null,
  prompt: { to, auto: false },
});

const idle = { status: 'idle', phase: 'sit', endTime: null, remainingMs: null, durationMs: null, prompt: null };

async function photographPopup(browser, name) {
  const { targetId, session } = await openPopup(browser, name);

  const photo = async (scheme, state) => {
    await browser.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: scheme }] },
      session,
    );
    await browser.evaluate(session, `await chrome.storage.local.set({ state: ${JSON.stringify(state)} });`);
    await sleep(700);
    // Hold the reminder animation at a frame where the desk has arrived.
    const height = await browser.evaluate(
      session,
      `for (const animation of document.getAnimations()) {
         animation.pause();
         animation.currentTime = animation.animationName === 'chevron' ? 700 : 3000;
       }
       return document.body.scrollHeight;`,
    );
    return browser.screenshot(session, { x: 0, y: 0, width: 320, height, scale: 2 });
  };

  const photos = {
    timer: await photo('light', running('sit', 45, 31 * 60 + 42)),
    stand: await photo('light', waiting('sit', 'stand')),
    sit: await photo('light', waiting('stand', 'sit')),
    dark: await photo('dark', running('stand', 15, 9 * 60 + 41)),
  };

  // Leave no open reminder behind, otherwise closing the tab raises a notification.
  await browser.evaluate(session, `await chrome.storage.local.set({ state: ${JSON.stringify(idle)} });`);
  await sleep(300);
  await browser.closeTab(targetId);
  return photos;
}

// ---------------------------------------------------------------------------
// Canvases
// ---------------------------------------------------------------------------

const iconUrl = dataUrl(readFileSync(path.join(extensionDir, 'icons', 'icon128.png')));

// The 128 px icon has a 16 px transparent margin; this shows only the artwork.
const icon = (size) =>
  `<span class="icon" style="width:${size}px;height:${size}px">` +
  `<img src="${iconUrl}" style="width:${(size * 128) / 96}px;margin:-${(size * 16) / 96}px" alt=""></span>`;

const STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    display: flex; align-items: center; gap: 76px;
    width: 1280px; height: 800px; padding: 0 92px; overflow: hidden;
    background: linear-gradient(135deg, #2b2f77, #14163a);
    color: #fff; font-family: 'Segoe UI', system-ui, sans-serif;
  }
  .icon { display: block; flex: none; overflow: hidden; }
  .icon img { display: block; }
  .copy { flex: 1; min-width: 0; }
  .brand {
    display: flex; align-items: center; gap: 14px; margin-bottom: 40px;
    font-size: 26px; font-weight: 600; color: rgb(255 255 255 / 0.8);
  }
  h1 { font-size: 68px; font-weight: 700; line-height: 1.08; letter-spacing: -0.02em; }
  p { margin-top: 28px; font-size: 30px; line-height: 1.4; color: rgb(255 255 255 / 0.84); }
  .shot {
    display: block; flex: none; height: 690px; border-radius: 16px;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 32px 80px rgb(0 0 0 / 0.5);
  }
  .demo {
    display: flex; align-items: center; gap: 28px; margin-top: 48px;
    font-size: 26px; color: rgb(255 255 255 / 0.84);
  }
  .badged { position: relative; flex: none; }
  .badged b {
    position: absolute; right: -12px; bottom: -8px; padding: 4px 9px 6px; border-radius: 8px;
    background: #4f46e5; box-shadow: 0 0 0 3px #1f225c; font-size: 26px; line-height: 1;
  }
  ul { display: grid; gap: 22px; margin-top: 40px; list-style: none; font-size: 30px; }
  li { display: flex; align-items: center; gap: 18px; color: rgb(255 255 255 / 0.9); }
  li::before { content: ''; flex: none; width: 14px; height: 14px; border-radius: 50%; background: #5eead4; }

  body.centered { flex-direction: column; gap: 0; padding: 54px 80px 0; text-align: center; }
  .centered h1 { font-size: 58px; }
  .centered p { margin-top: 14px; }
  .pair { display: flex; gap: 56px; margin-top: 42px; }
  .pair .shot { height: 520px; }
`;

const page = (body, bodyClass = '') =>
  `<!doctype html><meta charset="utf-8"><style>${STYLE}</style><body class="${bodyClass}">${body}</body>`;

function screenshotPages(texts, name, photos) {
  const brand = `<div class="brand">${icon(44)}${name}</div>`;
  const shot = (photo) => `<img class="shot" src="${dataUrl(photo)}" alt="">`;
  return {
    '1-timer': page(`
      <div class="copy">
        ${brand}
        <h1>${texts.timer.title}</h1>
        <p>${texts.timer.text}</p>
        <div class="demo"><span class="badged">${icon(76)}<b>32</b></span>${texts.timer.badge}</div>
      </div>
      ${shot(photos.timer)}`),
    '2-reminder': page(
      `<h1>${texts.reminder.title}</h1>
       <p>${texts.reminder.text}</p>
       <div class="pair">${shot(photos.stand)}${shot(photos.sit)}</div>`,
      'centered',
    ),
    '3-settings': page(`
      <div class="copy">
        ${brand}
        <h1>${texts.settings.title}</h1>
        <ul>${texts.settings.points.map((point) => `<li>${point}</li>`).join('')}</ul>
      </div>
      ${shot(photos.dark)}`),
  };
}

// No text on the tile: the store shows the same one in every language.
const PROMO_TILE = `<!doctype html><meta charset="utf-8"><body style="margin:0">
  <svg width="440" height="280" viewBox="0 0 440 280" style="display:block">
    <defs>
      <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2b2f77" /><stop offset="1" stop-color="#14163a" />
      </linearGradient>
    </defs>
    <rect width="440" height="280" fill="url(#tile)" />
    <circle cx="220" cy="140" r="102" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="12" />
    <circle cx="220" cy="140" r="102" fill="none" stroke="#5eead4" stroke-width="12" stroke-linecap="round"
            pathLength="100" stroke-dasharray="68 100" transform="rotate(-90 220 140)" />
    <g transform="translate(145 62) scale(1.5)" fill="#fff">
      <rect x="13" y="24" width="74" height="11" rx="3.5" />
      <rect x="23" y="34" width="8" height="40" /><rect x="69" y="34" width="8" height="40" />
      <rect x="15.5" y="72.5" width="23" height="7.5" rx="3" /><rect x="61.5" y="72.5" width="23" height="7.5" rx="3" />
      <g fill="#5eead4">
        <path d="M50 41 39.5 52h21zM50 80 39.5 69h21z" /><rect x="47" y="51" width="6" height="19" />
      </g>
    </g>
  </svg></body>`;

async function render(browser, html, width, height) {
  const { targetId, session } = await browser.open('about:blank');
  await browser.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false },
    session,
  );
  await browser.evaluate(
    session,
    `document.open(); document.write(${JSON.stringify(html)}); document.close();
     await Promise.all([...document.images].map((image) => image.decode()));
     await document.fonts.ready;`,
  );
  const png = await browser.screenshot(session, { x: 0, y: 0, width, height, scale: 1 });
  await browser.closeTab(targetId);
  return withoutAlpha(png);
}

// ---------------------------------------------------------------------------
// PNG: the store asks for 24-bit files, Chromium's screenshots carry an alpha channel
// ---------------------------------------------------------------------------

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(zlib.crc32(body), body.length + 4);
  return chunk;
}

function withoutAlpha(png) {
  const chunks = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    chunks.push({
      type: png.toString('latin1', offset + 4, offset + 8),
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + 12;
  }
  const header = Buffer.from(chunks.find((chunk) => chunk.type === 'IHDR').data);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  if (header[9] !== 6) return png; // no alpha channel
  if (header[8] !== 8 || header[12] !== 0) throw new Error('Unexpected PNG layout.');

  const packed = zlib.inflateSync(
    Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)),
  );
  const stride = width * 4;
  const rgb = Buffer.alloc(height * (width * 3 + 1));
  let above = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    // Undo the row's PNG filter to get plain RGBA ...
    const start = y * (stride + 1);
    const filter = packed[start];
    const row = Buffer.from(packed.subarray(start + 1, start + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? row[x - 4] : 0;
      const b = above[x];
      const c = x >= 4 ? above[x - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = (row[x] + predicted) & 0xff;
    }
    // ... and write it back as RGB with the "Sub" filter (difference to the pixel on the left).
    const target = y * (width * 3 + 1);
    rgb[target] = 1;
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const left = x > 0 ? row[(x - 1) * 4 + channel] : 0;
        rgb[target + 1 + x * 3 + channel] = (row[x * 4 + channel] - left) & 0xff;
      }
    }
    above = row;
  }

  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    png.subarray(0, 8),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rgb, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

function save(file, png) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(`wrote ${path.relative(root, file)} (${Math.round(png.length / 1024)} KB)`);
}

for (const [language, texts] of Object.entries(TEXTS)) {
  const messages = JSON.parse(
    readFileSync(path.join(extensionDir, '_locales', language, 'messages.json'), 'utf8'),
  );
  const name = messages.extName.message;
  const browser = await Browser.launch(texts.browserLanguage);
  try {
    const photos = await photographPopup(browser, name);
    for (const [file, html] of Object.entries(screenshotPages(texts, name, photos))) {
      save(path.join(outDir, 'screenshots', language, `${file}.png`), await render(browser, html, 1280, 800));
    }
    if (language === 'en') {
      save(path.join(outDir, 'promo-tile-440x280.png'), await render(browser, PROMO_TILE, 440, 280));
    }
  } finally {
    await browser.close();
  }
}
