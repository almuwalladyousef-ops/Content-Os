import { getRules } from '@/lib/dm/driveDB'
import RuleEditor from '@/components/dm/RuleEditor'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function EditRulePage({ params }) {
  const { id } = await params
  let rules = []
  try { rules = await getRules() } catch { /* DB not configured yet */ }
  const rule = rules.find(r => r.id === id)

  if (!rule) notFound()

  return <RuleEditor initial={rule} />
}
