# ntut-course-crawler-node

🕷️ 北科課程系統與教務處網站的爬蟲，它把課程、課綱、學程等資料整理成 JSON，發布到 `gh-pages` 分支，給 [🍤 北科課程好朋友](https://ntut-course.gnehs.net/) 使用。

想自己拿資料做點什麼也很歡迎，直接讀下面的資料網址就好，不用自己爬。

- 資料網址：<https://gnehs.github.io/ntut-course-crawler-node/>
- API 文件：<https://ntut-course.gnehs.net/doc>

## 有哪些資料

| 資料 | 檔案 | 指令 |
| --- | --- | --- |
| 有哪些學年度與學期 | `main.json` | 隨課程一起更新 |
| 課程（日間部、進修部、研究所） | `{學年}/{學期}/main.json`、`進修部.json`、`研究所(日間部、進修部、週末碩士班).json` | `fetchCourse.js` |
| 課綱 | `{學年}/{學期}/course/{課號}.json` | `fetchSyllabus.js` |
| 課綱搜尋索引 | `{學年}/{學期}/syllabus-index.json` | `finalizeCourseData.js` |
| 班級 | `{學年}/{學期}/department.json` | `fetchDepartment.js` |
| 微學程、一般學程 | `{學年}/{學期}/mprogram.json`、`programs.json` | `fetchMProgram.js`、`fetchPrograms.js` |
| 學程介紹與文件連結 | `mprogram-docs.json`、`program-docs.json` | `fetchMProgramDocs.js`、`fetchProgramDocs.js` |
| 課程標準 | `standards.json`、`{學年}/standard.json` | `fetchStandards.js` |
| 系所核心能力 | `competencies.json` | `fetchCompetencies.js` |
| 行事曆 | `calendar.json` | `crawler/fetchCalendar.js` |
| 停修統計 | `analytics/` | `analytics/withdrawal.js` |

學程介紹是從教務處網站上各學程的施行細則 PDF 擷取的，掃描檔讀不出文字，所以有些學程沒有介紹。

## 自動更新

資料由 GitHub Actions 定期更新，設定在 `.github/workflows/`。

- 課程與課綱：2、3、6、8、9 月每天，其他月份每三天。
- 班級、學程：2、3、8、9 月每三天，其他月份每週一。
- 課程標準、核心能力：每月一次。
- 行事曆、停修統計：每週一。

每個資料集各自抓取，某一項失敗時，網站上那一項會沿用上一版，不會發布不完整的資料，各個 workflow 都可以在 Actions 頁面手動執行。

## 在本機執行

需要 Node.js 24。

```bash
npm ci
npm test
```

更新目前學期的課程，依序執行：

```bash
node fetchCourse.js all
node fetchSyllabus.js all
node finalizeCourseData.js 115 1
```

- `all` 代表三個部別，也可以用 `0`、`1`、`2` 只抓日間部、進修部或研究所。
- 在 `all` 後面加上學年和學期（例如 `all 115 1`）可以抓指定學期，不加就抓學校目前的學期。
- `finalizeCourseData.js` 要等三個部別的課程和課綱都抓完才能執行。

其他資料直接執行對應的指令，例如 `node fetchMProgramDocs.js`，結果會寫到 `dist/`。

`fetchAll.js` 會抓所有歷年資料，我抓二十年的資料花了大概兩天，所以你要跑的話自己加油喔！

## 注意

- 學校的課程系統很慢，抓太快容易被擋，爬蟲已經限制同時抓取的數量，請對學校的伺服器溫柔一點。
- 測試檔裡不要放真實的聯絡資料。
