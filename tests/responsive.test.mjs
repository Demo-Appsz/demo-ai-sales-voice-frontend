import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { onRequestPost as fallbackChatPost } from '../functions/api/call/fallback-chat.js';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = '/Users/vlakas/.gemini/antigravity/brain/4170aa71-3889-4518-9d03-4d9289c9e615/scratch';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json'
};

const VIEWPORTS = [
  {
    id: 'iphone_se_320',
    label: 'iPhone SE / Android Mini (320x568)',
    category: 'Android / iPhone Mini',
    width: 320,
    height: 568,
    isMobile: true,
    screenshot: 'resp_iphone_se_320.png'
  },
  {
    id: 'android_compact_360',
    label: 'Android Compact (360x800)',
    category: 'Android',
    width: 360,
    height: 800,
    isMobile: true,
    screenshot: 'resp_android_360.png'
  },
  {
    id: 'iphone_standard_390',
    label: 'iPhone 14 / 15 Standard (390x844)',
    category: 'iPhone',
    width: 390,
    height: 844,
    isMobile: true
  },
  {
    id: 'large_phone_430',
    label: 'iPhone Pro Max / Android Large (430x932)',
    category: 'iPhone / Android Large',
    width: 430,
    height: 932,
    isMobile: true
  },
  {
    id: 'mobile_landscape_844',
    label: 'Mobile Landscape (844x390)',
    category: 'Mobile Landscape',
    width: 844,
    height: 390,
    isMobile: true
  },
  {
    id: 'tablet_portrait_768',
    label: 'iPad Mini / Tablet Portrait (768x1024)',
    category: 'Tablet Portrait',
    width: 768,
    height: 1024,
    isMobile: true,
    screenshot: 'resp_tablet_768.png'
  },
  {
    id: 'tablet_landscape_1024',
    label: 'iPad Pro / Tablet Landscape (1024x768)',
    category: 'Tablet Landscape',
    width: 1024,
    height: 768,
    isMobile: false
  },
  {
    id: 'laptop_hd_1280',
    label: 'Laptop / MacBook HD (1280x800)',
    category: 'Laptop',
    width: 1280,
    height: 800,
    isMobile: false
  },
  {
    id: 'desktop_fhd_1920',
    label: 'Desktop Full HD (1920x1080)',
    category: 'Desktop',
    width: 1920,
    height: 1080,
    isMobile: false
  },
  {
    id: 'monitor_2k_2560',
    label: 'Monitor Besar / 2K Ultrawide (2560x1440)',
    category: 'Monitor Besar',
    width: 2560,
    height: 1440,
    isMobile: false,
    screenshot: 'resp_monitor_2560.png'
  }
];

