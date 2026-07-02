import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'ContentOS Flames',
  description: 'Post and analyze your videos',
  other: {
    'tiktok-developers-site-verification': 'YGkyP6kFDJsdHfcKAN8wKtb0NyWuQvQO',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
