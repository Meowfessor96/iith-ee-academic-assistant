import { encodeFile } from './files.js'
import { baskets, categories, courseCategories, detailDefaults, basketDefaults, freshPlan, normalizePlan, calculatePlan, suggestCourse, creditNumber as number } from './credit-model.js'

const storageKey = 'ee-academic-calculator-guest-v1'
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const options = selected => `<option value="">Choose category</option>${courseCategories.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${item.label}</option>`).join('')}`
const basketOptions = selected => `<option value="">Choose basket</option>${baskets.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${item.label}</option>`).join('')}`
const kindOptions = selected => `<option value="">Choose type</option><option value="theory" ${selected === 'theory' ? 'selected' : ''}>Theory</option><option value="lab" ${selected === 'lab' ? 'selected' : ''}>Lab</option>`

export function setupCalculator({ local = false } = {}) {
  const categoryContainer = document.querySelector('#creditCategories')
  const departmentContainer = document.querySelector('#departmentDetails')
  const basketContainer = document.querySelector('#basketDetails')
  const courseList = document.querySelector('#courseList')
  const status = document.querySelector('#saveStatus')
  const dialog = document.querySelector('#accountDialog')
  const authMessage = document.querySelector('#authMessage')
  let plan
  let identity
  let user = null
  let recovery = false
  let saveTimer
  let saveChain = Promise.resolve()
  let pendingImport = []
  let newCourseModified = false
  try { plan = JSON.parse(localStorage.getItem(storageKey)) || freshPlan() } catch { plan = freshPlan() }
  plan = normalizePlan(plan)

  function recalculate() {
    const progress = calculatePlan(plan)
    for (const category of categories) {
      const completed = progress.totals[category.id]
      const target = number(plan.targets[category.id])
      const row = categoryContainer.querySelector(`[data-category="${category.id}"]`)
      if (row) { row.querySelector('.category-progress').textContent = `${completed} / ${target} credits`; row.querySelector('.progress-fill').style.width = `${target ? Math.min(100, completed / target * 100) : 0}%` }
    }
    departmentContainer.querySelectorAll('[data-detail-progress]').forEach(item => { const key = item.dataset.detailProgress; item.textContent = `${progress.detail[key]} / ${number(plan.detailTargets[key])} credits` })
    basketContainer.querySelectorAll('[data-basket-progress]').forEach(item => { const key = item.dataset.basketProgress; item.textContent = `${progress.basketTotals[key]} / ${number(plan.basketTargets[key])}` })
    const unbasketed = Math.max(0, progress.detail.stream_theory + progress.detail.stream_lab - Object.values(progress.basketTotals).reduce((sum, credits) => sum + credits, 0))
    document.querySelector('#departmentUnallocated').textContent = `${progress.detail.unallocated + progress.detail.stream_unspecified} credits need a departmental type or theory/lab selection. ${unbasketed} stream credits need a basket.`
    document.querySelector('#totalProgress').textContent = `${progress.completed} / ${progress.target} credits`
  }

  function renderCategories() {
    document.querySelector('#preset').value = plan.preset === '2020' ? '2020' : 'custom'
    categoryContainer.innerHTML = categories.map(category => `<div class="credit-row" data-category="${category.id}"><div class="category-title"><strong>${category.label}</strong><span class="category-progress"></span></div><div class="credit-fields"><label>${category.id === 'department' ? 'Unallocated manual credits' : 'Manual completed'}<input type="number" min="0" max="1000" step="0.5" value="${number(plan.manual[category.id])}" data-manual="${category.id}"></label><label>Target<input type="number" min="0" max="1000" step="0.5" value="${number(plan.targets[category.id])}" data-target="${category.id}"></label></div><div class="progress-track"><div class="progress-fill"></div></div></div>`).join('')
    const details = [ ['core_theory', 'Department core · theory', 'core_theory'], ['core_lab', 'Department core · lab', 'core_lab'], ['stream_theory', 'Stream core · theory', 'stream_unassigned_theory'], ['stream_lab', 'Stream core · lab', 'stream_unassigned_lab'], ['elective', 'Department electives', 'elective'] ]
    departmentContainer.innerHTML = details.map(([key, label, manualKey]) => `<div class="detail-card"><div class="category-title"><strong>${label}</strong><span data-detail-progress="${key}"></span></div><div class="credit-fields"><label>${key.startsWith('stream_') ? 'Manual, no basket selected' : 'Manual completed'}<input type="number" min="0" max="1000" step="0.5" value="${number(plan.manual[manualKey])}" data-manual="${manualKey}"></label><label>Target<input type="number" min="0" max="1000" step="0.5" value="${number(plan.detailTargets[key])}" data-detail-target="${key}"></label></div></div>`).join('') + '<p class="detail-warning" id="departmentUnallocated"></p>'
    basketContainer.innerHTML = baskets.map(basket => `<section class="basket-card"><h4>${basket.label}</h4>${['theory', 'lab'].map(kind => { const key = `${basket.id}_${kind}`; return `<div class="basket-kind"><div class="category-title"><strong>${kind === 'lab' ? 'Lab' : 'Theory'}</strong><span data-basket-progress="${key}"></span></div><div class="credit-fields"><label>Manual credits<input type="number" min="0" max="1000" step="0.5" value="${number(plan.manual[`basket_${key}`])}" data-manual="basket_${key}"></label><label>Minimum<input type="number" min="0" max="1000" step="0.5" value="${number(plan.basketTargets[key])}" data-basket-target="${key}"></label></div></div>` }).join('')}</section>`).join('')
    recalculate()
  }

  function renderCourses() {
    courseList.innerHTML = plan.courses.length ? plan.courses.map((course, index) => `<div class="course-row classified-course"><div class="course-identity"><strong>${escape(course.code || 'Course')} · ${escape(course.name || 'Untitled')}</strong><small>${number(course.credits)} credits</small>${course.suggestion ? `<small class="classification-note">${escape(course.suggestion)}</small>` : ''}</div><div class="course-classification"><label>Category<select data-course-category="${index}">${options(course.category)}</select></label>${course.category === 'stream_core' ? `<label>Stream basket<select data-course-basket="${index}">${basketOptions(course.basket)}</select></label>` : ''}${['stream_core', 'department_core'].includes(course.category) ? `<label>Course type<select data-course-kind="${index}">${kindOptions(course.kind)}</select></label>` : ''}</div><button type="button" class="text-button remove-course" data-remove="${index}">Remove</button></div>`).join('') : '<p class="empty-courses">No courses added yet. Start with a course or enter category totals above.</p>'
    recalculate()
  }

  function render() { renderCategories(); renderCourses() }
  function save() {
    if (!user) {
      try { localStorage.setItem(storageKey, JSON.stringify(plan)); status.textContent = 'Guest · saved on this device' } catch { status.textContent = 'Could not save on this device' }
      return
    }
    status.textContent = 'Saving to your account…'
    clearTimeout(saveTimer)
    const snapshot = JSON.stringify({ data: plan })
    saveTimer = setTimeout(() => {
      saveChain = saveChain.catch(() => {}).then(async () => {
        const response = await fetch('/api/plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: snapshot })
        if (!response.ok) throw new Error('Save failed')
        status.textContent = 'Saved to your account'
      }).catch(() => { status.textContent = 'Could not save to your account. Please retry.' })
    }, 650)
  }

  function updateCreditInput(event) {
    const manual = event.target.dataset.manual
    const target = event.target.dataset.target
    const detailTarget = event.target.dataset.detailTarget
    const basketTarget = event.target.dataset.basketTarget
    if (manual) plan.manual[manual] = number(event.target.value)
    if (target) { plan.targets[target] = number(event.target.value); plan.preset = 'custom'; document.querySelector('#preset').value = 'custom' }
    if (detailTarget) { plan.detailTargets[detailTarget] = number(event.target.value); plan.preset = 'custom'; document.querySelector('#preset').value = 'custom' }
    if (basketTarget) { plan.basketTargets[basketTarget] = number(event.target.value); plan.preset = 'custom'; document.querySelector('#preset').value = 'custom' }
    recalculate(); save()
  }
  for (const container of [categoryContainer, departmentContainer, basketContainer]) container.addEventListener('input', updateCreditInput)
  document.querySelector('#preset').addEventListener('change', event => {
    plan.preset = event.target.value
    if (plan.preset === '2020') { plan.targets = Object.fromEntries(categories.map(item => [item.id, item.target])); plan.detailTargets = { ...detailDefaults }; plan.basketTargets = { ...basketDefaults } }
    renderCategories(); save()
  })
  const courseForm = document.querySelector('#courseForm')
  const newCategory = document.querySelector('#courseCategory')
  const newBasket = document.querySelector('#newCourseBasket')
  const newKind = document.querySelector('#newCourseKind')
  newCategory.innerHTML = options('')
  newBasket.innerHTML = basketOptions('')
  function showNewCourseFields() {
    const stream = newCategory.value === 'stream_core'
    const departmentalCore = newCategory.value === 'department_core'
    document.querySelector('#newCourseBasketWrap').hidden = !stream
    document.querySelector('#newCourseKindWrap').hidden = !stream && !departmentalCore
    newBasket.required = stream
    newKind.required = stream || departmentalCore
  }
  function updateCourseSuggestion() {
    const code = courseForm.elements.namedItem('code').value
    const name = courseForm.elements.namedItem('name').value
    const suggestion = suggestCourse(code, name)
    document.querySelector('#courseSuggestion').textContent = code.trim() || name.trim() ? suggestion.suggestion : 'Enter a course code for a suggested classification.'
    if (!newCourseModified) { newCategory.value = suggestion.category; newBasket.value = suggestion.basket; newKind.value = suggestion.kind; showNewCourseFields() }
  }
  courseForm.elements.namedItem('code').addEventListener('input', updateCourseSuggestion)
  courseForm.elements.namedItem('name').addEventListener('input', updateCourseSuggestion)
  newCategory.addEventListener('change', () => { newCourseModified = true; showNewCourseFields() })
  for (const field of [newBasket, newKind]) field.addEventListener('change', () => { newCourseModified = true })
  courseForm.addEventListener('submit', event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (!data.get('code').trim() && !data.get('name').trim()) { document.querySelector('#importMessage').textContent = 'Enter a course code or name.'; return }
    const suggestion = suggestCourse(data.get('code'), data.get('name'))
    plan.courses.push({ code: data.get('code').trim(), name: data.get('name').trim(), credits: number(data.get('credits')), category: data.get('category'), basket: data.get('basket') || '', kind: data.get('kind') || '', suggestion: suggestion.suggestion })
    event.currentTarget.reset(); newCourseModified = false; showNewCourseFields(); document.querySelector('#courseSuggestion').textContent = 'Enter a course code for a suggested classification.'; renderCourses(); save()
  })
  courseList.addEventListener('click', event => {
    if (event.target.dataset.remove === undefined) return
    plan.courses.splice(Number(event.target.dataset.remove), 1); renderCourses(); save()
  })
  courseList.addEventListener('change', event => {
    const field = event.target.dataset.courseCategory !== undefined ? 'category' : event.target.dataset.courseBasket !== undefined ? 'basket' : event.target.dataset.courseKind !== undefined ? 'kind' : ''
    if (!field) return
    const index = Number(event.target.dataset[`course${field[0].toUpperCase()}${field.slice(1)}`])
    plan.courses[index][field] = event.target.value
    if (field === 'category') renderCourses(); else recalculate()
    save()
  })

  function renderImport() {
    document.querySelector('#importReview').innerHTML = `<div class="review-heading"><strong>Review ${pendingImport.length} extracted courses</strong><button type="button" class="primary-button" id="confirmImport">Add selected</button></div>${pendingImport.map((course, index) => `<div class="review-course"><label class="review-course-title"><input type="checkbox" data-import="${index}" ${course.selected ? 'checked' : ''}><span>${escape(course.code)} · ${escape(course.name)} <small>${number(course.credits)} credits</small></span></label><div class="course-classification"><label>Category<select data-import-category="${index}">${options(course.category)}</select></label>${course.category === 'stream_core' ? `<label>Stream basket<select data-import-basket="${index}">${basketOptions(course.basket)}</select></label>` : ''}${['stream_core', 'department_core'].includes(course.category) ? `<label>Course type<select data-import-kind="${index}">${kindOptions(course.kind)}</select></label>` : ''}</div><small class="classification-note">${escape(course.suggestion)}</small></div>`).join('')}`
  }
  const calculatorFile = document.querySelector('#calculatorFile')
  const importMessage = document.querySelector('#importMessage')
  if (local) {
    calculatorFile.accept = '.pdf,.txt,.md,.csv'
    importMessage.textContent = 'Text PDF, CSV, TXT, or Markdown · up to 4 MB · extracted on this computer.'
  }
  calculatorFile.addEventListener('change', async () => {
    const file = calculatorFile.files[0]
    if (!file) return
    const review = document.querySelector('#importReview')
    review.hidden = true
    pendingImport = []
    calculatorFile.disabled = true
    importMessage.textContent = 'Reading ' + file.name + '…'
    importMessage.scrollIntoView({ block: 'nearest' })
    const timeout = AbortSignal.timeout(60000)
    try {
      const attachment = await encodeFile(file)
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachment }),
        signal: timeout
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(data?.courses)) {
        throw new Error(data?.error || 'The document reader returned an invalid response. Please try again.')
      }
      pendingImport = data.courses.map(course => {
        const suggestion = suggestCourse(course.code, course.name)
        const duplicate = course.code && plan.courses.some(existing => String(existing.code || '').replace(/\s+/g, '').toUpperCase() === String(course.code).replace(/\s+/g, '').toUpperCase())
        return { ...course, ...suggestion, suggestion: suggestion.suggestion + (duplicate ? ' This code is already in your course list; avoid double counting.' : ''), selected: false }
      })
      if (!pendingImport.length) {
        importMessage.textContent = local
          ? 'No course rows with explicit credits were found. Use a CSV with Code, Course Name, and Credits columns, or add the courses manually.'
          : 'No courses with clearly stated credits were found. Add them manually.'
        return
      }
      importMessage.textContent = 'Select completed courses after reviewing their credits and categories.'
      renderImport()
      review.hidden = false
    } catch (error) {
      importMessage.textContent = timeout.aborted ? 'Document reading took too long. Try a smaller file.' : error.message
      review.hidden = true
    } finally {
      calculatorFile.disabled = false
      calculatorFile.value = ''
    }
  })
  document.querySelector('#importReview').addEventListener('click', event => {
    if (event.target.id !== 'confirmImport') return
    for (const course of pendingImport.filter(item => item.selected)) { const { selected, ...entry } = course; plan.courses.push(entry) }
    pendingImport = []; document.querySelector('#importReview').hidden = true
    document.querySelector('#importMessage').textContent = 'Imported courses can be reclassified below. Verify suggested categories, basket, lab status, and eligibility.'
    renderCourses(); save()
  })
  document.querySelector('#importReview').addEventListener('change', event => {
    if (event.target.dataset.import !== undefined) { pendingImport[Number(event.target.dataset.import)].selected = event.target.checked; return }
    const field = event.target.dataset.importCategory !== undefined ? 'category' : event.target.dataset.importBasket !== undefined ? 'basket' : event.target.dataset.importKind !== undefined ? 'kind' : ''
    if (!field) return
    const index = Number(event.target.dataset[`import${field[0].toUpperCase()}${field.slice(1)}`])
    pendingImport[index][field] = event.target.value
    if (field === 'category') renderImport()
  })

  async function loadAccount(account) {
    const response = await fetch('/api/plan', { cache: 'no-store' })
    if (!response.ok) throw new Error('Unable to load account progress. Your guest data is unchanged.')
    const result = await response.json()
    setUser(account)
    if (result.data?.targets && result.data?.manual && Array.isArray(result.data.courses)) { plan = normalizePlan(result.data); status.textContent = 'Saved to your account'; render() }
    else save()
  }
  function setUser(next) {
    user = next
    document.querySelector('#accountButton').textContent = user ? 'Account' : 'Sign in'
    document.querySelector('#authForm').hidden = !!user && !recovery
    document.querySelector('#signedIn').hidden = !user || recovery
    document.querySelector('#accountInfo').textContent = user ? `Signed in as ${user.email}.` : ''
  }
  async function getIdentity() { if (!identity) identity = await import('/identity.js'); return identity }
  document.querySelector('#accountButton').addEventListener('click', () => dialog.showModal())
  document.querySelector('#authForm').addEventListener('submit', async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); authMessage.textContent = 'Please wait…'
    try {
      const auth = await getIdentity()
      if (recovery) { await auth.updateUser({ password: data.get('password') }); recovery = false; await loadAccount(await auth.getUser()); authMessage.textContent = 'Password updated.'; return }
      const signedIn = await auth.login(data.get('email'), data.get('password')); await loadAccount(signedIn); authMessage.textContent = ''; dialog.close()
    } catch (error) { authMessage.textContent = error.message || 'Unable to sign in.' }
  })
  document.querySelector('#signupButton').addEventListener('click', async () => {
    const form = document.querySelector('#authForm')
    if (!form.reportValidity()) return
    const data = new FormData(form); authMessage.textContent = 'Creating account…'
    try { const auth = await getIdentity(); await auth.signup(data.get('email'), data.get('password')); const current = await auth.getUser(); if (current) { await loadAccount(current); dialog.close() } else authMessage.textContent = 'Check your email to confirm your account.' } catch (error) { authMessage.textContent = error.message || 'Unable to create an account.' }
  })
  document.querySelector('#recoveryButton').addEventListener('click', async () => {
    const email = document.querySelector('#authForm [name="email"]')
    if (!email.reportValidity()) return
    try { const auth = await getIdentity(); await auth.requestPasswordRecovery(email.value); authMessage.textContent = 'Check your email for a password reset link.' } catch (error) { authMessage.textContent = error.message || 'Unable to send a reset link.' }
  })
  document.querySelector('#logoutButton').addEventListener('click', async () => {
    clearTimeout(saveTimer); await saveChain.catch(() => {})
    try {
      const response = await fetch('/api/plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: plan }) })
      if (!response.ok) throw new Error('Save failed')
    } catch { document.querySelector('#accountInfo').textContent = 'Could not save your latest changes. Please retry before signing out.'; return }
    try { await (await getIdentity()).logout() } catch { authMessage.textContent = 'Unable to sign out.'; return }
    setUser(null); try { plan = normalizePlan(JSON.parse(localStorage.getItem(storageKey)) || freshPlan()) } catch { plan = freshPlan() }
    render(); status.textContent = 'Guest · saved on this device'; dialog.close()
  })
  render()
  if (local) { status.textContent = 'Saved on this device'; return }
  getIdentity().then(async auth => {
    const callback = await auth.handleAuthCallback()
    if (callback?.type === 'recovery') { recovery = true; setUser(null); document.querySelector('#authForm [name="email"]').value = callback.user?.email || ''; authMessage.textContent = 'Enter your new password and select Sign in.'; dialog.showModal(); return }
    const current = await auth.getUser()
    if (current) await loadAccount(current)
  }).catch(() => { status.textContent = 'Guest · account service unavailable' })
}
