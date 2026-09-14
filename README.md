# ntut-course-crawler-node
這裡是北科課程系統的網頁爬蟲。

## 北科課程好朋友
https://ntut-course.gnehs.net/

## 關於
https://ntut-course.gnehs.net/about

## API 文件
https://ntut-course.gnehs.net/api

## 資料
你可以切換到 `gh-pages` 分支查看或下載抓取的資料

## 如何使用
- install Node.js
- clone repo
- `cd ./path/ntut-course-crawler-node`
- `npm i`
- `node fetchAll.js`
- `node fetchCourse.js`
- `node fetchMProgram.js`

## 提醒
- 課程網站若抓取過快很容易被封鎖，因此本爬蟲有限制同一時間抓取頁面數量，可自行調整。
- 我抓二十年的資料花了大概兩天，所以你要抓的話自己加油喔！

## 目前學期與新增資料

使用 npm。完整更新一個學期時，先取得三部別課程，再取得課綱，最後建立搜尋索引：

```bash
npm ci
npm test
node fetchCourse.js all 115 1
node fetchSyllabus.js all 115 1
node finalizeCourseData.js 115 1
node fetchPrograms.js 115 1
node fetchCompetencies.js
```

課程與課綱指令的第一個參數可用 `0`、`1`、`2` 指定日間部、進修部、研究所；`all` 取得三部別。省略年度學期則依學校目前選定的學期執行。`finalizeCourseData.js` 需要同一學期三部別清單與完整課綱，不能在僅完成一個部別時執行。

`fetchAll.js` 會跨歷年取得課程、班級、微學程、一般學程，最後更新核心能力；它不會逐年抓所有教師課綱。要更新個別學期課綱，請使用上面的課綱與索引指令。

### 輸出

| 路徑 | 內容 |
| --- | --- |
| `/{year}/{sem}/{system}.json` | 課程清單。依表頭讀取授課語言 `language`、隨班附讀 `audit`、實驗實習 `lab`、跨領域 `interdisciplinary`，保留既有課號／班級／節次等資料。 |
| `/{year}/{sem}/course/{id}.json` | 教師課綱陣列。包含 `officeHoursLink`（有提供才輸出）、AI、SDGs、延伸資源，以及 `foreignLanguageTextbooks` 的是／否／未填三態。 |
| `/{year}/{sem}/syllabus-index.json` | 以課號為 key，值為 `{ ai: string[], sdgs: number[], resources: string[], hasSyllabus: boolean }`；合併多名教師並排除學校「無」選項。 |
| `/{year}/{sem}/programs.json` | 一般學程 `{ id, name, href, courses, description? }[]`，`courses` 是該學期課號陣列。 |
| `/competencies.json` | 系所 `{ id, name, href, abilities, courses }[]`，能力 `{ id, name }`，課程 `{ code, name, abilityIds }`。來源無學期，不以目前學期冒充版本。 |

核心能力的課程 `code` 是課程代碼，不是每學期的開課課號 `id`。不可拿兩者直接等值比對。

### 發布與殘留資料

每日課程 workflow 先固定年度學期，合併三部別產物後驗證完整性、產生課綱索引，再組合既有 `gh-pages` 資料與新快照，以單一 commit 替換該學期的 `course/` 目錄。這會移除不再被現行清單引用的舊課綱，同時保留其他學期、統計、班級與學程資料。若任一部別的課程或課綱擷取失敗，workflow 會失敗並保留整個學期的既有版本，不發布部分清單。

其他包含多個資料集的 workflow 會把每個抓取器放在獨立 job，成功後才上傳短期 artifact。最後的發布 job 即使部分前置 job 失敗仍會執行，只合併成功的 artifact；失敗資料集沿用 `gh-pages` 上一版。APS 單一請求最多等待二十分鐘，以容許舊伺服器的正常慢回應；更外層的 dataset workflow timeout 負責處理真正卡死的流程。只有最後的發布 job 會取得共用 `course-data-gh-pages` 佇列，因此單一抓取器卡住不會占用發布鎖或阻止其他 workflow 產生資料。

一般學程隨微學程每日更新；核心能力隨課程標準每月更新，兩者也支援手動 workflow 執行。程式碼變更本身不會回填已發布資料，需等對應爬蟲成功執行。

### 驗證

解析器測試使用合成 HTML，涵蓋表頭變動、缺值、多教師、特殊課綱與原始連結。發布測試確認缺少部別或課綱時停止、跨部別課號去重、舊課綱不進入快照，且不修改輸入資料。不要把真實聯絡資料放入測試檔。
