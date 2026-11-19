import { creditProgress, isCreditOverview } from '../public/credit-context.js'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAttachment, extractCourses } from './local-documents.mjs'
import { searchSources } from './local-search.mjs'
import { generateAnswer } from './local-llm.mjs'

const ragMode = process.argv.includes('--rag')

const publicDir = fileURLToPath(new URL('../public', import.meta.url))
const mediaTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.pdf', 'application/pdf']
])
const bodyLimit = 6 * 1024 * 1024
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'

function send(response, status, type, body) {
  response.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
  response.end(body)
}
const json = (response, status, data) => send(response, status, 'application/json; charset=utf-8', JSON.stringify(data))

async function readRequest(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length
    if (length > bodyLimit) {
      request.resume()
      throw new Error('Choose a file no larger than 4 MB.')
    }
    chunks.push(chunk)
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Send a valid request.')
  return result
}

async function api(path, request, response) {
  if (!['/api/chat', '/api/extract'].includes(path)) return json(response, 404, { error: 'Endpoint unavailable in local mode.' })
  if (request.method !== 'POST') return json(response, 405, { error: 'Use POST for this endpoint.' })
  const origin = request.headers.origin
  if (origin && !['https://', 'http://'].some(scheme => origin === scheme + request.headers.host)) {
    return json(response, 403, { error: 'Open the app at its own address.' })
  }
  let body
  let attachment
  try {
    body = await readRequest(request)
    attachment = await readAttachment(body.attachment)
  } catch (error) {
    return json(response, 400, { error: error instanceof SyntaxError ? 'Send a valid JSON request.' : error.message })
  }
  if (path === '/api/extract') {
    if (!attachment) return json(response, 400, { error: 'Choose a file to review.' })
    return json(response, 200, { courses: extractCourses(attachment) })
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question || question.length > 2000) return json(response, 400, { error: 'Enter a question under 2,000 characters.' })
  const previous = Array.isArray(body.history) ? body.history.slice(-6).findLast(item => item?.role === 'user' && typeof item.content === 'string') : null
  const progress = creditProgress(body.creditSummary)
  const overview = isCreditOverview(question) && !attachment
  const result = overview
    ? { sources: progress ? [progress.source] : [], text: progress?.overview || 'Select “Include credit calculator totals” or use “Ask about my credits” in the Credit Calculator.' }
    : searchSources(question, previous?.content.slice(0, 2000), attachment)
  const { sources, evidence, text } = result
  if (progress && !overview && ragMode && evidence) {
    sources.push(progress.source)
    evidence.push(progress.source.text)
  }
  const citations = sources.map(({ title, location, url, note }, index) => ({ number: index + 1, title, location, url, note }))
  let answer = text
  let mode = overview ? 'calculator' : evidence ? 'search' : 'timetable'
  if (ragMode && evidence?.some(Boolean)) {
    const cancellation = new AbortController()
    response.once('close', () => cancellation.abort())
    try {
      const generated = await generateAnswer(question, sources, evidence, cancellation.signal)
      if (generated) {
        answer = generated
        mode = 'local-model'
      } else {
        answer = 'The local model did not return a usable cited answer. Showing source excerpts instead.\n\n' + text
      }
    } catch (error) {
      if (response.destroyed) return
      console.warn('Local model unavailable:', error.message)
      answer = 'The local model is unavailable. Showing source excerpts instead.\n\n' + text
    }
  }
  const events = [{ type: 'sources', sources: citations, mode }, { type: 'text', text: answer }, { type: 'done' }]
  send(response, 200, 'application/x-ndjson; charset=utf-8', events.map(event => JSON.stringify(event) + '\n').join(''))
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    if (pathname.startsWith('/api/')) return await api(pathname, request, response)
    if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'Method unavailable.' })
    const filename = resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname))
    const type = mediaTypes.get(extname(filename))
    if (!filename.startsWith(resolve(publicDir) + sep) || !type || pathname === '/identity.js') return json(response, 404, { error: 'Page unavailable.' })
    const contents = await readFile(filename)
    const body = filename === resolve(publicDir, 'index.html') ? contents.toString('utf8').replace('<html lang="en">', ragMode ? '<html lang="en" data-local data-local-rag>' : '<html lang="en" data-local>') : contents
    send(response, 200, type, request.method === 'HEAD' ? undefined : body)
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) || error instanceof URIError) {
      return json(response, 404, { error: 'Page unavailable.' })
    }
    console.error('Local request failed:', error.message)
    if (!response.headersSent) json(response, 500, { error: 'The local server could not complete the request.' })
  }
})

server.listen(port, host, () => {
  console.log('EE Academic Assistant running at http://' + host + ':' + server.address().port + (ragMode ? ' (local model enabled)' : ''))
})
