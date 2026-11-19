import corpus from '../netlify/server/corpus.mjs'
import timetable from '../netlify/server/timetable.mjs'
import { courses, timetableInfo } from '../public/current-courses.js'

const ignored = new Set('a an and are as at be by can could did do does for from how i in is it me my of on or our please should tell that the their there these this to was what when where which who why will with would you your'.split(' '))
const normalized = text => text.toLowerCase().replace(/\b([a-z]{2,6})\s+(\d{3,5})\b/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim()
const words = text => normalized(text).split(' ').filter(word => word.length > 1 && !ignored.has(word))
const branchNotice = {
  title: 'Branch change notice',
  url: 'https://iith.ac.in/news/2021/10/18/Branch-Change-option-is-discontinued/',
  location: 'Institute announcement',
  note: '18 October 2021',
  text: 'Branch Change option is discontinued from the Academic Year 2021 - 22.'
}
const indexed = [...corpus, branchNotice, ...timetable].map(source => {
  const titleTerms = new Set(words(source.title + ' ' + source.location))
  return { source, titleTerms, terms: new Set([...titleTerms, ...words(source.text)]) }
})
const frequencies = new Map()
for (const { terms } of indexed) {
  for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1)
}

const teacherNames = [...new Set(courses.flatMap(course => course.instructors))].sort((a, b) => a.localeCompare(b))
const courseIndex = courses.map(course => ({
  course,
  codes: course.code.split('/').map(normalized).filter(Boolean),
  name: normalized(course.name)
}))
const timetableSource = {
  title: 'EE department current timetable',
  url: timetableInfo.url,
  location: 'EE B.Tech, ICDT B.Tech and M.Tech / PG',
  note: timetableInfo.semester + ' · updated ' + timetableInfo.updated + ' · checked ' + timetableInfo.accessed
}

function timetableResult(question, previousQuestion) {
  if (/\b(?:202[0-57-9]|20[13]\d|even semester|last semester|next semester|previous semester|previous term|next term|january|february|march|april|jan|feb|mar|apr)(?:\b|$)/i.test(question)) return null
  const teacherQuestion = /\b(?:teach\w*|taught|tak(?:e|ing)|instructors?|profs?|professors?|faculty)\b/i.test(question)
  if (!teacherQuestion && /\b(?:curriculum|batch|requirements?|eligibility)\b/i.test(question)) return null

  function matchCourses(text) {
    const phrase = ' ' + normalized(text) + ' '
    const matches = courseIndex.filter(entry => entry.codes.some(code => phrase.includes(' ' + code + ' ')) ||
      (entry.name.length >= 8 && phrase.includes(' ' + entry.name + ' ')))
    if (matches.length) return matches.map(entry => entry.course)
    const exactTeacher = teacherNames.find(name => phrase.includes(' ' + normalized(name) + ' '))
    if (exactTeacher) return courses.filter(course => course.instructors.includes(exactTeacher))
    if (!teacherQuestion) return []
    const query = new Set(words(text))
    const matchingNames = teacherNames.filter(name => words(name).some(part => part.length > 2 && query.has(part)))
    return matchingNames.length === 1 ? courses.filter(course => course.instructors.includes(matchingNames[0])) : []
  }

  let matches = matchCourses(question)
  if (!matches.length && previousQuestion && teacherQuestion && /\b(?:it|that|this|course)\b/i.test(question)) matches = matchCourses(previousQuestion)
  if (matches.length) {
    const program = /\bicdt\b/i.test(question) ? 'ICDT B.Tech' : /\b(?:m\.?tech|pg|postgraduate)\b/i.test(question) ? 'M.Tech / PG' : /\bee b\.?tech\b/i.test(question) ? 'EE B.Tech' : ''
    if (program) matches = matches.filter(course => course.program === program)
    if (!matches.length) return { sources: [timetableSource], text: 'No matching offering is listed for that programme in ' + timetableInfo.semester + '. [1]' }
    return {
      sources: [timetableSource],
      text: '### ' + timetableInfo.semester + ' timetable [1]\n\n' + matches.map(course =>
        '- **' + course.code + ' ' + course.name + '** (' + course.program + ', ' + course.group + '): ' +
        (course.instructors.join(' / ') || 'Instructor unspecified') + '. Credits: ' + course.credits + ' · Slot: ' + course.slot + ' · Room: ' + course.room + '. [1]'
      ).join('\n')
    }
  }
  if (teacherQuestion && !/\b(?:advisor|supervisor|guide|committee|[a-z]{2,6}\s*\d{4})\b/i.test(question.replace(/\b(?:in|for|of)\s+2026\b/gi, '')) &&
      /\b(?:all|current|semester|this term|list|timetable)\b/i.test(question)) {
    const program = /\bicdt\b/i.test(question) ? 'ICDT B.Tech' : /\b(?:m\.?tech|pg|postgraduate)\b/i.test(question) ? 'M.Tech / PG' : /\bee b\.?tech\b/i.test(question) ? 'EE B.Tech' : ''
    const names = program ? teacherNames.filter(name => courses.some(course => course.program === program && course.instructors.includes(name))) : teacherNames
    return {
      sources: [timetableSource],
      text: '### ' + names.length + ' named instructors · ' + timetableInfo.semester + (program ? ' · ' + program : '') + ' [1]\n\n' +
        names.join(', ') + '. [1]\n\nOpen Courses & instructors in the sidebar to see their course assignments.'
    }
  }
  return null
}

