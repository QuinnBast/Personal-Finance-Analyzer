/**
 * Category -> colour.
 *
 * Previously every unknown category got `generateSoftColor()` - a random hue.
 * That meant a category's colour changed on every page load, and any category
 * with a sub-name ("Food - Take out") missed the hand-written map entirely and
 * got a random colour while plain "Food" stayed sage green. Colours now come
 * from the validated slot palette in palette.js and are derived from the
 * category's *family*, so:
 *
 *   - the same category is the same colour on every chart and every reload,
 *   - "Food", "Food - Take out" and "Food - Groceries" all read as Food,
 *   - nothing past the six slots invents a hue; it folds into the "Other" gray.
 */
import { FAMILIES, OTHER_FAMILY, INCOME_FAMILY, TRANSFER_FAMILY, familyOf } from '@/utils/analytics.js'
import { SERIES, OTHER, FLOW, lighten, wash } from '@/utils/palette.js'

/** Categories offered in the import / filter datalists. */
export const categories = [
  'Food - Groceries',
  'Food - Take out',
  'Food - Other',
  'Entertainment - Music',
  'Entertainment - Video Games',
  'Entertainment - Events',
  'Entertainment - Hobby',
  'Entertainment - Sports',
  'Vehicle - Gas',
  'Vehicle - Maintenance',
  'Vehicle - Registration',
  'Vehicle - Insurance',
  'Personal - Clothing',
  'Personal - Fitness',
  'Personal - Other',
  'Bills - Internet',
  'Bills - Phone',
  'Bills - Power',
  'Bills - Hydro',
  'Bills - Rent',
  'Bills - Subscriptions',
  'Bills - Insurance',
  'Bills - Web Hosting',
  'Bills - Other',
  'Job / Work',
  'Government',
  'Investment',
  'Gifts',
  'Health',
  'Education',
  'Vacation - Hotel',
  'Vacation - Food',
  'Vacation - Activities',
  'Vacation - Flights',
  'Home - Furniture',
  'Home - Appliances',
  'Home - Cleaning',
  'Home - Renovations',
  'Home - Electronics',
  'Home - Other',
  'Business',
  'Lottery',
  'Gambling',
  'Pet - Food',
  'Pet - Toys',
  'Pet - Other',
  'Other',
  'Unknown',
]

/** Family -> colour slot. Fixed: a family's colour never depends on its rank. */
const FAMILY_COLORS = {
  ...Object.fromEntries(FAMILIES.map((family, i) => [family, SERIES[i]])),
  [OTHER_FAMILY]: OTHER,
  [INCOME_FAMILY]: FLOW.income,
  [TRANSFER_FAMILY]: FLOW.transfer,
}

/** Kept for backwards compatibility with anything importing the old map. */
export const categoryColors = FAMILY_COLORS

export const familyColor = (family) => FAMILY_COLORS[family] ?? OTHER

/**
 * Deterministic colour for a raw category name *or* a family name - charts that
 * plot the roll-up (the monthly donut, the Pareto) pass a family, and a family
 * name like "Home & Bills" has no token in the category map.
 */
export const getCategoryColor = (category) =>
  FAMILY_COLORS[category] ?? familyColor(familyOf(category))

/**
 * Colour for one sub-category: its family's hue, stepped lighter for each
 * sibling. Hue keeps the family readable at a glance; the step separates the
 * members. Past five siblings the steps would stop being distinguishable, so it
 * clamps - the legend and table carry the rest.
 */
const SHADE_STEPS = [0, 0.2, 0.38, 0.54, 0.68]

export const categoryShade = (family, shade = 0) =>
  lighten(familyColor(family), SHADE_STEPS[Math.min(shade, SHADE_STEPS.length - 1)])

/** Accepts `rgb(r, g, b)` or `#rrggbb`; returns the same hue as a wash. */
export const rgbToRgba = (color, alpha = 0.5) => {
  if (typeof color === 'string' && color.trim().startsWith('#')) return wash(color, alpha)
  const parts = String(color).match(/\d+/g)
  if (!parts || parts.length < 3) return wash(OTHER, alpha)
  const [r, g, b] = parts
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
