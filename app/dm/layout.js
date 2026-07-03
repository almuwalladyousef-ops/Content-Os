'use client'
import '@/styles/dm.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const DM_NAV = [
  { href: '/dm', label: 'Dashboard' },
  { href: '/dm/rules', label: 'Rules' },
  { href: '/dm/settings', label: 'Settings' },
]

// Workspace switching lives solely in the main sidebar now (components/Sidebar.tsx) —
// DM automation shares that same workspace, so it doesn't need its own picker here.
export default function DmLayout({ children }) {
  const pathname = usePathname()

  function isActive(href) {
    return href === '/dm' ? pathname === '/dm' : pathname.startsWith(href)
  }

  return (
    <div className="dm-root">
      <div className="dm-bar">
        <nav className="dm-tabs">
          {DM_NAV.map(item => (
            <Link key={item.href} href={item.href} className={`dm-tab ${isActive(item.href) ? 'active' : ''}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}
