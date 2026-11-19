import { courses, timetableInfo } from './current-courses.js'

const searchText = value => value.toLowerCase().replace(/\b([a-z]{2,6})\s+(\d{3,5})\b/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim()

export function setupCourseBrowser() {
  const search = document.querySelector('#courseSearch')
  const program = document.querySelector('#courseProgram')
  const list = document.querySelector('#semesterCourseRows')
  const summary = document.querySelector('#courseResults')
  document.querySelector('#timetableDate').textContent =
    timetableInfo.semester + ' · department update ' + timetableInfo.updated
  document.querySelector('#officialTimetable').href = timetableInfo.url

  const rows = courses.map(course => {
    const row = document.createElement('tr')
    for (const value of [course.code, course.name, course.instructors.join(' / ') || 'Instructor unspecified',
      course.program + ' · ' + course.group, course.credits, course.slot, course.room]) {
      const cell = row.insertCell()
      cell.textContent = value
    }
    if (course.url) {
      const link = document.createElement('a')
      link.href = course.url
      link.target = '_blank'
      link.rel = 'noreferrer'
      link.textContent = course.code
      row.cells[0].replaceChildren(link)
    }
    list.append(row)
    const terms = searchText([course.code, course.name, ...course.instructors, course.program, course.group].join(' '))
    return { course, row, terms }
  })

  function filter() {
    const terms = searchText(search.value).split(' ').filter(Boolean)
    const instructors = new Set()
    let count = 0
    for (const { course, row, terms: searchable } of rows) {
      row.hidden = (program.value && course.program !== program.value) || !terms.every(term => searchable.includes(term))
      if (!row.hidden) {
        count++
        for (const name of course.instructors) instructors.add(name)
      }
    }
    summary.textContent = count ? count + ' timetable entries · ' + instructors.size + ' named instructors' : 'No matching courses or instructors.'
  }
  search.addEventListener('input', filter)
  program.addEventListener('change', filter)
  filter()
}
