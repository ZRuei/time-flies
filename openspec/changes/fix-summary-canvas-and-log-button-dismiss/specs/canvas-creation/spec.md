## ADDED Requirements

### Requirement: Canvas 使用 standalone API 建立
Bot SHALL 使用 `canvases.create` API 建立 Canvas，不依賴 `conversations.canvases.create`。

#### Scenario: 首次建立 Canvas 成功
- **WHEN** 使用者執行 `/summary` 且 store 中尚無該使用者的 canvasId
- **THEN** Bot 呼叫 `canvases.create` 並將回傳的 `canvas_id` 存入 store
- **THEN** Bot 繼續執行 append 與傳送 permalink 流程

#### Scenario: 已有 Canvas ID 時不重複建立
- **WHEN** 使用者執行 `/summary` 且 store 中已存有 canvasId
- **THEN** Bot 跳過建立步驟，直接使用既有 canvasId

#### Scenario: Canvas 建立失敗時回報錯誤至 DM
- **WHEN** `canvases.create` 呼叫回傳錯誤（如權限不足）
- **THEN** Bot 在使用者 DM 傳送包含錯誤訊息的通知
- **THEN** 錯誤訊息提示使用者確認 `canvases:write` 權限
