import { redirect } from 'next/navigation'

// DM automation is just the rules list now — stats live on the main dashboard
// and the Instagram connection lives in the main Settings page.
export default function DmIndex() {
  redirect('/dm/rules')
}
