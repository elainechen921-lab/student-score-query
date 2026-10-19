# 森光學習站｜Google Sheets API 更新版

這是以既有 `grade-forest-sheets-api.zip` 為基礎校正的 API 模式專案。保留馬卡龍森林風格、學生／考試選單、學生密碼登入、完整成績、分析圖表、`normalizeCount` 組距人數處理、錯誤處理、登出與閒置登出。

> **資料與隱私聲明**：本 ZIP 不含真實姓名、學生密碼、密碼雜湊、學生成績、完整試算表匯出檔或其他個資。它只提供程式、設定範例與部署說明。

## 專案結構

```text
frontend/
├── index.html
├── style.css
├── app.js
├── config.example.js
└── config.js                 # 空白設定範本；不要填入秘密
apps-script/
├── Code.gs
└── README-部署步驟.md
README.md
.gitignore
```

## 已校正的最新工作表名稱

依目前可靠讀到的工作表名稱，設定如下：

- 登入密碼
- 九上一段
- 八下三段
- 八下二段
- 八下一段
- 八上三段
- 八上二段
- 八上一段
- 七上三段
- 七上二段
- 七上一段
- all (2)
- all Data cleanup

其中：

- `登入密碼` 是密碼工作表，Apps Script 的 `PASSWORD_SHEET_NAME` 預設值就是 `登入密碼`。
- `九上一段` 至 `七上一段` 共 10 個名稱是預設成績來源。
- `all (2)` 與 `all Data cleanup` **不會**列入預設成績來源；只有管理者手動把它們加入 `DATA_SHEET_NAMES` 時才會讀取。
- 文件／目前分頁標題可見 `901段考1`，但它不在上述 10 個預設成績來源中；若它實際上是要查詢的工作表，請由管理者手動加入設定，不要自行假設。

### 名稱與 gid 的差異

使用者提供的試算表 ID 範例為：

```text
1PWH9BlSZysOsdVuQvoaig-bud8lYz6V7smOF1m2B6x4
```

網址中的 `gid=194744486` **只用於在 Google Sheets 介面定位分頁**。本程式查詢使用工作表「名稱」，不使用 gid 代替名稱。若工作表改名，必須同步更新 Apps Script 的 Script Properties `PASSWORD_SHEET_NAME` 或 `DATA_SHEET_NAMES`；若沒有設定 `DATA_SHEET_NAMES`，則要同步修改 `Code.gs` 的 `DEFAULT_DATA_SHEET_NAMES`。

## 目前資料可見範圍與欄位別名

目前只能可靠確認工作表名稱，以及文件中可見的欄位標題 `座號姓名`；不能假設其他儲存格的實際欄位、位置、公式結果或資料排列。因此 `apps-script/Code.gs` 保留集中式欄位別名設定，欄位結構變動時請調整 `SETTINGS.aliases` 及必要的解析程式 `readScoreRows_()`。

程式支援把一個 `座號姓名` 欄位拆成：

```text
開頭數字 + 姓名  →  studentId + studentName
```

例如格式可以是 `01王○○`，但 ZIP 不放入任何真實姓名。若工作表另有分開的學生編號／姓名欄，程式會優先使用分開欄位。成績工作表也可使用合併欄位，但仍須確認每列的科目與成績欄位別名。

預設登入 payload 固定為：

```json
{"studentId":"...","examKey":"...","password":"..."}
```

`examKey` 是成績工作表名稱；`password` 只在請求當下送到後端，不會放入前端資料檔，也不會由 API 回傳。

## API 模式：修改 Sheets 後是否要重傳前端？

流程如下：

```text
家長瀏覽器 → GitHub Pages 前端 → Google Apps Script API → Google Sheets
```

以 API 模式來說，之後只修改 Google Sheets 資料，通常就能在下一次查詢取得更新內容，**不用重新上傳前端程式碼**。若只是修改分數、密碼工作表資料或公式內容，不需重傳 frontend。

但下列情況需要更新 Apps Script 設定或程式：

- 工作表名稱改變：更新 `PASSWORD_SHEET_NAME` 或 `DATA_SHEET_NAMES`。
- 欄位結構改變：調整 `SETTINGS.aliases`、合併欄位解析或 `readScoreRows_()`。
- API 合約、登入規則或前端功能改變：重新部署／更新相應程式。

## 快速設定

### A. Apps Script

1. 從受控 Google 試算表開啟「擴充功能 → Apps Script」。
2. 將 `apps-script/Code.gs` 全文貼到 `Code.gs`，儲存。
3. 在「專案設定 → 指令碼屬性」新增：