function startResponsiveTestServer() {
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1');

    if (reqUrl.pathname === '/api/agent/session') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          connectionType: 'fallback',
          fallbackReason: 'quota_exhausted',
          quota: { used: 9801, limit: 10000, remaining: 199 },
          voiceGender: 'female',
          voiceConfig: {
            agentName: 'Jasmin',
            voiceId: 'qXOoUJU1h7AiwSe4ltRA',
            stability: 0.36,
            speed: 1.05,
            similarityBoost: 0.78
          },
          dynamicVariables: {
            agent_name: 'Jasmin',
            agent_greeting:
              'Assalamu’alaikum warahmatullahi wabarakatuh. Halo, saya Jasmin, Asisten AI Kementerian Agama Republik Indonesia. Ada yang bisa saya bantu hari ini?',
            agent_persona: 'Anda adalah Jasmin, Asisten AI Digital Kementerian Agama Republik Indonesia.'
          }
        })
      );
      return;
    }

    if (reqUrl.pathname === '/api/call/fallback-chat' && req.method === 'POST') {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const webReq = new Request(`http://127.0.0.1${reqUrl.pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody
      });
      const fnRes = await fallbackChatPost({ request: webReq });
      res.writeHead(fnRes.status, { 'Content-Type': 'application/json' });
      res.end(await fnRes.text());
      return;
    }

    if (reqUrl.pathname === '/api/tts') {
      res.writeHead(204);
      res.end();
      return;
    }

    let filePath = path.join(DIST_DIR, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => {
          server.closeAllConnections?.();
          server.close();
        }
      });
    });
  });
}

async function inspectViewportMetrics(page, vp) {
  return page.evaluate((expectedWidth) => {
    const html = document.documentElement;
    const body = document.body;
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    const h1 = document.querySelector('h1');
    const canvas = document.querySelector('canvas');
    const footer = document.querySelector('footer');

    const overflowPx = Math.max(html.scrollWidth, body.scrollWidth) - window.innerWidth;
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
    const h1Rect = h1 ? h1.getBoundingClientRect() : null;
    const mainRect = main ? main.getBoundingClientRect() : null;
    const headerRect = header ? header.getBoundingClientRect() : null;
    const footerRect = footer ? footer.getBoundingClientRect() : null;

    const overflowElements = [];
    const checked = document.querySelectorAll('header, main, footer, section, button, input, h1, p');
    for (const el of checked) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > window.innerWidth + 1.5 || r.left < -1.5) {
        overflowElements.push({
          tag: el.tagName,
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          viewportWidth: window.innerWidth
        });
      }
    }

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      expectedWidth,
      scrollWidth: html.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      overflowPx,
      headerRight: headerRect ? Math.round(headerRect.right) : 0,
      mainWidth: mainRect ? Math.round(mainRect.width) : 0,
      h1Height: h1Rect ? Math.round(h1Rect.height) : 0,
      canvasSize: canvasRect ? `${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)}` : 'none',
      canvasRight: canvasRect ? Math.round(canvasRect.right) : 0,
      footerRight: footerRect ? Math.round(footerRect.right) : 0,
      overflowElements
    };
  }, vp.width);
}

test('Responsive Multi-Device Audit (10 resolutions: Android, iPhone, Tablet, Laptop, Desktop, Monitor Besar)', async () => {
  assert.ok(fs.existsSync(DIST_DIR), 'dist/ must be built before running responsive tests');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const server = await startResponsiveTestServer();
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  const results = [];
  const addMockSpeechScript = () => {
    window.__spokenUtterances = [];
    const fakeVoices = [{ name: 'Gadis Indonesia', lang: 'id-ID', localService: true, default: true, voiceURI: 'gadis' }];
    const mockSynth = {
      speaking: false,
      paused: false,
      pending: false,
      onvoiceschanged: null,
      getVoices: () => fakeVoices,
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      speak: (utt) => {
        window.__spokenUtterances.push(utt.text);
        if (typeof utt.onstart === 'function') setTimeout(() => utt.onstart(), 10);
        if (typeof utt.onend === 'function') setTimeout(() => utt.onend(), 30);
      }
    };
    window.SpeechSynthesisUtterance = function MockUtterance(text) {
      this.text = text;
      this.lang = '';
      this.pitch = 1;
      this.rate = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    };
    try {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: mockSynth });
    } catch {}
  };

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        permissions: ['microphone']
      });
      await context.addInitScript(addMockSpeechScript);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
      await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

      await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas', { timeout: 10000 });
      await page.waitForTimeout(180);

      const idleMetrics = await inspectViewportMetrics(page, vp);
      assert.equal(pageErrors.length, 0, `${vp.label} idle pageErrors: ${pageErrors.join('; ')}`);
      assert.ok(
        idleMetrics.overflowPx <= 1,
        `${vp.label} idle horizontal overflow: scrollWidth=${idleMetrics.scrollWidth} > innerWidth=${idleMetrics.innerWidth}`
      );
      assert.equal(
        idleMetrics.overflowElements.length,
        0,
        `${vp.label} idle overflowing elements: ${JSON.stringify(idleMetrics.overflowElements)}`
      );

      const ctaButton = page.locator('button:has-text("Mulai Telepon AI")');
      await ctaButton.waitFor({ state: 'visible', timeout: 5000 });
      const ctaBox = await ctaButton.boundingBox();
      assert.ok(
        ctaBox && ctaBox.width >= 160 && ctaBox.x >= 0 && ctaBox.x + ctaBox.width <= vp.width + 1,
        `${vp.label} CTA out of bounds: ${JSON.stringify(ctaBox)}`
      );

      // Click CTA and verify connected chat/voice call responsive layout
      await ctaButton.scrollIntoViewIfNeeded();
      await ctaButton.click({ force: true });
      const chatInput = page.locator('input[placeholder="Ketik pesan selama telepon..."]');
      await chatInput.waitFor({ state: 'visible', timeout: 12000 });
      await page.waitForTimeout(180);

      const activeMetrics = await inspectViewportMetrics(page, vp);
      assert.ok(
        activeMetrics.overflowPx <= 1,
        `${vp.label} connected horizontal overflow: scrollWidth=${activeMetrics.scrollWidth} > innerWidth=${activeMetrics.innerWidth}`
      );
      assert.equal(
        activeMetrics.overflowElements.length,
        0,
        `${vp.label} connected overflowing elements: ${JSON.stringify(activeMetrics.overflowElements)}`
      );

      const inputBox = await chatInput.boundingBox();
      assert.ok(
        inputBox && inputBox.width >= 120 && inputBox.x >= 0 && inputBox.x + inputBox.width <= vp.width + 1,
        `${vp.label} chat input clipped: ${JSON.stringify(inputBox)}`
      );

      const endBtn = page.locator('button:has-text("Akhiri")');
      await endBtn.waitFor({ state: 'visible', timeout: 5000 });
      const endBox = await endBtn.boundingBox();
      assert.ok(
        endBox && endBox.width >= 60 && endBox.x >= 0 && endBox.x + endBox.width <= vp.width + 1,
        `${vp.label} end button clipped: ${JSON.stringify(endBox)}`
      );

      if (vp.screenshot) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, vp.screenshot), fullPage: true });
      }

      results.push({
        label: vp.label,
        overflowPx: activeMetrics.overflowPx,
        canvasSize: idleMetrics.canvasSize,
        mainWidth: idleMetrics.mainWidth,
        inputWidth: Math.round(inputBox.width)
      });

      await context.close();
    }

    console.log('RESPONSIVE_AUDIT_SUMMARY=' + JSON.stringify(results));
  } finally {
    await browser.close();
    server.close();
  }
});
