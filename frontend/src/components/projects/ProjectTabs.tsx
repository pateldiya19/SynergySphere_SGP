import { Link } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  CalendarRange,
  HeartPulse,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ProjectTab =
  | 'overview'
  | 'tasks'
  | 'kanban'
  | 'timeline'
  | 'health'
  | 'discussion'
  | 'activity'
  | 'analytics'

const tabs: {
  key: ProjectTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  path: (id: string) => string
}[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, path: id => `/projects/${id}` },
  { key: 'tasks', label: 'Tasks', icon: ListChecks, path: id => `/projects/${id}/tasks` },
  { key: 'kanban', label: 'Kanban', icon: KanbanSquare, path: id => `/projects/${id}/kanban` },
  {
    key: 'timeline',
    label: 'Timeline',
    icon: CalendarRange,
    path: id => `/projects/${id}/timeline`,
  },
  { key: 'health', label: 'Health', icon: HeartPulse, path: id => `/projects/${id}/health` },
  {
    key: 'discussion',
    label: 'Discussion',
    icon: MessageSquare,
    path: id => `/projects/${id}/discussions`,
  },
  { key: 'activity', label: 'Activity', icon: Activity, path: id => `/projects/${id}/activity` },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    path: id => `/projects/${id}/analytics`,
  },
]

export function ProjectTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  return (
    <nav
      aria-label="Project sections"
      className="scrollbar-none -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {tabs.map(tab => {
          const isActive = tab.key === active
          return (
            <li key={tab.key}>
              <Link
                to={tab.path(projectId)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                )}
              >
                <tab.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
