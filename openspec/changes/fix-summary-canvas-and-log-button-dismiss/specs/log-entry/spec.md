## ADDED Requirements

### Requirement: 「再新增一筆」按鈕點擊後移除 actions block
當使用者點擊「再新增一筆」按鈕後，Bot SHALL 更新原訊息以移除 actions block，僅保留紀錄確認文字。

#### Scenario: 點擊「再新增一筆」後按鈕消失
- **WHEN** 使用者在工時確認訊息中點擊「再新增一筆」按鈕
- **THEN** Bot 開啟新的 log Modal
- **THEN** Bot 更新原訊息，移除 actions block，僅留 section 確認文字

#### Scenario: 點擊「再新增一筆」後無法重複點擊
- **WHEN** 使用者已點擊「再新增一筆」一次
- **THEN** 原訊息的按鈕已被移除，無法再次觸發相同 action

#### Scenario: 點擊「完成」後按鈕消失（現有行為保持不變）
- **WHEN** 使用者在工時確認訊息中點擊「完成」按鈕
- **THEN** Bot 更新原訊息，移除 actions block，僅留 section 確認文字
