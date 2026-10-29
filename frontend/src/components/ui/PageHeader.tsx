import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Breadcrumb = {
  label: string
  to?: string
}

type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  /** Short uppercase label above the title. */
  eyebrow?: React.ReactNode
  breadcrumbs?: Breadcrumb[]
  actions?: React.ReactNode
  /** Badges or metadata rendered under the title. */
  meta?: React.ReactNode
  className?: string
}

/**
 * The single page-title treatment used across the app so every screen opens
 * with the same rhythm: breadcrumbs, title, supporting copy, actions.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-4', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {crumb.to && !isLast ? (
                    <Link to={crumb.to} className="rounded transition-colors hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(isLast && 'font-medium text-foreground')}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          )}
          <h1
            className={cn(
              'text-2xl font-semibold leading-tight sm:text-[1.75rem]',
              eyebrow && 'mt-1.5'
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          )}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
