import '@/styles/dm.css'

// No internal nav: /dm redirects to the rules list, DM stats live on the main
// dashboard, and the Instagram connection is managed in the main Settings page.
export default function DmLayout({ children }) {
  return <div className="dm-root">{children}</div>
}