const phdGuidelines = corpus.find(source => source.title === 'EE PhD guidelines' && source.text.includes('Program — Coursework'))

export function searchSources(question, previousQuestion, attachment) {
  if (!attachment) {
    const answer = timetableResult(question, previousQuestion)
    if (answer) return answer
    if (phdGuidelines && /\bph\.?d\b/i.test(question) && /\b(?:course\s*work|course credits)\b/i.test(question) &&
        !/\b(?:cgpa|gpa|exam|committee|advi[sc]|additional|electives?|deadline|when|year)\b/i.test(question)) {
      const rows = phdGuidelines.text.split('\n').slice(1, 3)
      return { sources: [phdGuidelines], evidence: [], text: '### PhD coursework credits [1]\n\n' + rows.map(row => '- ' + row.replace('alteast', 'at least').replace('course work', 'coursework') + ' [1]').join('\n') }
    }
  }

  const query = [...new Set(words(question))]
  const sources = []
  const evidence = []
  const text = []
  if (attachment) {
    const pages = attachment.pages || [{ number: null, text: attachment.text }]
    const lines = pages.flatMap(page => page.text.split(/\r?\n/).filter(line => line.trim()).map(line => ({
      ...page, line, score: words(line).filter(word => query.includes(word)).length
    })))
    const matches = lines.filter(line => line.score).sort((first, second) => second.score - first.score).slice(0, 6)
    sources.push({ title: attachment.name, url: '', location: 'Your attachment', note: 'Student-provided document' })
    const snippets = matches.map(match => (match.number ? 'Page ' + match.number + ' · ' : '') + match.line.slice(0, 330))
    evidence.push(snippets.join('\n'))
    text.push(snippets.length
      ? '### Matches in your document [1]\n' + snippets.map(snippet => '- ' + snippet + ' [1]').join('\n')
      : 'No matching lines were found in your document. Try a course code, name, or exact term. [1]')
  }

  const matches = indexed.map(({ source, titleTerms, terms }) => {
    const score = query.reduce((sum, term) => sum + (terms.has(term) ? (titleTerms.has(term) ? 3 : 1) / Math.sqrt(frequencies.get(term)) : 0), 0)
    return { source, score }
  }).filter(item => item.score > 0).sort((first, second) => second.score - first.score).slice(0, 3)
  if (matches.length) {
    text.push('### Related source excerpts')
    for (const { source } of matches) {
      sources.push(source)
      evidence.push(source.text)
      const lines = source.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      const matching = lines.map(line => ({ line, score: words(line).filter(word => query.includes(word)).length }))
        .sort((first, second) => second.score - first.score)[0]?.line || ''
      const term = words(matching).find(word => query.includes(word))
      const start = term ? Math.max(0, matching.toLowerCase().indexOf(term) - 55) : 0
      const excerpt = (start > 0 ? '…' : '') + matching.slice(start, start + 420) + (matching.length > start + 420 ? '…' : '')
      text.push('**' + source.title + ' · ' + source.location + '** [' + sources.length + ']\n' + excerpt)
    }
  }
  return { sources, evidence, text: text.join('\n\n') || 'No matching source was found. Try a course code or a more specific term.' }
}
