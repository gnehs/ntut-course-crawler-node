// node fetchCourse.js <m> <year> <sem>
const fetchYearSem = require('./crawler/fetchYearSem');
const { fetchCourse } = require('./crawler/fetchCourse');

(async () => {
    let year = process.argv[2] || null,
        sem = process.argv[3] || null
    if (!year || !sem) {
        let { y, s } = (await fetchYearSem()).current
        year = y
        sem = s
    }
    await Promise.all([
        fetchCourse('日間部', year, sem),
        fetchCourse('進修部', year, sem),
        fetchCourse('研究所(日間部、進修部、週末碩士班)', year, sem)
    ]);
    console.log('All done!')
})();