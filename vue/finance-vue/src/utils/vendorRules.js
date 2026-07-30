/**
 * Vendor-rule matching and health analysis.
 *
 * A "rule" is a row of t_vendor_categories: {id, vendor, categoryName, regexMaybe}.
 * On import, each incoming transaction is matched against the rules **in the
 * order the API returns them** (database order, so effectively by id) and the
 * FIRST match wins. That match does two things:
 *
 *   1. sets the transaction's category, and
 *   2. relabels the transaction's vendor to the rule's vendor name.
 *
 * The consequence that matters: a second rule for a vendor that an earlier rule
 * already matches can never fire. The importer creates a rule for every vendor
 * it sees without checking for an existing one, so these pile up silently -
 * `analyseRules` exists to surface them.
 *
 * Matching mirrors the import path exactly: uppercase on both sides, regex when
 * one is set, otherwise exact equality. Note the regex is built WITHOUT the `g`
 * flag - a global regex keeps `lastIndex` between `.test()` calls, so reusing one
 * across a list silently skips matches.
 */

export const vendorKeyOf = (vendor) => String(vendor ?? '').trim().toUpperCase()

export const hasPattern = (rule) => String(rule?.regexMaybe ?? '').trim() !== ''

/** Adds `regex` / `regexError` / `order` without mutating the input. */
export function compileRule(rule, order = 0) {
  const pattern = String(rule?.regexMaybe ?? '').trim()
  const base = { ...rule, order, key: vendorKeyOf(rule?.vendor), pattern }
  if (!pattern) return { ...base, regex: null, regexError: null }
  try {
    return { ...base, regex: new RegExp(pattern.toUpperCase()), regexError: null }
  } catch (error) {
    return { ...base, regex: null, regexError: error.message }
  }
}

export const compileRules = (rules) => (rules ?? []).map((r, i) => compileRule(r, i))

/** Does this rule claim the given vendor string? */
export function ruleMatches(compiled, vendor) {
  const value = vendorKeyOf(vendor)
  if (!value) return false
  if (compiled.regex) return compiled.regex.test(value)
  if (compiled.pattern) return false // pattern present but invalid: matches nothing
  return value === compiled.key
}

/** The rule that would actually be applied, honouring first-match-wins. */
export function findMatchingRule(compiled, vendor) {
  return compiled.find((r) => ruleMatches(r, vendor)) ?? null
}

const BLANK_CATEGORY = new Set(['', 'unknown', 'n/a', 'none', 'null'])

/**
 * Everything wrong with the current rule set, computed in one pass so the page
 * can show it without N queries.
 *
 * Shadowing is checked two ways: an exact-duplicate vendor is shadowed by the
 * first rule with that vendor, and any rule can be shadowed by an earlier regex
 * rule that also matches its vendor. Only regex rules are tested as shadowers,
 * which keeps this linear in the (much smaller) number of pattern rules.
 */
export function analyseRules(rules) {
  const compiled = compileRules(rules)

  const firstByVendor = new Map()
  for (const rule of compiled) {
    if (!firstByVendor.has(rule.key)) firstByVendor.set(rule.key, rule)
  }

  const patternRules = compiled.filter((r) => r.regex)
  const shadowedBy = new Map()

  for (const rule of compiled) {
    const first = firstByVendor.get(rule.key)
    if (first && first !== rule) {
      shadowedBy.set(rule.id, first)
      continue
    }
    // An earlier pattern rule that catches this vendor takes precedence.
    const earlier = patternRules.find((p) => p.order < rule.order && p.regex.test(rule.key))
    if (earlier) shadowedBy.set(rule.id, earlier)
  }

  // Duplicate vendors, grouped, with the winner first.
  const groups = new Map()
  for (const rule of compiled) {
    if (!groups.has(rule.key)) groups.set(rule.key, [])
    groups.get(rule.key).push(rule)
  }

  const duplicateGroups = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const categories = [...new Set(g.map((r) => String(r.categoryName ?? '').trim()))]
      return {
        key: g[0].key,
        vendor: g[0].vendor,
        rules: g,
        winner: g[0],
        redundant: g.slice(1),
        categories,
        // Safe to prune only when every copy already agrees on the category.
        agrees: categories.length === 1,
      }
    })
    .sort((a, b) => b.rules.length - a.rules.length || a.vendor.localeCompare(b.vendor))

  const categoryCounts = new Map()
  for (const rule of compiled) {
    const name = String(rule.categoryName ?? '').trim() || 'Uncategorized'
    const entry = categoryCounts.get(name) ?? { name, count: 0, active: 0 }
    entry.count++
    if (!shadowedBy.has(rule.id)) entry.active++
    categoryCounts.set(name, entry)
  }

  // Category names that differ only by case or spacing are almost certainly typos.
  const caseGroups = new Map()
  for (const name of categoryCounts.keys()) {
    const k = name.toLowerCase().replace(/\s+/g, ' ')
    if (!caseGroups.has(k)) caseGroups.set(k, new Set())
    caseGroups.get(k).add(name)
  }

  return {
    compiled,
    total: compiled.length,
    withPattern: compiled.filter((r) => hasPattern(r)).length,
    invalidPattern: compiled.filter((r) => r.regexError),
    blankCategory: compiled.filter((r) =>
      BLANK_CATEGORY.has(String(r.categoryName ?? '').trim().toLowerCase()),
    ),
    shadowedBy,
    shadowedCount: shadowedBy.size,
    duplicateGroups,
    prunableCount: duplicateGroups.filter((g) => g.agrees).reduce((a, g) => a + g.redundant.length, 0),
    conflictGroups: duplicateGroups.filter((g) => !g.agrees),
    categories: [...categoryCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    caseVariants: [...caseGroups.values()].filter((s) => s.size > 1).map((s) => [...s]),
  }
}
