import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json'
};

function startTestServer() {
  let sessionScenario = 'ws_live'; // 'ws_live' | 'quota_exhausted' | 'ws_code_3000'
  let serverPort = 0;
  let eventSeq = 1;
  const capturedTraces = [];

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1');

    if (reqUrl.pathname === '/api/telemetry/trace' && req.method === 'POST') {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      try {
        capturedTraces.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, recorded: true }));
      return;
    }

    if (reqUrl.pathname === '/api/agent/session') {
      const traceId = `e2e-trace-${Date.now()}`;
      const voiceConfig = {
        agentName: 'Jasmin',
        voiceId: 'qXOoUJU1h7AiwSe4ltRA',
        stability: 0.36,
        speed: 1.05,
        similarityBoost: 0.78
      };
      const dynamicVariables = {
        agent_name: 'Jasmin',
        agent_greeting:
          'Assalamu’alaikum warahmatullahi wabarakatuh. Halo, saya Jasmin, Asisten AI Kementerian Agama Republik Indonesia. Ada yang bisa saya bantu hari ini?',
        agent_persona: 'Anda adalah Jasmin, Asisten AI Digital Kementerian Agama Republik Indonesia.'
      };

      if (sessionScenario === 'quota_exhausted') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            traceId,
            maintenance: true,
            reason: 'quota_exhausted',
            quota: { used: 10000, limit: 10000, remaining: 0 },
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
          traceId,
          connectionType: 'websocket',
          signedUrl: `ws://127.0.0.1:${serverPort}/ws-mock`,
          voiceGender: 'female',
          voiceConfig,
          dynamicVariables
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
    if (sessionScenario === 'ws_code_3000') {
      setTimeout(() => {
        ws.close(3000, 'The AI agent you are trying to reach is not available.');
      }, 40);
      return;
    }

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
              conversation_id: 'conv_eleven_mock_123',
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
        }, 30);
      } else if (msg?.type === 'user_message') {
        const q = String(msg.text || '').toLowerCase();
        let reply = 'Baik, ada informasi lain seputar layanan Kementerian Agama yang ingin Anda ketahui?';
        if (q.includes('aceh') && q.includes('2024')) {
          reply = 'Berdasarkan data resmi tahun 2024, Provinsi Aceh memiliki 616 lembaga negeri.';
        } else if (q.includes('jawa barat') && q.includes('2025')) {
          reply = 'Di Provinsi Jawa Barat tahun 2025 tercatat 13.005 pondok pesantren.';
        }
        ws.send(
          JSON.stringify({
            type: 'agent_response',
            agent_response_event: {
              agent_response: reply,
              event_id: eventSeq++
            }
          })
        );
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve({
        baseUrl: `http://127.0.0.1:${serverPort}`,
        setScenario: (s) => {
          sessionScenario = s;
        },
        getTraces: () => capturedTraces,
        close: () => {
          wss.close();
          server.closeAllConnections?.();
          server.close();
        }
      });
    });
  });
}

