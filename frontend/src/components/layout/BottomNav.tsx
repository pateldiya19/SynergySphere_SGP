import { Link, useLocation } from 'react-router-dom'
import { BarChart3, FolderKanban, ListTodo, MessageSquare, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Home', href: '/dashboard', icon: BarChart3 },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'My tasks', href: '/my-tasks', icon: ListTodo },
  { name: 'Chat', href: '/discussions', icon: MessageSquare },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function BottomNav() {
  const location = useLocation()

  const isActive = (href: string) => {
    if (href === '/projects') return location.pathname.startsWith('/projects')
    if (href === '/discussions') return location.pathname.startsWith('/discussions')
    return location.pathname === href
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <nav aria-label="Primary" className="mx-auto flex max-w-xl">
        {navigation.map(item => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.name}
              to={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-2xs font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {active && (
                <span
                  className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-primary"
                  aria-hidden
                />
              )}
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
