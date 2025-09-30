# Short.io URL Shortener Dashboard

這個專案提供一個簡單易用的短網址管理網站，透過 [Short.io](https://short.io) API 建立、瀏覽、編輯與刪除短網址。後端使用 Node.js 原生模組實作 API 代理層，前端則是純 HTML/CSS/JavaScript 單頁式介面，適合部署於任何支援 Node.js 的環境。

## 功能特色

- ✅ **建立短網址**：輸入原始網址，可選擇自訂路徑、標題、備註與到期時間。
- 🔍 **搜尋與篩選**：即時搜尋標題或原始網址。
- 📋 **複製短網址**：一鍵複製生成的短連結。
- ✏️ **編輯短網址**：支援修改原始網址、路徑、標題、導向類型、到期日、標籤與備註。
- 🏷️ **標籤管理**：以逗號輸入標籤並在卡片與詳情視圖中檢視或清除標籤。
- 🔁 **重複設定**：可切換是否允許重複短鏈結、選擇 301/302/307 導向類型。
- 📈 **查看詳情**：顯示點擊次數、建立/更新/到期時間與目前狀態。
- 🗑️ **刪除短網址**：直接從介面移除不再使用的連結。
- 🌐 **網域提示**：自動抓取並顯示目前使用的 Short.io 網域狀態。
- 🧩 **多語系友善**：介面採繁體中文，表單支援各種字元輸入。

## 環境需求

- Node.js 18 或更新版本（本專案使用 Node.js 20 測試）。
- 一組有效的 Short.io API Key。
- 已設定的 Short.io 網域（免費版亦可）。

## 安裝與啟動

1. 下載專案：

   ```bash
   git clone <repository-url>
   cd short_links_website
   ```

2. 建立環境變數設定檔 `.env`：

   ```ini
   SHORT_IO_API_KEY=你的shortio-api-key
   SHORT_IO_DOMAIN=你的短網址網域（例：example.short.gy）
   PORT=3000 # 可選，預設 3000
   ```

   > `SHORT_IO_API_KEY` 與 `SHORT_IO_DOMAIN` 皆為必填。若你有使用自訂網域，請填寫完整網域名稱。

3. 安裝相依套件（本專案僅使用 Node.js 原生模組，因此無需額外安裝。如需額外工具，可自行加入）。

4. 啟動伺服器：

   ```bash
   npm start
   ```

5. 開啟瀏覽器前往 <http://localhost:3000> 即可使用。

## 系統架構說明

- `server.js`：
  - 載入 `.env` 環境變數。
  - 提供靜態檔案服務與 API 代理。
  - 核心路由：
    - `GET /api/links`：列出符合條件的短網址。
    - `POST /api/links`：建立新的短網址。
    - `GET /api/links/:id`：查詢短網址詳細資料。
    - `PUT /api/links/:id`：更新短網址設定（伺服器會呼叫 Short.io 的 `POST /links/:id` 端點）。
    - `DELETE /api/links/:id`：刪除指定短網址。
    - `GET /api/config`：回傳目前使用的 Short.io 網域。
    - `GET /api/domains`：代理 Short.io 網域列表，方便檢視狀態或取得網域 ID。
- `public/`：前端靜態資源。
  - `index.html`：主視覺與表單界面。
  - `styles.css`：柔和漸層風格並支援標籤、編輯對話框與表單布局。
  - `app.js`：與後端 API 溝通、渲染資料、處理互動與編輯流程。

## 開發與自訂

- 若要加入更多 Short.io API 功能（例如 UTM 參數、A/B 測試等），可在 `server.js` 新增對應的 API 代理端點，再於前端呼叫。
- 若需國際化支援，可在 `public/app.js` 建立多語系字串表並依使用者語系切換。
- 目前僅使用瀏覽器 `fetch` 與 `navigator.clipboard` API，如需支援較舊的瀏覽器，建議加入 polyfill。

## GitHub Pages 部署

本專案已內建 GitHub Actions 工作流程（`.github/workflows/deploy.yml`），只要將程式碼推送到 `main` 分支便會自動：

1. 以 Node.js 20 進行語法檢查，確保 `server.js` 沒有語法錯誤。
2. 將 `public/` 內的靜態資源打包成 GitHub Pages 工件。
3. 部署到專案的 GitHub Pages，並將部署網址寫入 `github-pages` 環境。

若需手動觸發部署，可在 GitHub Actions 頁面選擇 **Deploy to GitHub Pages** 工作流程並使用 `Run workflow`。首次部署前，請在專案設定的 **Pages** 中選擇 **GitHub Actions** 作為部署來源。

> 注意：GitHub Pages 只會部署前端靜態資源。若要在生產環境使用 Short.io API，請另外部署 `server.js` 至支援 Node.js 的主機，或設定前端呼叫可用的 API 代理網址。

## 注意事項

- 本專案僅做為示範，部署前請確保伺服器具備 TLS 與身分驗證等安全措施。
- 若你使用 Docker 或雲端平台部署，務必在環境變數中設定 `SHORT_IO_API_KEY` 與 `SHORT_IO_DOMAIN`。
- Short.io API 有速率限制，請依照官方文件規劃使用策略。

## 授權

本專案採用 ISC License，歡迎自由修改與擴充。
