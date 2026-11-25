import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

import { onRequestPost as fallbackChatPost } from '../functions/api/call/fallback-chat.js';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json'
};

function startTestServer() {
  let sessionScenario = 'fallback'; // 'fallback' | 'ws_code_3000'
  let serverPort = 0;

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1');

    if (reqUrl.pathname === '/api/agent/session') {
      let body = {};
      if (req.method === 'POST') {
        const chunks = [];
        for await (const ch of req) chunks.push(ch);
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {}
      }
      const voiceGender = body.voiceGender === 'male' ? 'male' : 'female';
      const isMale = voiceGender === 'male';
      const voiceConfig = isMale
        ? { agentName: 'Mas Rouf', voiceId: '5U7QzveIXT8fIoBXaoUC', stability: 0.38, speed: 1.05, similarityBoost: 0.78 }
        : { agentName: 'Jasmin', voiceId: 'qXOoUJU1h7AiwSe4ltRA', stability: 0.35, speed: 1.07, similarityBoost: 0.78 };
      const dynamicVariables = isMale
        ? {
            agent_name: 'Mas Rouf',
            agent_greeting: 'Halo! Dengan Mas Rouf, Kapus Datin di sini. Ada yang bisa kita diskusikan hari ini?',
            agent_persona: 'Anda menjabat sebagai Kapus Datin.'
          }
        : {
            agent_name: 'Jasmin',
            agent_greeting: 'Halo! Dengan Jasmin di sini. Ada yang bisa saya bantu atau kita diskusikan hari ini?',
            agent_persona: 'Anda adalah konsultan virtual.'
          };

      const payload =
        sessionScenario === 'ws_code_3000'
          ? {
              success: true,
              connectionType: 'websocket',
              signedUrl: `ws://127.0.0.1:${serverPort}/ws-mock`,
              voiceGender,
              voiceConfig,
              dynamicVariables
            }
          : {
              success: true,
              connectionType: 'fallback',
              fallbackReason: 'quota_exhausted',
              quota: { used: 9801, limit: 10000, remaining: 199 },
              voiceGender,
              voiceConfig,
              dynamicVariables
            };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
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

    let filePath = path.join(DIST_DIR, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  const wss = new WebSocketServer({ server, path: '/ws-mock' });
  wss.on('connection', (ws) => {
    setTimeout(() => {
      ws.close(3000, 'The AI agent you are trying to reach is not available.');
    }, 50);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve({
        baseUrl: `http://127.0.0.1:${serverPort}`,
        setScenario: (s) => {
          sessionScenario = s;
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

test('E2E: Jasmin and Mas Rouf (Kapus Datin) both work end-to-end with speech synthesis and code-3000 recovery', async () => {
  assert.ok(fs.existsSync(DIST_DIR), 'dist/ must exist before running E2E test');
  const srv = await startTestServer();
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Spy on speechSynthesis.speak + provide deterministic mock voices for both female & male ID voices
    await page.addInitScript(() => {
      window.__spokenUtterances = [];
      const fakeVoices = [
        { name: 'Gadis Indonesia', lang: 'id-ID', localService: true, default: false, voiceURI: 'gadis' },
        { name: 'Ardi Indonesia', lang: 'id-ID', localService: true, default: false, voiceURI: 'ardi' }
      ];
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
          window.__spokenUtterances.push({
            text: utt.text,
            lang: utt.lang,
            pitch: utt.pitch,
            rate: utt.rate,
            voiceName: utt.voice?.name || null
          });
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
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: mockSynth
        });
      } catch {
        if (window.SpeechSynthesis?.prototype) {
          window.SpeechSynthesis.prototype.getVoices = mockSynth.getVoices;
          window.SpeechSynthesis.prototype.cancel = mockSynth.cancel;
          window.SpeechSynthesis.prototype.speak = mockSynth.speak;
        }
      }
    });

    await page.goto(srv.baseUrl, { waitUntil: 'networkidle' });

    // 1. White-label UI check (no ElevenLabs text visible)
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.equal(/eleven\s*labs/i.test(bodyText), false, 'UI must not show ElevenLabs text');

    // 2. Test Jasmin (Perempuan) end-to-end
    await page.getByRole('button', { name: /Jasmin/i }).click();
    await page.getByRole('button', { name: /Mulai Telepon AI/i }).click();

    await page.waitForSelector('text=Saluran Telepon Aktif');
    await page.waitForSelector('text=Halo! Dengan Jasmin di sini.');

    // Verify female voice synthesis fired with Gadis Indonesia & pitch 1.12
    const jasminUtterances = await page.evaluate(() => window.__spokenUtterances);
    assert.ok(jasminUtterances.length >= 1, 'Jasmin speechSynthesis should have spoken');
    assert.equal(jasminUtterances[0].voiceName, 'Gadis Indonesia');
    assert.equal(jasminUtterances[0].pitch, 1.12);

    // Ask Jasmin about Aceh 2024 data
    const input = page.locator('input[type="text"]');
    await input.fill('Berapa jumlah lembaga di Aceh tahun 2024?');
    await page.getByRole('button', { name: 'Kirim Pesan' }).click();
    await page.waitForSelector('text=616 lembaga negeri');

    // Toggle Mic and Audio Mute
    await page.getByRole('button', { name: /Mic Aktif/i }).click();
    await page.waitForSelector('text=Mic Mati');
    await page.getByRole('button', { name: /Akhiri Panggilan/i }).click();
    await page.waitForSelector('text=Telepon Berakhir');
    await page.waitForSelector('text=Ringkasan Transkrip Telepon Terakhir');

    // 3. Test Mas Rouf (Kapus Datin) end-to-end + WebSocket code 3000 recovery!
    srv.setScenario('ws_code_3000');
    await page.evaluate(() => { window.__spokenUtterances = []; });

    await page.getByRole('button', { name: /Mas Rouf/i }).click();
    await page.getByRole('button', { name: /Hubungi Lagi/i }).click();

    // Must recover from WS close 3000 seamlessly into connected backup mode without getting stuck!
    await page.waitForSelector('text=Saluran Telepon Aktif', { timeout: 8000 });
    await page.waitForSelector('text=Mas Rouf • Kapus Datin');
    await page.waitForSelector('text=Halo! Dengan Mas Rouf, Kapus Datin di sini.');

    const roufUtterances = await page.evaluate(() => window.__spokenUtterances);
    assert.ok(roufUtterances.length >= 1, 'Mas Rouf speechSynthesis should have spoken');
    assert.equal(roufUtterances[0].voiceName, 'Ardi Indonesia');
    assert.equal(roufUtterances[0].pitch, 0.85);

    // Ask Mas Rouf about Jawa Barat 2025 pesantren
    await page.locator('input[type="text"]').fill('Berapa pesantren di Jawa Barat tahun 2025?');
    await page.getByRole('button', { name: 'Kirim Pesan' }).click();
    await page.waitForSelector('text=13.005 pondok pesantren');

    await page.getByRole('button', { name: /Akhiri Panggilan/i }).click();
    await page.waitForSelector('text=Telepon Berakhir');

    // Ensure no uncaught errors crashed the UI (ignore expected ws 3000 log if any, check no "gangguan jaringan" stuck state)
    const finalText = await page.evaluate(() => document.body.innerText);
    assert.equal(finalText.includes('Sambungan terputus karena gangguan jaringan'), false);
    assert.equal(consoleErrors.length, 0, `Unexpected console errors: ${consoleErrors.join('; ')}`);

    // 4. Multi-user concurrent E2E: two isolated browser contexts calling simultaneously (Jasmin & Mas Rouf)
    srv.setScenario('quota_exhausted');
    const [ctxA, ctxB] = await Promise.all([
      browser.newContext({ permissions: ['microphone'] }),
      browser.newContext({ permissions: ['microphone'] })
    ]);
    const [pageA, pageB] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
    const concurrentErrors = [];

    for (const p of [pageA, pageB]) {
      p.on('pageerror', (e) => concurrentErrors.push(e.message));
      p.on('console', (m) => {
        if (m.type() === 'error') concurrentErrors.push(m.text());
      });
      await p.addInitScript(() => {
        window.__spokenUtterances = [];
        const fakeVoices = [
          { name: 'Gadis Indonesia', lang: 'id-ID', localService: true, default: false, voiceURI: 'gadis' },
          { name: 'Ardi Indonesia', lang: 'id-ID', localService: true, default: false, voiceURI: 'ardi' }
        ];
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
            window.__spokenUtterances.push({ text: utt.text, pitch: utt.pitch, voiceName: utt.voice?.name || null });
            if (typeof utt.onstart === 'function') setTimeout(() => utt.onstart(), 10);
            if (typeof utt.onend === 'function') setTimeout(() => utt.onend(), 25);
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
      });
    }

    await Promise.all([
      pageA.goto(srv.baseUrl, { waitUntil: 'networkidle' }),
      pageB.goto(srv.baseUrl, { waitUntil: 'networkidle' })
    ]);

    await Promise.all([
      pageA.getByRole('button', { name: /Jasmin/i }).click(),
      pageB.getByRole('button', { name: /Mas Rouf/i }).click()
    ]);
    await Promise.all([
      pageA.getByRole('button', { name: /Mulai Telepon AI/i }).click(),
      pageB.getByRole('button', { name: /Mulai Telepon AI/i }).click()
    ]);

    await Promise.all([
      pageA.waitForSelector('text=Halo! Dengan Jasmin di sini.'),
      pageB.waitForSelector('text=Halo! Dengan Mas Rouf, Kapus Datin di sini.')
    ]);

    // Both users chat at the same time; confirm responses never cross between sessions
    await Promise.all([
      pageA.locator('input[type="text"]').fill('Berapa jumlah lembaga di Aceh 2024?'),
      pageB.locator('input[type="text"]').fill('Berapa pesantren di Jawa Timur 2025?')
    ]);
    await Promise.all([
      pageA.getByRole('button', { name: 'Kirim Pesan' }).click(),
      pageB.getByRole('button', { name: 'Kirim Pesan' }).click()
    ]);

    await Promise.all([
      pageA.waitForSelector('text=616 lembaga negeri'),
      pageB.waitForSelector('text=7.347 pondok pesantren')
    ]);

    const [textA, textB] = await Promise.all([
      pageA.evaluate(() => document.body.innerText),
      pageB.evaluate(() => document.body.innerText)
    ]);
    assert.equal(textA.includes('7.347 pondok pesantren'), false, 'User A must not receive User B answer');
    assert.equal(textB.includes('616 lembaga negeri'), false, 'User B must not receive User A answer');
    assert.equal(concurrentErrors.length, 0, `Concurrent E2E console errors: ${concurrentErrors.join('; ')}`);

    await Promise.all([ctxA.close(), ctxB.close()]);
  } finally {
    await browser.close();
    srv.close();
  }
});
