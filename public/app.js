import { progressQuestion } from './credit-context.js'
import { setupCourseBrowser } from './course-browser.js'
import { setupCalculator } from './calculator.js'
import { encodeFile } from './files.js'

const form = document.querySelector('#chatForm')
const shareCreditTotals = document.querySelector('#shareCreditTotals')
const input = document.querySelector('#question')
const conversation = document.querySelector('#conversation')
const welcome = document.querySelector('#welcome')
const sendButton = document.querySelector('#sendButton')
let history = []
let busy = false
let activeRequest = null
let attachment = null
let readingFile = false
let fileSelection = 0
let answerNumber = 0
const chatScroll = document.querySelector('#chatScroll')
const chatFile = document.querySelector('#chatFile')
const attachmentLabel = document.querySelector('#chatAttachment')
let followChat = true
chatScroll.addEventListener('scroll', () => { followChat = chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 90 })
function scrollChat(force = false) { if (force || followChat) chatScroll.scrollTop = chatScroll.scrollHeight }

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function formatAnswer(value, sources) {
  let text = escapeHtml(value)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\[(\d+)\]/g, (match, number) => {
    const source = sources.find(item => item.number === Number(number))
    return source ? `<span class="citation">[${number}]</span>` : match
  })
  return text.split('\n').map(line => {
    if (/^###?\s/.test(line)) return `<strong class="answer-heading">${line.replace(/^###?\s/, '')}</strong>`
    if (/^[-*]\s/.test(line)) return `<span class="answer-bullet">${line.replace(/^[-*]\s/, '')}</span>`
    return line || '<span class="answer-space"></span>'
  }).join('<br>')
}

function addMessage(role, content = '') {
  const item = document.createElement('article')
  item.className = `message ${role}`
  const mark = document.createElement('div')
  mark.className = 'message-mark'
  mark.textContent = role === 'user' ? 'YOU' : '✳'
  const body = document.createElement('div')
  body.className = 'message-body'
  const label = document.createElement('div')
  label.className = 'message-label'
  label.textContent = role === 'user' ? 'YOU' : 'EE ACADEMIC ASSISTANT'
  const text = document.createElement('div')
  text.className = 'message-text'
  text.textContent = content
  body.append(label, text)
  item.append(mark, body)
  conversation.append(item)
  return { item, body, text }
}

function addSources(number, sources) {
  if (!sources.length) return
  const container = document.querySelector('#sourceHistory')
  if (!container.querySelector('.source-group')) container.replaceChildren()
  const list = document.createElement('section')
  list.className = 'source-group'
  const heading = document.createElement('h3')
  heading.textContent = `Answer ${number}`
  list.append(heading)
  for (const source of sources) {
    const item = document.createElement(source.url ? 'a' : 'span')
    if (source.url) { item.href = source.url; item.target = '_blank'; item.rel = 'noreferrer' }
    item.textContent = `[${source.number}] ${source.title} · ${source.location} · ${source.note || ''}${source.url ? ' ↗' : ''}`
    list.append(item)
  }
  container.append(list)
}

async function ask(question, { includeAttachment = true } = {}) {
  question = question.trim()
  if (!question || busy || readingFile) return
  busy = true
  sendButton.disabled = true
  welcome.hidden = true
  conversation.classList.add('visible')
  addMessage('user', question)
  const reply = addMessage('assistant', 'Looking through the source library…')
  const number = ++answerNumber
  reply.item.querySelector('.message-label').textContent = `EE ACADEMIC ASSISTANT · ANSWER ${number}`
  followChat = true
  scrollChat(true)
  reply.text.classList.add('thinking')
  input.value = ''
  input.style.height = ''
  let answer = ''
  let sources = []
  let complete = false
  const request = new AbortController()
  activeRequest = request
  const timeout = AbortSignal.timeout(60000)
  try {
    const creditSummary = shareCreditTotals.checked ? getCreditSnapshot() : undefined
    const chatHistory = history.filter(message => creditSummary || !message.sharedCredits)
      .map(({ role, content }) => ({ role, content }))
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, history: chatHistory, attachment: includeAttachment ? attachment : null, creditSummary }), signal: AbortSignal.any([request.signal, timeout]) })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Unable to reach the assistant. Please try again.') }
    if (!response.body) throw new Error('Unable to reach the assistant. Please try again.')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line) continue
        const event = JSON.parse(line)
        if (event.type === 'sources') {
          sources = event.sources
          const modes = { search: 'SOURCE SEARCH', timetable: 'TIMETABLE LOOKUP', calculator: 'CREDIT CALCULATOR', 'local-model': 'LOCAL AI' }
          if (Object.hasOwn(modes, event.mode)) reply.item.querySelector('.message-label').textContent += ' · ' + modes[event.mode]
        }
        if (event.type === 'text') {
          answer += event.text
          reply.text.classList.remove('thinking')
          reply.text.innerHTML = formatAnswer(answer, sources)
          scrollChat()
        }
        if (event.type === 'error') throw new Error(event.error)
        if (event.type === 'done') complete = true
      }
      if (done) break
    }
    if (!complete || !answer) throw new Error('The answer was interrupted. Please try again.')
    addSources(number, sources)
    history.push({ role: 'user', content: question, sharedCredits: Boolean(creditSummary) }, { role: 'assistant', content: answer, sharedCredits: Boolean(creditSummary) })
  } catch (error) {
    if (request.signal.aborted) return
    reply.text.classList.remove('thinking')
    reply.text.textContent = timeout.aborted ? 'The request took too long. Try again with a smaller file.' : error.message || 'Something went wrong. Please try again.'
    reply.text.classList.add('error')
  } finally {
    if (activeRequest === request) {
      activeRequest = null
      busy = false
      sendButton.disabled = readingFile
      input.focus()
    }
  }
}

