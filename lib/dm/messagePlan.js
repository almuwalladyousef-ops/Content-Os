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

    plan.push({ text, buttons: [], acceptsButtons: block.type === 'text' })
  }

  return plan
}
