import React from 'react'

interface IconProps {
  size?: number
  stroke?: number
  style?: React.CSSProperties
  className?: string
}

function Icon({ children, size = 18, stroke = 1.5, style, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {children}
    </svg>
  )
}

export const IconPost = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
    <path d="M10 15l4-2-4-2v4z" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconAnalysis = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19h16" />
    <path d="M6 16V9" />
    <path d="M11 16V5" />
    <path d="M16 16v-6" />
    <path d="M21 16v-3" />
  </Icon>
)

export const IconHistory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 7v5l3 2" />
  </Icon>
)

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
)

export const IconSidebar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Icon>
)

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" />
    <path d="M7 9l5-5 5 5" />
    <path d="M12 4v12" />
  </Icon>
)

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12.5L9 17.5L20 6.5" />
  </Icon>
)

export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M6 18L18 6" />
  </Icon>
)

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </Icon>
)

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="M13 5l7 7-7 7" />
  </Icon>
)

export const IconSparkles = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z" />
    <path d="M19 17l.7 1.6L21 19l-1.3.4L19 21l-.7-1.6L17 19l1.3-.4L19 17z" />
  </Icon>
)

export const IconBolt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2L4.5 13H12L11 22L19.5 11H12L13 2z" />
  </Icon>
)

export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const IconClipboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2" />
    <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </Icon>
)

export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Icon>
)

export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14L21 3" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </Icon>
)

export const IconFilm = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 3v18" />
    <path d="M17 3v18" />
    <path d="M3 8h4" />
    <path d="M3 16h4" />
    <path d="M17 8h4" />
    <path d="M17 16h4" />
  </Icon>
)

export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </Icon>
)

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
)

export const LogoYouTube = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="6" width="20" height="12" rx="3" fill="currentColor" />
    <path d="M10 9.5L15 12L10 14.5V9.5z" fill="oklch(0.215 0.014 255)" />
  </svg>
)

export const LogoInstagram = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
  </svg>
)

export const LogoTikTok = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
    <path d="M14 3c0 2.5 2 4.5 4.5 4.5" />
  </svg>
)

export function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  if (platform === 'youtube') return <LogoYouTube size={size} />
  if (platform === 'instagram') return <LogoInstagram size={size} />
  if (platform === 'tiktok') return <LogoTikTok size={size} />
  return null
}