| 名稱 | 建議值 |
|---|---|
| `SHEET_ID` | `1PWH9BlSZysOsdVuQvoaig-bud8lYz6V7smOF1m2B6x4` |
| `PASSWORD_SHEET_NAME` | `登入密碼` |
| `DATA_SHEET_NAMES` | `九上一段,八下三段,八下二段,八下一段,八上三段,八上二段,八上一段,七上三段,七上二段,七上一段` |

`DATA_SHEET_NAMES` 請以逗號分隔且名稱必須完全相同。若留白，Code.gs 會使用同一組 10 個預設名稱；若改名，建議直接更新 Script Properties。

### B. 登入密碼工作表

第一列必須是欄位標題。程式支援：

- 分開欄位：`studentId`／`學生編號`、`studentName`／`姓名`
- 合併欄位：`座號姓名`，格式為開頭數字加姓名
- 認證欄位：優先使用 `passwordHash` + `passwordSalt`；亦相容讀取 `password`／`密碼`，但正式環境應改用經審查的加鹽雜湊或學校身分系統
- 可選欄位：`active`／`啟用`

請不要把明文密碼、密碼雜湊或學生資料複製到前端或公開 ZIP。登入密碼工作表本身也應由受控帳號管理。

### C. 成績工作表

本專案不假設實際儲存格欄位。常用別名集中在 `Code.gs`，可依真實標題調整：

- 學生：`studentId`／`學生編號`／`座號`／`座號姓名`
- 科目：`subject`／`科目`
- 分數：`rawScore`／`原始分數`／`成績`、`weightedScore`、`makeupScore`
- 摘要：`grade`、`className`、`totalScore`、`average`、`rank`、`classSize`
- 分布：`range`／`組距`、`count`／`人數`／`組距人數`

若實際格式是橫向一生多科、合併儲存格、每次考試一列或分布位於另一個表格，請調整 `readScoreRows_()`，不能只改前端假設。

### D. 部署 Web App 與前端

1. Apps Script 選「部署 → 新增部署 → 網頁應用程式」。
2. 執行身分選能讀取受控試算表的帳號；存取權依學校個資政策設定。
3. 複製 `/exec` Web App URL。
4. 將 `frontend/config.example.js` 複製為 `frontend/config.js`，填入：

```js
window.APP_CONFIG = Object.freeze({
  API_URL: 'https://script.google.com/macros/s/你的部署ID/exec',
  API_TIMEOUT_MS: 12000,
  IDLE_MS: 10 * 60 * 1000,
  REMINDER_MS: 8 * 60 * 1000
});
```

API URL 不是密碼，但前端不要放 API 金鑰、學生密碼、雜湊、成績或個資。部署後測試 `GET ?action=options`、正確登入、錯誤登入、登出、閒置登出與手機瀏覽器。

## 功能與資料處理

- 前端選單由 API 取得，不內嵌學生資料。
- 後端只在登入成功後回傳該學生、該考試的必要資料。
- `normalizeCount` 對空白、缺漏、負數、小數或無法解析的組距人數回傳 `null`／「待補」，不會當成 0。
- 支援全形數字、千分位與公式顯示結果。
- 成績表、長條圖、雷達圖、組距圖、優勢／待加強分析均保留。
- 前端包含 API 逾時、網路中斷、非 JSON、錯誤訊息、登出與閒置自動登出處理。

## 設定與上線檢查清單

- [ ] `PASSWORD_SHEET_NAME` 是 `登入密碼`，且名稱與工作表完全一致。
- [ ] `DATA_SHEET_NAMES` 是最新 10 個成績分頁；未誤列入 `all (2)` 或 `all Data cleanup`。
- [ ] 了解 gid 只用於定位，程式設定使用工作表名稱。
- [ ] 若看到 `901段考1` 但要作為資料來源，已由管理者手動加入設定；沒有自行把它當成預設來源。
- [ ] 已確認標題列與 `Code.gs` 別名一致；若欄位改變，已同步調整解析程式。
- [ ] 已確認 `座號姓名` 的開頭數字解析結果符合實際座號格式；ZIP 沒有真實姓名。
- [ ] 已測試學生密碼登入 payload：`studentId`、`examKey`、`password`。
- [ ] 前端與 ZIP 沒有真實密碼、密碼雜湊、學生成績或個資。
- [ ] 已測試正確／錯誤登入、未知考試、空欄位、服務錯誤、登出與閒置登出。
- [ ] 已測試組距人數缺漏、公式結果、全形數字、圖表與資料更新時間。
- [ ] 已確認 Web App 權限、CORS／重新導向、登入失敗限制與個資告知流程。

## .gitignore 與安全提醒

`.gitignore` 只能避免未來誤加入檔案，不能移除已進入 Git 歷史的秘密。請不要提交：真實 CSV／XLSX、學生密碼、密碼雜湊、完整身分證資料、服務帳號金鑰或私人 API 設定。

