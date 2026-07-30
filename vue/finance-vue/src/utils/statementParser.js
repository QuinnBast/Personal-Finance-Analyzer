/**
 * Scotiabank CSV statement parsing.
 *
 * Column positions and the vendor/location slicing are preserved exactly from
 * the original importer. That is deliberate: the 1,000 existing vendor rules
 * were built against these exact strings, so "improving" the slicing would stop
 * every rule from matching. The fragile parts around it are what changed:
 *
 *  - fields are split with a real CSV reader instead of a greedy 7-group regex,
 *    so a quoted comma no longer shifts every column;
 *  - a line that does not parse is reported with a reason instead of throwing
 *    inside a FileReader callback and vanishing;
 *  - `amount` comes out as a Number. The server's TransactionRequest declares
 *    `amount: Double`, and kotlinx (not lenient) rejects a JSON string there;
 *  - account detection is returned per file rather than written to shared state,
 *    which used to race when several files were read at once.
 */
import moment from 'moment'

export const CHEQUING = 'Chequing'
export const CREDIT = 'Credit'
export const ACCOUNTS = [CHEQUING, CREDIT]

/** RFC-ish CSV field split: honours quotes and doubled escaped quotes. */
export function splitCsvLine(line) {
  const fields = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(field)
      field = ''
    } else {
      field += char
    }
  }
  fields.push(field)
  return fields.map((f) => f.trim())
}

/**
 * Which account a file is for. The credit export carries a "Status" column in
 * position 5; the chequing export does not.
 */
export function detectAccount(headerLine) {
  const columns = splitCsvLine(headerLine ?? '')
  return (columns[4] ?? '').toLowerCase() === 'status' ? CREDIT : CHEQUING
}

const cleanAmount = (raw) => Number(String(raw ?? '').replace(/[$,\s]/g, ''))

function parseChequingRow(columns) {
  const date = columns[1]
  const type = columns[2] ?? ''
  const description = columns[3] ?? ''
  const amount = cleanAmount(columns[5])

  // Fixed-width slicing, unchanged: vendor is the first 25 characters and the
  // next 5 are the location, unless those 5 look like part of the name.
  let vendor = 'Unknown'
  let location = 'Unknown'
  if (description !== '') {
    vendor = description.slice(0, 25).trim()
    location = description.slice(25, 30).trim()
    if (location.includes(' ') || location === '') {
      vendor += location
      location = 'Unknown'
    }
  }

  return { date, amount, type, vendor, location }
}

function parseCreditRow(columns) {
  const date = columns[1]
  const description = columns[2] ?? ''
  const amount = cleanAmount(columns[6])

  let vendor = 'Unknown'
  let location = 'Unknown'
  let presetCategory = ''

  if (description !== '') {
    if (description.includes('FROM')) {
      // A transfer paying off the card; there is no merchant or city to split.
      vendor = description
      presetCategory = 'Bills'
    } else {
      vendor = description.slice(0, 25).trim()
      const city = description.slice(25, 38)
      const province = description.slice(38, 40).trim()
      if (city.trim() !== '') location = `${city}, ${province}`
    }
  }

  // The credit export has no transaction-type column, which is why these rows
  // land in the database with a blank purchase type.
  return { date, amount, type: '', vendor, location, presetCategory }
}

/**
 * @returns {{account: string, rows: Array, skipped: Array<{line: number, text: string, reason: string}>}}
 */
export function parseStatement(text, { account } = {}) {
  const lines = String(text ?? '').split(/\r?\n/)
  const resolvedAccount = account ?? detectAccount(lines[0])
  const rows = []
  const skipped = []

  lines.forEach((line, index) => {
    if (index === 0 || line.trim() === '') return // header / blank

    const columns = splitCsvLine(line)
    const needed = resolvedAccount === CREDIT ? 7 : 6
    if (columns.length < needed) {
      skipped.push({
        line: index + 1,
        text: line.slice(0, 90),
        reason: `expected at least ${needed} columns, found ${columns.length}`,
      })
      return
    }

    const parsed = resolvedAccount === CREDIT ? parseCreditRow(columns) : parseChequingRow(columns)

    const date = moment(parsed.date, 'YYYY-MM-DD', true)
    if (!date.isValid()) {
      skipped.push({ line: index + 1, text: line.slice(0, 90), reason: `unreadable date "${parsed.date}"` })
      return
    }
    if (!Number.isFinite(parsed.amount)) {
      skipped.push({ line: index + 1, text: line.slice(0, 90), reason: 'unreadable amount' })
      return
    }

    rows.push({
      date: date.format('YYYY-MM-DDTHH:mm:ss'),
      amount: parsed.amount,
      type: parsed.type,
      vendor: parsed.vendor || 'Unknown',
      location: parsed.location || 'Unknown',
      category: parsed.presetCategory ?? '',
      account: resolvedAccount,
    })
  })

  return { account: resolvedAccount, rows, skipped }
}

/** Key used to spot the same transaction twice, here or already in the database. */
export const duplicateKey = (row) =>
  [
    String(row.date ?? '').slice(0, 10),
    String(row.vendor ?? '').trim().toUpperCase(),
    Number(row.amount).toFixed(2),
    String(row.account ?? '').trim(),
  ].join('|')

/**
 * The server drops these rather than storing them: a positive amount on the
 * credit account is a payment, which it reconciles against the matching
 * chequing transfer instead of importing (see isCreditCardPayment in
 * FinanceServer.kt). Worth telling the user before they wonder where the rows
 * went.
 */
export const isCreditCardPayment = (row) => row.account === CREDIT && Number(row.amount) > 0
