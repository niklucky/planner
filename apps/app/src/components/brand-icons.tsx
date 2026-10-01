import type { ComponentPropsWithRef } from 'react'

type IconProps = ComponentPropsWithRef<'svg'>

/** Lucide has no brand marks; these are single-color so they follow the surrounding text color. */
export function AppleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66ZM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28Z" />
    </svg>
  )
}

export function GooglePlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22.02 13.3 18.1 15.52l-3.52-3.5 3.55-3.52 3.89 2.2a1.49 1.49 0 0 1 0 2.6ZM1.34.92a1.49 1.49 0 0 0-.11.57v21.02c0 .21.04.42.12.6l11.16-11.09L1.34.92Zm12.2 10.07 3.26-3.24L3.45.2a1.47 1.47 0 0 0-.95-.18l11.04 10.97Zm0 2.07-11 10.93c.3.04.61-.02.9-.18l13.33-7.54-3.23-3.21Z" />
    </svg>
  )
}
