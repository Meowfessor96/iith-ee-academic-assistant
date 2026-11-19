import assert from 'node:assert/strict'
import { test } from 'node:test'
import netlifyHandler from '../netlify/server/index.mjs'
import { progressQuestion, snapshotCredits } from '../public/credit-context.js'
import { freshPlan } from '../public/credit-model.js'

function post(path, body) {
  return netlifyHandler(new Request('https://test.netlify.app' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }))
}

function attachment(name, content) {
  return { name, data: Buffer.from(content).toString('base64') }
}

function pdfWithCourseTable() {
  const rows = [
    ['Course Code', 'Course Name', 'Credits'],
    ['EE1101', 'Circuits and Network Analysis', '3'],
    ['EE1200', 'Basic Electrical Engineering Lab', '1.5']
  ]
  const positions = [40, 165, 420]
  const content = rows.flatMap((row, i) => row.map((text, j) =>
    'BT /F1 11 Tf ' + positions[j] + ' ' + (750 - i * 25) + ' Td (' + text + ') Tj ET'
  )).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'
    return String(offset).padStart(10, '0') + ' 00000 n \n'
  })
  const xref = pdf.length
  return pdf + 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('') +
    'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'
}

test('Netlify imports course tables from CSV and PDF without AI credentials', async () => {
  const files = [
    attachment('courses.csv', 'Code,Course Name,Credits\nEE1101,Circuits and Network Analysis,3\nEE1200,Basic Electrical Engineering Lab,1.5'),
    attachment('courses.pdf', pdfWithCourseTable())
  ]
  for (const file of files) {
    const response = await post('/api/extract', { attachment: file })
    const data = await response.json()
    assert.equal(response.status, 200, JSON.stringify(data))
    assert.deepEqual(data.courses.map(({ code, name, credits }) => ({ code, name, credits })), [
      { code: 'EE1101', name: 'Circuits and Network Analysis', credits: 3 },
      { code: 'EE1200', name: 'Basic Electrical Engineering Lab', credits: 1.5 }
    ])
  }

  const invalid = await post('/api/extract', { attachment: attachment('invalid.pdf', 'Not a PDF') })
  assert.equal(invalid.status, 400)
  assert.match((await invalid.json()).error, /valid PDF/)
})

test('Netlify cites opted-in calculator totals and prompts when they are absent', async () => {
  const plan = freshPlan()
  plan.manual.science = 4
  plan.courses = [
    { code: 'EE1101', name: 'Circuits and Network Analysis', category: 'department_core', kind: 'theory', credits: 3 },
    { code: 'EE2301', name: 'Electronic Devices Lab', category: 'stream_core', kind: 'lab', basket: 'micro', credits: 1.5 }
  ]
  const creditSummary = snapshotCredits(plan)
  assert.doesNotMatch(JSON.stringify(creditSummary), /EE1101|Circuits/)
  const response = await post('/api/chat', { question: progressQuestion, creditSummary })
  assert.equal(response.status, 200)
  const [sources, answer, done] = (await response.text()).trim().split('\n').map(JSON.parse)
  assert.equal(sources.sources[0].title, 'Your credit calculator')
  assert.equal(sources.mode, 'calculator')
  assert.match(answer.text, /8\.5 of 128 credits completed\. 119\.5 credits left/)
  assert.match(answer.text, /Departmental courses: 4\.5 of 76 credits/)
  assert.equal(done.type, 'done')

  const without = await post('/api/chat', { question: progressQuestion })
  const [noSources, hint] = (await without.text()).trim().split('\n').map(JSON.parse)
  assert.deepEqual(noSources.sources, [])
  assert.match(hint.text, /Include credit calculator totals/)
})
