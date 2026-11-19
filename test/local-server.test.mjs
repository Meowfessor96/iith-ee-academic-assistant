import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'

test('local generation, timetable, fallback and document import', { timeout: 15000 }, async t => {
  let requests = 0
  let badCitation = false
  const model = createServer(async (request, response) => {
    requests++
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks))
    assert.equal(request.url, '/v1/chat/completions')
    assert.equal(body.model, 'ee-assistant')
    const sources = JSON.parse(body.messages[1].content).sources
    const quote = 'Branch Change option is discontinued from the Academic Year 2021 - 22.'
    const source = sources.find(source => source.excerpt.includes(quote))
    assert.ok(source)
    const content = JSON.stringify({ answer: [{ claim: 'The branch change option was discontinued starting in academic year 2021–22.', quote, source: badCitation ? 99 : source.number }] })
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
  model.listen(0, '127.0.0.1')
  await once(model, 'listening')
  t.after(() => model.close())

  const child = spawn(process.execPath, ['scripts/local-server.mjs', '--rag'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', LLAMA_SERVER_PORT: String(model.address().port) },
    stdio: ['ignore', 'pipe', 'inherit']
  })
  t.after(() => child.kill())
  const address = await new Promise((resolve, reject) => {
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk.toString()
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match) resolve(match[0])
    })
    child.once('error', reject)
    child.once('exit', code => reject(new Error('Server exited with status ' + code)))
  })
  async function post(path, body) {
    const response = await fetch(address + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    assert.equal(response.status, 200)
    return response
  }
  async function chat(question) {
    const response = await post('/api/chat', { question })
    return (await response.text()).trim().split('\n').map(line => JSON.parse(line))
  }

  const question = 'Has IIT Hyderabad discontinued the branch change option?'
  const [generated, answer] = await chat(question)
  assert.equal(generated.mode, 'local-model')
  assert.match(answer.text, /2021–22\. \[\d+]/)
  const [coursework, requirements] = await chat('What are the coursework requirements for an EE PhD student?')
  assert.equal(coursework.mode, 'search')
  assert.match(requirements.text, /M\.Tech.*12 credits/)
  assert.match(requirements.text, /Direct PhD.*24 credits/)

  const [timetable, exact] = await chat('Who teaches EE2104?')
  assert.equal(timetable.mode, 'timetable')
  assert.match(exact.text, /Oves Badami \/ Shubhadeep Bhattacharjee/)
  assert.equal(requests, 1)

  badCitation = true
  const [fallback, excerpts] = await chat(question)
  assert.equal(fallback.mode, 'search')
  assert.match(excerpts.text, /Showing source excerpts/)
  assert.doesNotMatch(excerpts.text, /\[99]/)

  const csv = Buffer.from('Code,Course Name,Credits\nEE1101,Circuits and Network Analysis,3').toString('base64')
  const extraction = await post('/api/extract', { attachment: { name: 'courses.csv', data: csv } })
  assert.deepEqual((await extraction.json()).courses, [{ code: 'EE1101', name: 'Circuits and Network Analysis', credits: 3 }])
})
