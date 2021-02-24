// node index.js <year> <sem>
const { fetchCourse } = require('./crawler/fetchCourse');
const fetchYearSem = require('./crawler/fetchYearSem');
const { fetchDepartment } = require('./crawler/fetchDepartment');

async function main() {
    let { year, sem } = (await fetchYearSem()).current
    console.log(year, sem)
    //await fetchDepartment(year, sem)
    for (let m of ['日間部', '進修部', '研究所(日間部、進修部、週末碩士班)']) {
        await fetchCourse(m, year, sem)
    }
}
main()