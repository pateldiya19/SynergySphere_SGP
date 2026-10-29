import { Button } from '@/components/ui/Button'
import { ApiPagination } from '@/lib/api'
import { cn } from '@/lib/utils'

type LoadMoreProps = {
  pagination?: ApiPagination
  /** Number of records currently rendered. */
  loaded: number
  isLoading?: boolean
  onLoadMore: () => void
  /** Singular noun for the records being listed, e.g. "project". */
  noun: string
  nounPlural?: string
  className?: string
}

/**
 * Footer for a paginated list: states how much of the collection is on screen
 * and loads the next page. Rendering the counts matters as much as the button —
 * a truncated list with no indicator is indistinguishable from a complete one.
 */
export function LoadMore({
  pagination,
  loaded,
  isLoading = false,
  onLoadMore,
  noun,
  nounPlural = `${noun}s`,
  className,
}: LoadMoreProps) {
  const total = pagination?.total ?? loaded
  const hasMore = loaded < total

  if (total === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3',
        className
      )}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing <span className="font-medium tabular text-foreground">{loaded}</span> of{' '}
        <span className="font-medium tabular text-foreground">{total}</span>{' '}
        {total === 1 ? noun : nounPlural}
      </p>
      {hasMore && (
        <Button type="button" variant="outline" size="sm" loading={isLoading} onClick={onLoadMore}>
          Load more
        </Button>
      )}
    </div>
  )
}
