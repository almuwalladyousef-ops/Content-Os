/**
 * Turns the rule editor's blocks into the actual list of Instagram messages.
 *
 * One block = one message. Blocks used to be flattened into a single DM joined
 * by blank lines, which is why three blocks arrived mushed into one bubble.
 *
 * The one exception is buttons: Instagram has no standalone button message —
 * a button is an attachment on a text message — so a run of button blocks
 * rides on the text block directly above it (max 3, Instagram's limit). A
 * button with no text above it gets a minimal carrier line.
 *
 * Both the composer preview and the sender call this, so what you see in the
 * preview is what actually goes out.
 */

export const BUTTON_CARRIER_TEXT = 'Here you go:'
export const MAX_BUTTONS = 3
// Instagram truncates quick-reply and button titles at 20 characters.
export const MAX_BUTTON_TITLE = 20
// Instagram's Send API rejects any message text over 1000 characters. A block
// over this line used to fail outright at send time with no warning anywhere
// in the editor — split it into several messages instead of dropping it.
export const INSTAGRAM_TEXT_LIMIT = 1000

function packUnits(units, maxLen, joiner) {
  const chunks = []
  let current = ''
  for (const unit of units) {
    if (unit.length > maxLen) {
      if (current) { chunks.push(current); current = '' }
      chunks.push(unit) // still oversized; a later pass splits it further
      continue
    }
    const candidate = current ? current + joiner + unit : unit
    if (candidate.length <= maxLen) current = candidate
    else { chunks.push(current); current = unit }
  }
  if (current) chunks.push(current)
  return chunks
}

function hardSplit(text, maxLen) {
  const chunks = []
  let rest = text
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(' ', maxLen)
    if (cut <= maxLen * 0.5) cut = maxLen // no good word boundary — just cut
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

// Splits long text at the most natural boundary that gets it under the limit:
// paragraph breaks first, then sentences, then (rarely) a hard word-boundary
// cut. Short text is returned untouched as a single-element array.
export function splitForInstagram(text, maxLen = INSTAGRAM_TEXT_LIMIT) {
  if (text.length <= maxLen) return [text]

  let chunks = packUnits(text.split(/\n{2,}/), maxLen, '\n\n')
  chunks = chunks.flatMap(c =>
    c.length <= maxLen ? [c] : packUnits(c.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [c], maxLen, ' ')
  )
  chunks = chunks.flatMap(c => (c.length <= maxLen ? [c] : hardSplit(c, maxLen)))
  return chunks
}

export function planMessages(blocks, resolve = text => text) {
  const plan = []

  for (const block of blocks || []) {
    if (block?.type === 'button') {
      const label = block.label?.trim()
      const url = block.url?.trim()
      if (!label || !url) continue

      const button = { title: resolve(label).slice(0, MAX_BUTTON_TITLE), url }
      const last = plan[plan.length - 1]
      if (last?.acceptsButtons && last.buttons.length < MAX_BUTTONS) {
        last.buttons.push(button)
      } else {
        plan.push({ text: BUTTON_CARRIER_TEXT, buttons: [button], acceptsButtons: false })
      }
      continue
    }

    // Only the outer whitespace is trimmed — line breaks the user typed inside
    // the message are part of the message and are sent exactly as written.
    const raw = block?.type === 'text' ? block.content : block?.url
    const text = resolve((raw ?? '').trim())
    if (!text) continue

    const parts = block.type === 'text' ? splitForInstagram(text) : [text]
    parts.forEach((part, i) => {
      plan.push({
        text: part,
        buttons: [],
        // Only the last piece of a split block can carry a button that follows
        // it in the editor — a button belongs after the message it was placed
        // under, not in the middle of it.
        acceptsButtons: block.type === 'text' && i === parts.length - 1,
        splitInfo: parts.length > 1 ? { part: i + 1, of: parts.length } : null,
      })
    })
  }

  return plan
}
