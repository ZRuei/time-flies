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

  const result = await client.conversations.canvases.create({
    channel_id: dmChannelId,
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
  await client.canvases.edit({
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
}

module.exports = { getOrCreateCanvas, appendToCanvas };
