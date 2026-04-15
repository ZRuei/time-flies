const store = require('./store');

/**
 * 重寫使用者的「我愛工作」Canvas。
 *
 * 策略：刪舊建新（方案 A）。
 * - 若 store 有舊 canvasId，先嘗試刪除（失敗吞掉，canvas 可能已不存在）
 * - 建立新 canvas，內容為 `# 我愛工作\n\n` + 傳入的 markdown
 * - 將新 canvasId 寫回 store
 *
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 * @param {string} dmChannelId
 * @param {string} markdown  entries 的 markdown（不含標題）
 * @returns {Promise<string>} 新建的 canvasId
 */
async function rewriteCanvas(client, userId, dmChannelId, markdown) {
  const oldId = store.getCanvasId(userId);
  if (oldId) {
    try {
      await client.apiCall('canvases.delete', { canvas_id: oldId });
    } catch (err) {
      console.warn(`[canvas] delete old canvas ${oldId} failed (ignored):`, err.data?.error || err.message);
    }
  }

  const fullContent = `# 我愛工作\n\n${markdown}`;
  const result = await client.apiCall('conversations.canvases.create', {
    channel_id: dmChannelId,
    document_content: { type: 'markdown', markdown: fullContent },
  });

  const newId = result.canvas_id;
  store.setCanvasId(userId, newId);
  return newId;
}

/**
 * 刪除使用者的 canvas（若存在）並清除 canvasId。
 * 用於 /resetcanvas。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 */
async function deleteCanvas(client, userId) {
  const oldId = store.getCanvasId(userId);
  if (oldId) {
    try {
      await client.apiCall('canvases.delete', { canvas_id: oldId });
    } catch (err) {
      console.warn(`[canvas] delete canvas ${oldId} failed (ignored):`, err.data?.error || err.message);
    }
  }
  store.setCanvasId(userId, null);
}

/**
 * 取得 Canvas 的 permalink。
 * 需要 files:read scope。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} canvasId
 * @returns {Promise<string|null>}
 */
async function getCanvasPermalink(client, canvasId) {
  try {
    const info = await client.apiCall('files.info', { file: canvasId });
    return info.file?.permalink || null;
  } catch (err) {
    console.warn(`[canvas] files.info(${canvasId}) failed:`, err.data?.error || err.message);
    return null;
  }
}

module.exports = { rewriteCanvas, deleteCanvas, getCanvasPermalink };
