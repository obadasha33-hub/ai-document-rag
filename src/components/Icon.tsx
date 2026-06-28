'use client'

import React from 'react'

type IconName =
  | 'arrow-up-right'
  | 'arrow-right'
  | 'arrow-left'
  | 'plus'
  | 'check'
  | 'x'
  | 'spark'
  | 'search'
  | 'doc'
  | 'shield'
  | 'logo'
  | 'quote'
  | 'cloud'
  | 'cpu'
  | 'globe'
  | 'eye'
  | 'eye-off'
  | 'copy'
  | 'spinner'
  | 'chevron-down'
  | 'upload'
  | 'edit'
  | 'arrow-down'
  | 'trash'
  | 'key'
  | 'play'
  | 'menu'
  | 'pin'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
  name: IconName
}

const paths: Record<IconName, React.ReactNode> = {
  'arrow-up-right': <path d="M7 17 17 7M7 7h10v10" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'arrow-down': <path d="M12 5v14M18 13l-6 6-6-6" />,
  'arrow-left': <path d="M19 12H5M11 18l-6-6 6-6" />,
  'plus': <path d="M12 5v14M5 12h14" />,
  'check': <path d="m4 12 5 5L20 6" />,
  'x': <path d="M6 6l12 12M18 6 6 18" />,
  'spark': <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
  'search': <><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></>,
  'doc': <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v4a1 1 0 0 0 1 1h4" /></>,
  'shield': <path d="M12 2 4 5v6c0 5 3.5 9.4 8 11 4.5-1.6 8-6 8-11V5z" />,
  'logo': <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /><circle cx="12" cy="14" r="3" /></>,
  'quote': <path d="M5 17h3l1-4H6V8h5v9H5zM14 17h3l1-4h-3V8h5v9h-5z" />,
  'cloud': <path d="M7 19a5 5 0 0 1 0-10 6 6 0 0 1 11 1 4 4 0 0 1 0 9z" />,
  'cpu': <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></>,
  'globe': <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M3 3l18 18M10.7 6.2A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 4M6.6 6.6A17 17 0 0 0 2 12s4 6 10 6c1.5 0 3-.3 4.4-.8M9 9a3 3 0 0 0 4.7 4" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  upload: <><path d="M12 4v12" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>,
  trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14" /><path d="M10 11v6M14 11v6" /></>,
  key: <><circle cx="7" cy="15" r="4" /><path d="M11 15h10M16 15l3-3M19 12l3-3" /></>,
  edit: <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  play: <path d="M6 4v16l14-8z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  pin: <path d="M12 2v20M5 9h14M5 15h14" />,
}

export function Icon({ size = 18, name, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}
