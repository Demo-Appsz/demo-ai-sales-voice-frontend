import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

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
  let serverPort = 0;
  let scenario = 'ws_live'; // 'ws_live' | 'quota_exhausted'
  let eventSeq = 1;

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1');

    if (reqUrl.pathname === '/api/telemetry/trace') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, recorded: true }));
      return;
    }

    if (reqUrl.pathname === '/api/agent/session') {
      if (scenario === 'quota_exhausted') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            maintenance: true,
            reason: 'quota_exhausted',
            error:
              'Mohon maaf, layanan suara Asisten AI sedang dalam masa pemeliharaan (maintenance) dan sementara belum dapat menerima panggilan. Silakan coba beberapa saat lagi.'
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          connectionType: 'websocket',
          signedUrl: `ws://127.0.0.1:${serverPort}/ws-mock`,
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

    let filePath = path.join(DIST_DIR, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws-mock',
    handleProtocols: (protocols) => (protocols.has('convai') ? 'convai' : false)
  });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg = null;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type === 'conversation_initiation_client_data') {
        ws.send(
          JSON.stringify({
            type: 'conversation_initiation_metadata',
            conversation_initiation_metadata_event: {
              conversation_id: 'conv_resp_live',
              agent_output_audio_format: 'pcm_16000',
              user_input_audio_format: 'pcm_16000'
            }
          })
        );
        setTimeout(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'agent_response',
                agent_response_event: {
                  agent_response:
                    'Assalamu’alaikum warahmatullahi wabarakatuh. Halo, saya Jasmin, Asisten AI Kementerian Agama Republik Indonesia. Ada yang bisa saya bantu hari ini?',
                  event_id: eventSeq++
                }
              })
            );
          }
        }, 25);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve({
        baseUrl: `http://127.0.0.1:${serverPort}`,
        setScenario: (s) => {
          scenario = s;
        },
        close: () => {
          wss.close();
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
    const main = document.querySelector('main');
    const canvas = document.querySelector('canvas');

    const overflowPx = Math.max(html.scrollWidth, body.scrollWidth) - window.innerWidth;
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
    const mainRect = main ? main.getBoundingClientRect() : null;

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
      mainWidth: mainRect ? Math.round(mainRect.width) : 0,
      canvasSize: canvasRect ? `${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)}` : 'none',
      overflowElements
    };
  }, vp.width);
}

test('Responsive Multi-Device Audit (10 resolutions: Idle, ElevenLabs Connected, and Maintenance UI)', async () => {
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

  try {
    for (const vp of VIEWPORTS) {
      server.setScenario('ws_live');
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        permissions: ['microphone']
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      await page.route('https://fonts.googleapis.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      );
      await page.route('https://fonts.gstatic.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'font/woff2', body: '' })
      );

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

      // Click CTA and verify live ElevenLabs Connected responsive layout
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

      // Also verify Maintenance banner responsiveness on smallest phone & 2K monitor
      if (vp.id === 'iphone_se_320' || vp.id === 'monitor_2k_2560') {
        await endBtn.click({ force: true });
        server.setScenario('quota_exhausted');
        await page.getByRole('button', { name: /Hubungi Lagi/i }).click({ force: true });
        await page.waitForSelector('text=Sedang Maintenance', { timeout: 6000 });
        const maintMetrics = await inspectViewportMetrics(page, vp);
        assert.ok(maintMetrics.overflowPx <= 1, `${vp.label} maintenance overflow`);
        assert.equal(maintMetrics.overflowElements.length, 0, `${vp.label} maintenance clipped elements`);
        if (vp.id === 'iphone_se_320') {
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'resp_maintenance_320.png'), fullPage: true });
        } else {
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'resp_maintenance_2560.png'), fullPage: true });
        }
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
