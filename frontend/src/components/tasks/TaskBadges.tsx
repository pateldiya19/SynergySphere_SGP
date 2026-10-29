import {
  AlertOctagon,
  ArrowUp,
  Ban,
  CheckCircle2,
  Circle,
  CircleDot,
  Minus,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { ApiTaskStatus } from '@/lib/api'
import { formatStatus } from '@/lib/utils'
import { cn } from '@/lib/utils'

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

const statusConfig: Record<
  ApiTaskStatus,
  { variant: BadgeProps['variant']; icon: React.ComponentType<{ className?: string }> }
> = {
  todo: { variant: 'secondary', icon: Circle },
  in_progress: { variant: 'info', icon: CircleDot },
  blocked: { variant: 'destructive', icon: Ban },
  ready_for_review: { variant: 'warning', icon: ShieldCheck },
  changes_requested: { variant: 'warning', icon: RotateCcw },
  done: { variant: 'success', icon: CheckCircle2 },
}

const priorityConfig: Record<
  TaskPriority,
  { variant: BadgeProps['variant']; icon: React.ComponentType<{ className?: string }> }
> = {
  low: { variant: 'secondary', icon: Minus },
  medium: { variant: 'secondary', icon: Minus },
  high: { variant: 'warning', icon: ArrowUp },
  urgent: { variant: 'destructive', icon: AlertOctagon },
}

/** Canonical status pill. Used anywhere a task status is displayed. */
export function StatusBadge({
  status,
  showIcon = true,
  size,
  className,
}: {
  status: ApiTaskStatus
  showIcon?: boolean
  size?: BadgeProps['size']
  className?: string
}) {
  const config = statusConfig[status] || statusConfig.todo
  const Icon = config.icon

  return (
    <Badge variant={config.variant} size={size} className={className}>
      {showIcon && <Icon className="h-3 w-3" aria-hidden />}
      {formatStatus(status)}
    </Badge>
  )
}

/** Canonical priority pill. Low/medium stay quiet so high/urgent stand out. */
export function PriorityBadge({
  priority = 'medium',
  showIcon = true,
  size,
  className,
}: {
  priority?: TaskPriority
  showIcon?: boolean
  size?: BadgeProps['size']
  className?: string
}) {
  const config = priorityConfig[priority] || priorityConfig.medium
  const Icon = config.icon

  return (
    <Badge variant={config.variant} size={size} className={className}>
      {showIcon && <Icon className="h-3 w-3" aria-hidden />}
      {formatStatus(priority)}
    </Badge>
  )
}

const priorityBarTone: Record<TaskPriority, string> = {
  low: 'bg-muted-foreground/35',
  medium: 'bg-info/60',
  high: 'bg-warning',
  urgent: 'bg-destructive',
}

/** Thin colour rail used on Kanban cards to signal priority without a pill. */
export function PriorityRail({
  priority = 'medium',
  className,
}: {
  priority?: TaskPriority
  className?: string
}) {
  return (
    <span
      aria-label={`${formatStatus(priority)} priority`}
      className={cn(
        'block w-1 shrink-0 rounded-full',
        priorityBarTone[priority] || priorityBarTone.medium,
        className
      )}
    />
  )
}
