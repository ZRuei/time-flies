const store = require('./store');

/**
 * 取得或建立使用者的「我愛工作」Canvas。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 * @param {string} dmChannelId
 * @returns {Promise<string>} canvasId
 */
async function getOrCreateCanvas(client, userId, dmChannelId) {
  const existingId = store.getCanvasId(userId);
  if (existingId) return existingId;

  // @slack/web-api v6 不含 Canvas API，使用 apiCall 直接呼叫
  // 使用 canvases.create（standalone）取代 conversations.canvases.create，相容性更佳
  const result = await client.apiCall('canvases.create', {
    document_content: {
      type: 'markdown',
      markdown: '# 我愛工作\n\n',
    },
  });

  const canvasId = result.canvas_id;
  store.setCanvasId(userId, canvasId);
  return canvasId;
}

/**
 * 在 Canvas 末端 append markdown 內容。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} canvasId
 * @param {string} markdown
 */
async function appendToCanvas(client, canvasId, markdown) {
  const result = await client.apiCall('canvases.edit', {
    canvas_id: canvasId,
    changes: [
      {
        operation: 'insert_at_end',
        document_content: {
          type: 'markdown',
          markdown,
        },
      },
    ],
  });
  console.log('[canvas] canvases.edit result:', JSON.stringify(result));
}

/**
 * 取得 Canvas 的 permalink。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} canvasId
 * @returns {Promise<string|null>}
 */
async function getCanvasPermalink(client, canvasId) {
  try {
    const info = await client.apiCall('files.info', { file: canvasId });
    if (info.file?.permalink) return info.file.permalink;
  } catch {}

  try {
    const auth = await client.apiCall('auth.test', {});
    if (auth.url) return `${auth.url}docs/${canvasId}`;
  } catch {}

  return null;
}

module.exports = { getOrCreateCanvas, appendToCanvas, getCanvasPermalink };
