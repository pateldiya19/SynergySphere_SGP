import * as React from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

const toneStyles = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
  info: 'bg-info-soft text-info',
} as const

export type StatTone = keyof typeof toneStyles

type StatCardProps = {
  label: string
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: StatTone
  /** Short qualifier under the value, e.g. "2 due this week". */
  hint?: React.ReactNode
  to?: string
  className?: string
}

/** Compact metric tile. Becomes a link when `to` is provided. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  hint,
  to,
  className,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              toneStyles[tone]
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2.5 text-2xl font-semibold leading-none tabular">{value}</p>
      {hint && <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  )

  const baseClassName = cn(
    'rounded-lg border bg-card p-4 shadow-xs',
    to && 'block transition-all duration-150 hover:border-primary/35 hover:shadow-md',
    className
  )

  if (to) {
    return (
      <Link to={to} className={baseClassName}>
        {content}
      </Link>
    )
  }

  return <div className={baseClassName}>{content}</div>
}
