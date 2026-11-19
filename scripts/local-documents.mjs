const maxFileBytes = 4 * 1024 * 1024
const maxTextLength = 50000

export async function readAttachment(file) {
  if (!file) return null
  if (typeof file.name !== 'string' || typeof file.data !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data)) {
    throw new Error('The attachment could not be read. Choose the file again.')
  }
  const bytes = Buffer.from(file.data, 'base64')
  if (!bytes.length || bytes.length > maxFileBytes) throw new Error('Choose a non-empty file no larger than 4 MB.')
  const name = file.name.slice(0, 200).replace(/[\r\n]/g, ' ')
  if (/\.(txt|md|csv)$/i.test(name)) return { name, text: limitText(bytes.toString('utf8')) }
  if (!/\.pdf$/i.test(name) || bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Choose a text PDF, CSV, TXT, or Markdown document.')
  }

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  const pages = []
  try {
    const pdf = await task.promise.catch(() => { throw new Error('This PDF could not be opened. Check that it is readable and unlocked.') })
    if (pdf.numPages > 30) throw new Error('Choose a PDF of 30 pages or fewer.')
    let length = 0
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const { items } = await page.getTextContent()
      const lines = []
      let line = ''
      let previous
      for (const item of items) {
        if (!('str' in item)) continue
        if (previous && Math.abs(item.transform[5] - previous.transform[5]) > 2) {
          if (line.trim()) lines.push(line.trim())
          line = ''
        }
        if (item.str.trim()) {
          const gap = previous ? item.transform[4] - previous.transform[4] - previous.width : 0
          line += (line ? (gap > 12 ? '\t' : ' ') : '') + item.str.trim()
        }
        if (item.hasEOL) {
          if (line.trim()) lines.push(line.trim())
          line = ''
        }
        if (item.str.trim()) previous = item
      }
      if (line.trim()) lines.push(line.trim())
      const text = lines.join('\n')
      length += text.length + 1
      if (length > maxTextLength) throw new Error('This PDF contains too much text. Choose a shorter document.')
      pages.push({ number, text })
    }
  } finally {
    await task.destroy()
  }
  const text = pages.map(page => page.text).join('\n')
  if (!text.trim()) throw new Error('This PDF has no selectable text. Use a text PDF, CSV, or enter the courses manually.')
  return { name, text, pages }
}

function limitText(text) {
  if (text.length > maxTextLength) throw new Error('This file contains too much text. Choose a shorter document.')
  return text
}

function splitColumns(line, delimiter) {
  if (delimiter !== ',') return line.replace(/^\||\|$/g, '').split(delimiter).map(value => value.trim())
  return (line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g) || []).filter(Boolean)
    .map(value => value.replace(/,$/, '').trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
}

export function extractCourses({ text }) {
  const results = []
  const seen = new Set()
  let table
  for (const line of text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    const delimiter = ['\t', '|', ','].find(separator => line.includes(separator))
    let code
    let name
    let credits
    if (delimiter) {
      const cells = splitColumns(line, delimiter)
      const headings = cells.map(cell => cell.toLowerCase().replace(/[^a-z]/g, ''))
      const creditColumn = headings.findIndex(value => /^(credits?|coursecredits?|creditunits?)$/.test(value))
      const codeColumn = headings.findIndex(value => /^(code|coursecode|courseno|coursenumber)$/.test(value))
      const nameColumn = headings.findIndex(value => /^(name|title|coursename|coursetitle|course)$/.test(value))
      if (creditColumn >= 0 && (nameColumn >= 0 || codeColumn >= 0)) {
        table = { creditColumn, codeColumn, nameColumn, delimiter, columns: cells.length }
        continue
      }
      if (table?.delimiter === delimiter && cells.length === table.columns) {
        code = cells[table.codeColumn] || ''
        name = cells[table.nameColumn] || ''
        credits = cells[table.creditColumn]
      }
    }
    if (credits === undefined) {
      const explicit = line.match(/^([A-Z]{2,6}\s*\d{3,5}[A-Z]?)\s*[-:–]?\s*(.*?)\s*[,;–-]?\s*(?:credits?\s*[:=]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s+credits?)\.?$/i)
      if (!explicit) continue
      ;[, code, name] = explicit
      credits = explicit[3] ?? explicit[4]
    }
    if ((!code && !name) || (code && !/^[a-z]{2,6}\s*\d{3,5}[a-z]?(?:\/[a-z]{2,6}\s*\d{3,5}[a-z]?)?$/i.test(code)) ||
        !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(credits) || Number(credits) > 30) continue
    const key = JSON.stringify([code.toUpperCase().replace(/\s/g, ''), name.toLowerCase(), Number(credits)])
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ code: code.slice(0, 40), name: name.slice(0, 120), credits: Number(credits) })
    if (results.length === 100) break
  }
  return results
}
