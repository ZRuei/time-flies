#!/usr/bin/env node
/**
 * Canvas API probe — 獨立測試腳本，不影響 production。
 *
 * 用途：實測 Slack Canvas 相關 API 在目前 workspace 的實際行為，
 * 以決定 /summary 重寫 canvas 的策略該走方案 A（刪+建）還是方案 B（section 重寫）。
 *
 * 執行：node scripts/probe-canvas-api.js <YOUR_SLACK_USER_ID>
 *
 * 需要 .env 裡有 SLACK_BOT_TOKEN。bot 必須已加入你 DM（先在 Slack 跟 bot 講過話）。
 *
 * 這支腳本只會在你自己的 DM 操作，結束前會清掉它建的所有 canvas。
 * 如果中途錯誤結束，可能留下未清的 canvas，請手動從 Slack 刪除。
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error('❌ SLACK_BOT_TOKEN not set. Check .env');
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/probe-canvas-api.js <YOUR_SLACK_USER_ID>');
  console.error('Your user id looks like U01234567. You can find it from /whoami or by right-clicking your profile → Copy member ID.');
  process.exit(1);
}

const client = new WebClient(token);

function section(title) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

function dump(label, obj) {
  console.log(`${label}:\n${JSON.stringify(obj, null, 2)}`);
}

async function safeCall(label, fn) {
  try {
    const result = await fn();
    dump(`✅ ${label}`, result);
    return { ok: true, result };
  } catch (err) {
    const payload = err.data || { message: err.message };
    dump(`❌ ${label} FAILED`, payload);
    return { ok: false, error: payload };
  }
}

async function main() {
  const createdCanvases = [];

  try {
    section('Step 0: auth.test (sanity check + team info)');
    const auth = await safeCall('auth.test', () => client.apiCall('auth.test', {}));
    if (!auth.ok) throw new Error('auth.test failed — check token');

    section('Step 1: Open DM with user');
    const dm = await safeCall('conversations.open', () =>
      client.conversations.open({ users: userId })
    );
    if (!dm.ok) throw new Error('DM open failed');
    const dmChannelId = dm.result.channel.id;

    section('Step 2: Create Canvas #1 with initial markdown (H1 + body)');
    const c1 = await safeCall('conversations.canvases.create #1', () =>
      client.apiCall('conversations.canvases.create', {
        channel_id: dmChannelId,
        document_content: {
          type: 'markdown',
          markdown: '# 我愛工作\n\n## 2026-04-14\n### Richart:\n- 測試 A 1 小時\n',
        },
      })
    );
    if (!c1.ok) throw new Error('Create canvas #1 failed');
    const canvasId1 = c1.result.canvas_id;
    createdCanvases.push(canvasId1);
    console.log(`(canvasId1 = ${canvasId1})`);

    section('Step 3: insert_at_end — append another day (simulates current /summary)');
    await safeCall('canvases.edit insert_at_end', () =>
      client.apiCall('canvases.edit', {
        canvas_id: canvasId1,
        changes: [{
          operation: 'insert_at_end',
          document_content: {
            type: 'markdown',
            markdown: '\n## 2026-04-15\n### ASUS:\n- 測試 B 2 小時\n',
          },
        }],
      })
    );

    section('Step 4a: sections.lookup — empty criteria');
    await safeCall('canvases.sections.lookup (empty criteria)', () =>
      client.apiCall('canvases.sections.lookup', {
        canvas_id: canvasId1,
        criteria: {},
      })
    );

    section('Step 4b: sections.lookup — section_types: ["any"]');
    await safeCall('canvases.sections.lookup (section_types: any)', () =>
      client.apiCall('canvases.sections.lookup', {
        canvas_id: canvasId1,
        criteria: { section_types: ['any'] },
      })
    );

    section('Step 4c: sections.lookup — contains_text: "我愛工作"');
    await safeCall('canvases.sections.lookup (contains_text 我愛工作)', () =>
      client.apiCall('canvases.sections.lookup', {
        canvas_id: canvasId1,
        criteria: { contains_text: '我愛工作' },
      })
    );

    section('Step 4d: sections.lookup — contains_text: "2026-04-15"');
    await safeCall('canvases.sections.lookup (contains_text 2026-04-15)', () =>
      client.apiCall('canvases.sections.lookup', {
        canvas_id: canvasId1,
        criteria: { contains_text: '2026-04-15' },
      })
    );

    section('Step 5: files.info — see if it returns permalink for a canvas');
    await safeCall('files.info(canvasId1)', () =>
      client.apiCall('files.info', { file: canvasId1 })
    );

    section('Step 6: Try creating ANOTHER canvas on the SAME DM (while #1 still exists)');
    console.log('If this succeeds → each DM can have multiple canvases; we must delete old before create new.');
    console.log('If this fails → conversations.canvases.create is idempotent; need delete first.');
    const c2probe = await safeCall('conversations.canvases.create #2 (DM already has canvas)', () =>
      client.apiCall('conversations.canvases.create', {
        channel_id: dmChannelId,
        document_content: { type: 'markdown', markdown: '# Probe second canvas\n' },
      })
    );
    if (c2probe.ok) {
      createdCanvases.push(c2probe.result.canvas_id);
    }

    section('Step 7: Delete Canvas #1');
    const d1 = await safeCall('canvases.delete(canvasId1)', () =>
      client.apiCall('canvases.delete', { canvas_id: canvasId1 })
    );
    if (d1.ok) {
      createdCanvases.splice(createdCanvases.indexOf(canvasId1), 1);
    }

    section('Step 8: After delete, create fresh canvas on same DM');
    const c3 = await safeCall('conversations.canvases.create #3 (after delete)', () =>
      client.apiCall('conversations.canvases.create', {
        channel_id: dmChannelId,
        document_content: { type: 'markdown', markdown: '# 我愛工作\n\n新畫板\n' },
      })
    );
    if (c3.ok) {
      createdCanvases.push(c3.result.canvas_id);
    }

    section('Step 9: Construct permalink manually + verify format');
    if (c3.ok && auth.ok) {
      const teamId = auth.result.team_id;
      const workspaceUrl = auth.result.url;
      const canvasId3 = c3.result.canvas_id;
      console.log('Try these URLs in browser:');
      console.log(`  A: ${workspaceUrl}docs/${canvasId3}              (current bot fallback)`);
      console.log(`  B: ${workspaceUrl}docs/${teamId}/${canvasId3}    (proposed fix — with team_id)`);
      console.log(`  C: ${workspaceUrl}canvas/${canvasId3}            (alternative path)`);
      console.log('Also:');
      await safeCall('files.info(canvasId3) — does it return permalink now?', () =>
        client.apiCall('files.info', { file: canvasId3 })
      );
    }

  } finally {
    section('Cleanup: delete any canvases we created');
    for (const id of createdCanvases) {
      await safeCall(`cleanup canvases.delete(${id})`, () =>
        client.apiCall('canvases.delete', { canvas_id: id })
      );
    }
  }

  section('DONE');
  console.log('Review output above. Key questions:');
  console.log('  Q1 (Step 4): Can sections.lookup return ALL sections? (blocks plan B)');
  console.log('  Q2 (Step 5): Does files.info return a working permalink? (fixes link)');
  console.log('  Q3 (Step 6): Does create fail/succeed when DM already has canvas?');
  console.log('  Q4 (Step 7): Does canvases.delete work with canvases:write scope?');
  console.log('  Q5 (Step 9): Which URL format works in browser?');
}

main().catch(err => {
  console.error('\nFATAL:', err.data || err);
  process.exit(1);
});