test('E2E: ElevenLabs-only Jasmin session works live and switches to Maintenance (no fallback) when credits expire or close 3000', async () => {
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
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (text.includes('status of 503')) return;
      consoleErrors.push(text);
    });

    // Ensure browser speechSynthesis fallback NEVER gets invoked anywhere
    await page.addInitScript(() => {
      window.__spokenUtterances = [];
      const mockSynth = {
        speaking: false,
        getVoices: () => [],
        cancel: () => {},
        speak: (utt) => {
          window.__spokenUtterances.push(utt?.text || '');
        }
      };
      try {
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: mockSynth });
      } catch {}
    });

    await page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
    await page.route('https://fonts.gstatic.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'font/woff2', body: '' })
    );
    await page.goto(srv.baseUrl, { waitUntil: 'domcontentloaded' });

    // 1. Clean Executive Nusantara UI checks (Jasmin focus, zero clutter, zero ElevenLabs branding)
    await page.locator('[data-testid="avatar-3d-canvas-host"], [data-testid="avatar-3d-fallback"]').waitFor();
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.equal(bodyText.toLowerCase().includes('elevenlabs'), false, 'UI must not show ElevenLabs text');
    assert.equal(bodyText.includes('Uji Gerak Bibir'), false, 'UI must not show Uji Gerak Bibir clutter button');
    assert.equal(bodyText.includes('Mas Rouf'), false, 'Mas Rouf must be hidden in UI, focusing on Jasmin');

    // 2. Connect via native ElevenLabs ConvAI WebSocket transport
    await page.getByRole('button', { name: /Mulai Telepon AI/i }).click();
    await page.waitForSelector('text=Saluran Telepon Aktif', { timeout: 8000 });
    await page.waitForSelector('text=conv_eleven_mock_123', { timeout: 5000 });
    await page.waitForSelector('text=Halo, saya Jasmin, Asisten AI Kementerian Agama Republik Indonesia.', {
      timeout: 5000
    });

    // Send user message natively via ElevenLabs conversation session
    const input = page.locator('input[type="text"]');
    await input.fill('Berapa jumlah lembaga di Aceh tahun 2024?');
    await page.getByRole('button', { name: 'Kirim Pesan' }).click();
    await page.waitForSelector('text=616 lembaga negeri', { timeout: 5000 });

    // Speaker mute & MutationObserver check + Mic mute + End call
    await page.evaluate(() => {
      const dummyAudio = document.createElement('audio');
      dummyAudio.id = 'test-webrtc-audio';
      document.body.appendChild(dummyAudio);
    });
    await page.getByRole('button', { name: /Bisukan Suara AI/i }).click();
    await page.waitForSelector('text=Suara asisten sedang dibisukan');
    const mutedProp = await page.evaluate(() => document.getElementById('test-webrtc-audio')?.muted);
    assert.equal(mutedProp, true);
    await page.getByRole('button', { name: /Nyalakan Suara AI/i }).click();
    await page.evaluate(() => document.getElementById('test-webrtc-audio')?.remove());

    await page.getByRole('button', { name: /Mic Aktif/i }).click();
    await page.waitForSelector('text=Mic Mati');
    await page.getByRole('button', { name: /Akhiri Panggilan/i }).click();
    await page.waitForSelector('text=Telepon Berakhir');

    // Confirm zero browser speechSynthesis fallback was used
    assert.equal((await page.evaluate(() => window.__spokenUtterances)).length, 0);

    // 3. Quota exhausted -> MUST show Maintenance state cleanly (NO fallback chat/mode cadangan!)
    srv.setScenario('quota_exhausted');
    await page.getByRole('button', { name: /Hubungi Lagi/i }).click();
    await page.waitForSelector('text=Sedang Maintenance', { timeout: 6000 });
    await page.waitForSelector('text=dalam masa pemeliharaan (maintenance)', { timeout: 5000 });
    const afterQuotaText = await page.evaluate(() => document.body.innerText);
    assert.equal(afterQuotaText.includes('Mode cadangan'), false, 'Must NOT enter fallback/backup mode');
    assert.equal(afterQuotaText.includes('Saluran Telepon Aktif'), false, 'Must NOT connect without ElevenLabs');
    assert.equal((await page.evaluate(() => window.__spokenUtterances)).length, 0);

    // 4. Upstream WebSocket close 3000 -> MUST show Maintenance state cleanly (NO fallback!)
    srv.setScenario('ws_code_3000');
    await page.getByRole('button', { name: /Hubungi Lagi/i }).click();
    await page.waitForSelector('text=Sedang Maintenance', { timeout: 6000 });
    const after3000Text = await page.evaluate(() => document.body.innerText);
    assert.equal(after3000Text.includes('Mode cadangan'), false, 'Must NOT switch to mode cadangan on code 3000');
    assert.equal((await page.evaluate(() => window.__spokenUtterances)).length, 0);

    // 5. Auto-disconnect on 30s inactivity in ElevenLabs session
    srv.setScenario('ws_live');
    await page.evaluate(() => {
      window.__IDLE_TIMEOUT_MS = 500;
    });
    await page.getByRole('button', { name: /Hubungi Lagi/i }).click();
    await page.waitForSelector('text=Saluran Telepon Aktif', { timeout: 8000 });
    await page.waitForSelector('text=Telepon Berakhir', { timeout: 6000 });
    await page.waitForSelector('text=belum ada respons selama 30 detik', { timeout: 3000 });
    await page.waitForSelector('text=Wassalamu’alaikum warahmatullahi wabarakatuh', { timeout: 3000 });
    assert.equal((await page.evaluate(() => window.__spokenUtterances)).length, 0);
    assert.equal(consoleErrors.length, 0, `Unexpected console errors: ${consoleErrors.join('; ')}`);

    await page.waitForTimeout(150);
    const traceEvents = srv.getTraces().map((t) => t.eventName);
    assert.ok(traceEvents.includes('call_connected'), 'Expected call_connected telemetry trace');
    assert.ok(traceEvents.includes('transcript_message'), 'Expected transcript_message telemetry trace');
    assert.ok(traceEvents.includes('call_ended'), 'Expected call_ended telemetry trace');
    assert.ok(traceEvents.includes('maintenance_triggered'), 'Expected maintenance_triggered telemetry trace');
    assert.ok(traceEvents.includes('idle_auto_close'), 'Expected idle_auto_close telemetry trace');

    await context.close();
  } finally {
    await browser.close();
    srv.close();
  }
});
