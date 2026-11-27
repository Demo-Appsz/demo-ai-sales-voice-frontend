import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  insertConversationMessage,
  insertTraceLog,
  isSupabaseConfigured,
  patchVoiceSession,
  resolveEnvironmentName,
  runBackground,
  upsertVoiceSession
} from '../functions/lib/supabaseTrace.js';

function collectCodeFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectCodeFiles(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

test('Unit: supabaseTrace.isSupabaseConfigured validates both required secrets', () => {
  assert.equal(isSupabaseConfigured(undefined), false);
  assert.equal(isSupabaseConfigured({}), false);
  assert.equal(isSupabaseConfigured({ SUPABASE_URL: 'https://x.supabase.co' }), false);
  assert.equal(isSupabaseConfigured({ SUPABASE_SERVICE_ROLE_KEY: 'secret' }), false);
  assert.equal(
    isSupabaseConfigured({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret'
    }),
    true
  );
});

test('Unit: supabaseTrace.resolveEnvironmentName distinguishes production, preview, and local deterministically', () => {
  assert.equal(
    resolveEnvironmentName(new Request('https://demo-ai-sales-voice.pages.dev/api/telemetry/trace'), {}),
    'production'
  );
  assert.equal(
    resolveEnvironmentName(
      new Request('https://development.demo-ai-sales-voice.pages.dev/api/telemetry/trace'),
      {}
    ),
    'preview'
  );
  assert.equal(resolveEnvironmentName(new Request('http://127.0.0.1:5173/api/agent/session'), {}), 'local');
  assert.equal(resolveEnvironmentName(new Request('http://localhost:8788/api/agent/session'), {}), 'local');
  assert.equal(
    resolveEnvironmentName(new Request('https://custom.domain/api/agent/session'), {
      CF_PAGES_BRANCH: 'main'
    }),
    'production'
  );
  assert.equal(
    resolveEnvironmentName(new Request('https://custom.domain/api/agent/session'), {
      CF_PAGES_BRANCH: 'development'
    }),
    'preview'
  );
});

test('Unit: supabaseTrace.runBackground delegates to waitUntil and swallows rejected telemetry safely', async () => {
  const waited = [];
  const p = runBackground(
    { waitUntil: (promise) => waited.push(promise) },
    Promise.reject(new Error('network timeout'))
  );
  assert.equal(waited.length, 1);
  await assert.doesNotReject(p);
});

test('Unit: supabaseTrace writers short-circuit cleanly without fetch on invalid inputs or unconfigured env', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('', { status: 201 });
  };

  try {
    const validEnv = {
      SUPABASE_URL: 'https://proj.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY: 'srv_key'
    };

    assert.equal(await upsertVoiceSession({}, { trace_id: 't1' }), false);
    assert.equal(await upsertVoiceSession(validEnv, {}), false);
    assert.equal(await patchVoiceSession(validEnv, '', { status: 'ended' }), false);
    assert.equal(await patchVoiceSession(validEnv, 't1', null), false);
    assert.equal(await insertTraceLog(validEnv, { trace_id: 't1' }), false);
    assert.equal(await insertConversationMessage(validEnv, { trace_id: 't1' }), false);
    assert.equal(fetchCalled, false, 'No HTTP fetch may run when required fields or env are missing');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Unit: supabaseTrace normalizes trailing slashes on SUPABASE_URL', async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = '';
  globalThis.fetch = async (url) => {
    seenUrl = String(url);
    return new Response('', { status: 201 });
  };

  try {
    const ok = await insertTraceLog(
      {
        SUPABASE_URL: 'https://demo.supabase.co///',
        SUPABASE_SERVICE_ROLE_KEY: 'srv_key'
      },
      { trace_id: 't-slash', event_name: 'unit_probe' }
    );
    assert.equal(ok, true);
    assert.equal(seenUrl, 'https://demo.supabase.co/rest/v1/voice_ai_trace_logs');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Unit Guard: Zero regex anywhere across frontend/src, frontend/functions, and backend/src', () => {
  const rootDir = path.resolve(process.cwd(), '..');
  const codeFiles = [
    ...collectCodeFiles(path.join(rootDir, 'frontend/src'), ['.js', '.ts', '.svelte']),
    ...collectCodeFiles(path.join(rootDir, 'frontend/functions'), ['.js', '.ts']),
    ...collectCodeFiles(path.join(rootDir, 'backend/src'), ['.rs'])
  ];
  assert.ok(codeFiles.length >= 10, 'Expected at least 10 source files in audit');

  const forbiddenTokens = ['new RegExp', '.match(/', '.replace(/', '.search(/', 'regex::', 'Regex::'];
  for (const filePath of codeFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const token of forbiddenTokens) {
        assert.equal(
          line.includes(token),
          false,
          `Forbidden regex token "${token}" found in ${path.relative(rootDir, filePath)}:${i + 1}`
        );
      }
      // Also catch inline `.test(` calls in JS/Svelte/Rust (note Rust uses `#[test]` / `mod tests` which don't have `.test(`)
      if (!filePath.endsWith('.rs')) {
        assert.equal(
          line.includes('.test('),
          false,
          `Forbidden regex .test( call found in ${path.relative(rootDir, filePath)}:${i + 1}`
        );
      }
    }
  }
});

test('Unit Guard: App.svelte preserves ElevenLabs-only maintenance architecture and Jasmin Asisten Digital branding', () => {
  const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.svelte'), 'utf8');
  assert.equal(appSource.includes('fallback-chat'), false);
  assert.equal(appSource.includes('Mode cadangan'), false);
  assert.equal(appSource.includes('speechSynthesis'), false);
  assert.equal(appSource.includes('Sparkles'), false);
  assert.equal(appSource.includes('Layanan Sedang Maintenance'), true);
  assert.equal(appSource.includes('Jasmin Asisten Digital'), true);
  assert.equal(appSource.includes('Asisten Layanan Pelanggan'), false);
});
