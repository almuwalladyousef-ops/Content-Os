'use client'
import '@/styles/dm.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import WorkspaceSwitcher from '@/components/dm/WorkspaceSwitcher'
import useActiveWorkspace from '@/components/dm/useActiveWorkspace'

const DM_NAV = [
  { href: '/dm', label: 'Dashboard' },
  { href: '/dm/rules', label: 'Rules' },
  { href: '/dm/settings', label: 'Settings' },
]

export default function DmLayout({ children }) {
  const pathname = usePathname()
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, loadingWorkspaces } = useActiveWorkspace()

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
        {!loadingWorkspaces && workspaces.length > 0 && (
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onChange={setActiveWorkspaceId}
            variant="sidebar"
          />
        )}
      </div>
      {children}
    </div>
  )
}
