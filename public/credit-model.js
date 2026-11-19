export const baskets = [
  { id: 'micro', label: 'Microelectronics & VLSI' },
  { id: 'power', label: 'Power Electronics & Power Systems' },
  { id: 'communications', label: 'Communications & Signal Processing' }
]

export const categories = [
  { id: 'science', label: 'Basic sciences', target: 14 },
  { id: 'engineering', label: 'Basic engineering skills', target: 14 },
  { id: 'department', label: 'Departmental courses', target: 76 },
  { id: 'free', label: 'Free electives', target: 11 },
  { id: 'liberal', label: 'LA / CA including soft skills', target: 13 }
]

export const courseCategories = [
  { id: 'science', label: 'Basic sciences' },
  { id: 'engineering', label: 'Basic engineering skills' },
  { id: 'department_core', label: 'Departmental core' },
  { id: 'stream_core', label: 'Stream core' },
  { id: 'department_elective', label: 'Departmental elective' },
  { id: 'department_unallocated', label: 'Departmental — not yet classified' },
  { id: 'free', label: 'Free elective' },
  { id: 'liberal', label: 'LA / CA / soft skills' }
]

export const detailDefaults = { core_theory: 27, core_lab: 2, stream_theory: 24, stream_lab: 8, elective: 15 }
export const basketDefaults = Object.fromEntries(baskets.flatMap(basket => [[`${basket.id}_theory`, 6], [`${basket.id}_lab`, 2]]))
export const creditNumber = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1000, Number(value))) : 0

const knownCourses = {}
function register(codes, category, basket = '', kind = '') {
  for (const code of codes.split(' ')) knownCourses[code] = { category, basket, kind }
}
register('MA1110 MA1220 CY1018 EP1108 EE1203 MA1150 BT1010 MA2130', 'science')
register('ID1063 ID1050 ID2230', 'engineering')
register('LA1760', 'liberal')
register('EE1100 EE1101 EE1201 EE1204 EE1205 EE2100 EE2101 EE2102 EE2104 EE2200', 'department_core', '', 'theory')
register('EE1200', 'department_core', '', 'lab')
register('EE2400 EE3400 EE3302 EE3301 EE3300 EE3402 EE3403', 'stream_core', 'micro', 'theory')
register('EE2301 EE2401 EE3401', 'stream_core', 'micro', 'lab')
register('EE3501 EE2600 EE4502 EE3603', 'stream_core', 'power', 'theory')
register('EE3500 EE3601', 'stream_core', 'power', 'lab')
register('EE3700 EE2800 EE2802 EE3800 EE3801 EE4700', 'stream_core', 'communications', 'theory')
register('EE3701 EE2801 EE3802', 'stream_core', 'communications', 'lab')
const restricted = new Set(['EE1102', 'EE1202', 'EE1206', 'EE2103', 'EE5817', 'EE5609'])
const conditional = new Set(['EE5837', 'EE5807', 'EE5390', 'EE5847', 'EE6317', 'EE5600', 'EE5601', 'EE7390', 'EE5370'])

export function suggestCourse(code, name = '') {
  const normalized = String(code || '').toUpperCase().replace(/\s+/g, '')
  if (knownCourses[normalized]) return { ...knownCourses[normalized], suggestion: '2020 curriculum match; verify against your batch.' }
  if (/^(SS|LA|CA)\d/.test(normalized)) return { category: 'liberal', basket: '', kind: '', suggestion: 'LA/CA or soft skills suggestion; verify for your batch.' }
  if (/^EE\d/.test(normalized)) {
    const suggestion = restricted.has(normalized) ? '2020 rulebook lists this course as not allowed as a departmental elective. Verify before counting.' : conditional.has(normalized) ? '2020 rulebook lists conditions for this departmental elective. Verify eligibility before counting.' : 'Unmatched EE course suggested as a departmental elective; verify eligibility.'
    return { category: 'department_elective', basket: '', kind: '', suggestion }
  }
  if (!normalized && /^(soft skills?|personality development|introduction to entrepreneurship)$/i.test(String(name).trim())) return { category: 'liberal', basket: '', kind: '', suggestion: 'Soft skills are grouped with LA/CA in this proposed calculator; verify for your batch.' }
  return { category: '', basket: '', kind: '', suggestion: 'No 2020 curriculum match. Choose a category.' }
}

