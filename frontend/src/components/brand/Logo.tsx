import { cn } from '@/lib/utils'

/**
 * The SynergySphere mark.
 *
 * Three orbital arcs around a solid core: the "sphere" of the name, with the
 * arcs reading as separate streams of work converging on one centre. Drawn as
 * inline SVG rather than an image so it inherits the brand gradient and stays
 * crisp at every size, including the 16px favicon.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('h-8 w-8', className)}
      role="img"
      aria-label="SynergySphere"
    >
      <defs>
        <linearGradient
          id="synergy-mark"
          x1="4"
          y1="3"
          x2="28"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="hsl(var(--brand))" />
          <stop offset="1" stopColor="hsl(var(--brand-accent))" />
        </linearGradient>
      </defs>

      <rect width="32" height="32" rx="8.5" fill="url(#synergy-mark)" />

      {/* Three arcs, rotated around the core. */}
      <g
        stroke="hsl(var(--brand-foreground))"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.95"
      >
        <path d="M16 6.5a9.5 9.5 0 0 1 8.23 4.75" />
        <path d="M24.23 20.75A9.5 9.5 0 0 1 16 25.5" />
        <path d="M7.77 20.75A9.5 9.5 0 0 1 7.77 11.25" />
      </g>

      <circle cx="16" cy="16" r="4.1" fill="hsl(var(--brand-foreground))" />
      <circle cx="16" cy="16" r="1.9" fill="url(#synergy-mark)" />
    </svg>
  )
}

/** The mark plus the wordmark, used in headers and the auth panel. */
export function Logo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string
  markClassName?: string
  textClassName?: string
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={markClassName} />
      <span
        className={cn(
          'font-display text-base font-semibold tracking-tight text-foreground',
          textClassName
        )}
      >
        Synergy<span className="text-brand">Sphere</span>
      </span>
    </span>
  )
}
