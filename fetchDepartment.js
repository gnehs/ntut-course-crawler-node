// node fetchDepartment.js <year> <sem> 
const fetchYearSem = require('./crawler/fetchYearSem');
const { fetchDepartment } = require('./crawler/fetchDepartment');

async function main() {
    let
        year = process.argv[2] || null,
        sem = process.argv[3] || null
    if (!year || !sem) {
        let { y, s } = (await fetchYearSem()).current
        year = y
        sem = s
    }
    await fetchDepartment(year, sem)
    console.log('All done!')
}
main()