export const freshPlan = () => ({ version: 2, preset: '2020', targets: Object.fromEntries(categories.map(item => [item.id, item.target])), detailTargets: { ...detailDefaults }, basketTargets: { ...basketDefaults }, manual: {}, courses: [] })

export function normalizePlan(value) {
  if (!value || !value.targets || !value.manual || !Array.isArray(value.courses)) return freshPlan()
  const plan = { ...value, targets: { ...value.targets }, manual: { ...value.manual }, courses: value.courses.map(course => ({ ...course })) }
  if (plan.version !== 2) {
    plan.targets.liberal = creditNumber(plan.targets.liberal) + creditNumber(plan.targets.soft)
    plan.manual.liberal = creditNumber(plan.manual.liberal) + creditNumber(plan.manual.soft)
    delete plan.targets.soft
    delete plan.manual.soft
    plan.courses = plan.courses.map(course => {
      if (course.category === 'soft') return { ...course, category: 'liberal' }
      if (course.category === 'department') {
        const suggestion = suggestCourse(course.code, course.name)
        return suggestion.category.startsWith('department_') || suggestion.category === 'stream_core' ? { ...course, ...suggestion } : { ...course, category: 'department_unallocated', suggestion: 'Previously recorded as departmental; choose a specific course type.' }
      }
      return course
    })
  }
  plan.version = 2
  plan.detailTargets = { ...detailDefaults, ...plan.detailTargets }
  plan.basketTargets = { ...basketDefaults, ...plan.basketTargets }
  return plan
}

export function calculatePlan(plan) {
  const totals = Object.fromEntries(categories.map(category => [category.id, category.id === 'department' ? 0 : creditNumber(plan.manual[category.id])]))
  const detail = { core_theory: creditNumber(plan.manual.core_theory), core_lab: creditNumber(plan.manual.core_lab), elective: creditNumber(plan.manual.elective), stream_theory: creditNumber(plan.manual.stream_unassigned_theory), stream_lab: creditNumber(plan.manual.stream_unassigned_lab), unallocated: creditNumber(plan.manual.department), stream_unspecified: 0 }
  const basketTotals = Object.fromEntries(Object.keys(basketDefaults).map(key => [key, creditNumber(plan.manual[`basket_${key}`])]))
  for (const basket of baskets) for (const kind of ['theory', 'lab']) detail[`stream_${kind}`] += basketTotals[`${basket.id}_${kind}`]
  for (const course of plan.courses) {
    const credits = creditNumber(course.credits)
    if (Object.hasOwn(totals, course.category) && course.category !== 'department') { totals[course.category] += credits; continue }
    if (course.category === 'department_core') {
      if (course.kind === 'theory' || course.kind === 'lab') detail[`core_${course.kind}`] += credits
      else detail.unallocated += credits
    } else if (course.category === 'department_elective') detail.elective += credits
    else if (course.category === 'department_unallocated') detail.unallocated += credits
    else if (course.category === 'stream_core') {
      if (course.kind === 'theory' || course.kind === 'lab') {
        detail[`stream_${course.kind}`] += credits
        if (baskets.some(basket => basket.id === course.basket)) basketTotals[`${course.basket}_${course.kind}`] += credits
      } else detail.stream_unspecified += credits
    }
  }
  totals.department = Object.values(detail).reduce((sum, credits) => sum + credits, 0)
  return { totals, detail, basketTotals, completed: Object.values(totals).reduce((sum, credits) => sum + credits, 0), target: categories.reduce((sum, category) => sum + creditNumber(plan.targets[category.id]), 0) }
}
