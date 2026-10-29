import { cn } from '@/lib/utils'

const sizeClasses = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-2.5',
} as const

const toneClasses = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
} as const

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  showLabel?: boolean
  label?: string
  size?: keyof typeof sizeClasses
  tone?: keyof typeof toneClasses
}

/**
 * Determinate progress track. Completion is always a positive signal, so the
 * default tone stays constant instead of colouring low values as errors.
 */
export function ProgressBar({
  value,
  max = 100,
  className,
  showLabel = false,
  label = 'Progress',
  size = 'md',
  tone = 'primary',
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0
  const rounded = Math.round(percentage)

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="font-medium text-muted-foreground">{label}</span>
          <span className="font-semibold tabular text-foreground">{rounded}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={showLabel ? undefined : label}
        className={cn('w-full overflow-hidden rounded-full bg-muted', sizeClasses[size])}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-emphasis',
            toneClasses[tone]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
