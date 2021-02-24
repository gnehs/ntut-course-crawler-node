// node index.js <year> <sem>
const { fetchCourse } = require('./crawler/fetchCourse');
const fetchYearSem = require('./crawler/fetchYearSem');
const { fetchDepartment } = require('./crawler/fetchDepartment');

async function main() {
    let year, sem
    if (process.argv.length > 3) {
        year = process.argv[2]
        sem = process.argv[3]
    }
    else {
        let { y, s } = (await fetchYearSem()).current
        year = y
        sem = s
    }
    await fetchDepartment(year, sem)
    for (let m of ['日間部', '進修部', '研究所(日間部、進修部、週末碩士班)']) {
        await fetchCourse(m, year, sem)
    }
}
main()