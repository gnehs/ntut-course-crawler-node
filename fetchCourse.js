// node fetchCourse.js <m> <year> <sem>
const { fetchCourse } = require('./crawler/fetchCourse');
const fetchYearSem = require('./crawler/fetchYearSem');
const { fetchDepartment } = require('./crawler/fetchDepartment');

async function main() {
    let m = process.argv[2],
        year = process.argv[3] || null,
        sem = process.argv[4] || null
    if (!year || !sem) {
        let { y, s } = (await fetchYearSem()).current
        year = y
        sem = s
    }
    await fetchCourse(['日間部', '進修部', '研究所(日間部、進修部、週末碩士班)'][m], year, sem)
}
main()