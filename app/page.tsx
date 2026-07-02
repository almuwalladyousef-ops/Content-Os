'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Home() {
  const router = useRouter()
  useEffect(() => { router.replace('/post') }, [router])

  return (
    <div className="text-center py-20">
      <h1 className="text-3xl font-bold mb-4">ContentOS Flames</h1>
      <p className="text-text-muted mb-6">Redirecting...</p>
      <Link href="/post" className="text-primary underline">Go to Post page</Link>
    </div>
  )
}
