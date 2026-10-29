import * as React from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------
   Empty state
------------------------------------------------------------------------- */

type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  /** `inline` drops the dashed frame for use inside an existing card. */
  variant?: 'panel' | 'inline'
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = 'panel',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        variant === 'panel' && 'rounded-lg border border-dashed bg-card/40',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------
   Error state
------------------------------------------------------------------------- */

type ErrorStateProps = {
  title?: string
  description?: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again.',
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive-soft/40 px-6 py-12 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {onRetry && (
        <Button className="mt-5" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------
   Loading states
------------------------------------------------------------------------- */

export function LoadingState({
  label = 'Loading...',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground',
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

/** Skeleton rows that mirror the shape of a data table. */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-4 flex-1', columnIndex === 0 && 'max-w-[40%]')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton grid that mirrors a set of cards. */
export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-4 rounded-lg border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
          <Skeleton className="h-5 w-3/5" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Skeleton for metric tiles. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading metrics"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-card p-4 shadow-xs">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-7 w-12" />
        </div>
      ))}
    </div>
  )
}
