import { baskets, calculatePlan, categories, creditNumber } from './credit-model.js'

export const progressQuestion = 'How many credits have I completed and how many remain in my credit calculator?'

const detailFields = [
  ['core_theory', 'Department core theory'],
  ['core_lab', 'Department core lab'],
  ['stream_theory', 'Stream core theory'],
  ['stream_lab', 'Stream core lab'],
  ['elective', 'Department electives']
]
const basketFields = baskets.flatMap(({ id, label }) => ['theory', 'lab'].map(kind => [
  id + '_' + kind, label + ' ' + kind
]))

export function snapshotCredits(plan) {
  const current = calculatePlan(plan)
  const metrics = {}
  for (const { id } of categories) metrics[id] = [current.totals[id], creditNumber(plan.targets[id])]
  for (const [id] of detailFields) metrics[id] = [current.detail[id], creditNumber(plan.detailTargets[id])]
  for (const [id] of basketFields) metrics[id] = [current.basketTotals[id], creditNumber(plan.basketTargets[id])]
  return { preset: plan.preset === '2020' ? '2020' : 'custom', metrics }
}

function validPair(pair) {
  return Array.isArray(pair) && pair.length === 2 &&
    pair.every(value => Number.isFinite(value) && value >= 0 && value <= 100000)
}

const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
function remaining(done, goal) { return Math.max(0, goal - done) }

export function creditProgress(snapshot) {
  if (!['2020', 'custom'].includes(snapshot?.preset) || !snapshot.metrics) return null
  const groups = [
    categories.map(({ id, label }) => [id, label]),
    detailFields,
    basketFields
  ]
  const metrics = snapshot.metrics
  if (!groups.flat().every(([id]) => validPair(metrics[id]))) return null

  const done = categories.reduce((total, { id }) => total + metrics[id][0], 0)
  const goal = categories.reduce((total, { id }) => total + metrics[id][1], 0)
  const basis = snapshot.preset === '2020' ? '2020 EE reference with the calculator’s LA/CA grouping' : 'custom targets'
  const total = format.format(done) + ' of ' + format.format(goal) + ' credits completed. ' + format.format(remaining(done, goal)) + ' credits left against the total target.'
  const lines = groups.map(group => group.map(([id, label]) => {
    const [completed, target] = metrics[id]
    return label + ': ' + format.format(completed) + ' of ' + format.format(target) +
      ' credits, ' + format.format(remaining(completed, target)) + ' left.'
  }))
  const note = 'Student-entered totals and targets. Department details and stream baskets are subdivisions, not additional credits. The calculator does not determine graduation eligibility.'
  return {
    source: {
      title: 'Your credit calculator',
      url: '',
      location: basis,
      note,
      text: [total, 'Category targets', ...lines[0], 'Department breakdown', ...lines[1], 'Basket targets', ...lines[2]].join('\n')
    },
    overview: '### Your credit progress [1]\n\n' + total + ' [1]\n\n' +
      lines[0].map(line => '- ' + line + ' [1]').join('\n') + '\n\n' +
      'Overall remaining credits and category shortfalls can differ when a category exceeds its target. These are calculator figures. [1]'
  }
}

export function isCreditOverview(question) {
  return question === progressQuestion ||
    /\b(?:my (?:credit|calculator) (?:progress|totals?)|how many credits (?:have i completed|do i have|do i have left|do i still need))\b/i.test(question)
}
