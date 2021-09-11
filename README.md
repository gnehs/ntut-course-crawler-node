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
- `node fetchAll.js` or `node fetchCourse.js`

## 提醒
- 課程網站若抓取過快很容易被封鎖，因此本爬蟲有限制同一時間抓取頁面數量，可自行調整。
- 我抓二十年的資料花了大概兩天，所以你要抓的話自己加油喔！