form.addEventListener('submit', event => { event.preventDefault(); ask(input.value) })
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit() }
})
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 150)}px` })
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => ask(button.dataset.prompt)))
document.querySelector('#newChat').addEventListener('click', () => {
  fileSelection++
  readingFile = false
  if (activeRequest) activeRequest.abort()
  activeRequest = null
  busy = false
  sendButton.disabled = readingFile
  history = []
  shareCreditTotals.checked = false
  answerNumber = 0
  attachment = null
  chatFile.value = ''
  attachmentLabel.hidden = true
  document.querySelector('#sourceHistory').innerHTML = '<p>No answers yet.</p>'
  conversation.replaceChildren()
  conversation.classList.remove('visible')
  welcome.hidden = false
  input.value = ''
  document.body.classList.remove('menu-open')
  input.focus()
  setView('chat')
})
document.querySelector('#menuButton').addEventListener('click', event => { const open = document.body.classList.toggle('menu-open'); event.currentTarget.setAttribute('aria-expanded', String(open)) })

chatFile.addEventListener('change', async () => {
  const file = chatFile.files[0]
  if (!file) return
  const selection = ++fileSelection
  attachment = null
  readingFile = true
  sendButton.disabled = true
  attachmentLabel.textContent = 'Reading ' + file.name + '…'
  attachmentLabel.hidden = false
  try {
    const encoded = await encodeFile(file)
    if (selection !== fileSelection) return
    attachment = encoded
    attachmentLabel.replaceChildren(document.createTextNode(`Attached: ${attachment.name} `))
    const clear = document.createElement('button')
    clear.type = 'button'; clear.textContent = 'Remove'; clear.addEventListener('click', () => { attachment = null; chatFile.value = ''; attachmentLabel.hidden = true })
    attachmentLabel.append(clear); attachmentLabel.hidden = false
  } catch (error) {
    if (selection !== fileSelection) return
    chatFile.value = ''
    attachmentLabel.textContent = error.message
  } finally {
    if (selection === fileSelection) {
      readingFile = false
      sendButton.disabled = busy
    }
  }
})

function setView(view) {
  for (const name of ['chat', 'calculator', 'courses', 'resources']) document.querySelector(`#${name}View`).hidden = name !== view
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); button.classList.toggle('nav-active', active && button.classList.contains('workspace-link')); button.setAttribute('aria-current', active ? 'page' : 'false') })
  document.querySelector('#viewTitle').textContent = { chat: 'ACADEMIC ASSISTANT', calculator: 'CREDIT CALCULATOR', courses: 'COURSES & INSTRUCTORS', resources: 'SOURCES & LINKS' }[view]
  document.body.classList.remove('menu-open')
  document.querySelector('#menuButton').setAttribute('aria-expanded', 'false')
  if (view === 'chat') scrollChat()
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)))
const local = document.documentElement.hasAttribute('data-local')
if (local) {
  document.querySelector('#accountButton').hidden = true
  chatFile.accept = '.pdf,.txt,.md,.csv'
  chatFile.closest('label').title = 'Attach a text PDF, CSV, TXT, or Markdown file'
  chatFile.closest('label').querySelector('.sr-only').textContent = chatFile.closest('label').title
  document.querySelector('.disclaimer').textContent = document.documentElement.hasAttribute('data-local-rag')
    ? 'Uses a local AI model for source-based answers. Check citations before making academic decisions.'
    : 'Searches the local source library. Attach a text document to find matching lines.'
}
setupCourseBrowser()
const getCreditSnapshot = setupCalculator({ local })
document.querySelector('#askCreditProgress').addEventListener('click', () => {
  setView('chat')
  shareCreditTotals.checked = true
  input.value = progressQuestion
  ask(progressQuestion, { includeAttachment: false })
})
