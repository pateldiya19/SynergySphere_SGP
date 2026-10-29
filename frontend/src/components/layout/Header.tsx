import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ModeToggle } from '@/components/mode-toggle'
import {
  apiRequest,
  ApiNotification,
  ApiSearchResult,
  respondToInvitation,
  searchGlobal,
} from '@/lib/api'
import { onNotification } from '@/lib/socket'
import { cn, formatDateTime, formatRelativeDateTime } from '@/lib/utils'
import {
  Bell,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  FolderKanban,
  Loader2,
  LogOut,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react'

function getPageContext(pathname: string) {
  const sections: Record<string, string> = {
    tasks: 'Tasks',
    kanban: 'Kanban',
    timeline: 'Timeline',
    health: 'Health',
    activity: 'Activity',
    analytics: 'Analytics',
    discussions: 'Discussions',
  }

  if (pathname.startsWith('/projects/')) {
    const section = pathname.split('/')[3]
    return section ? sections[section] || 'Project' : 'Project overview'
  }
  if (pathname.startsWith('/tasks/')) return 'Task details'

  const pages: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/projects': 'Projects',
    '/my-tasks': 'My tasks',
    '/discussions': 'Discussions',
    '/settings': 'Settings',
  }
  return pages[pathname] || 'Workspace'
}

export function Header() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<ApiNotification[]>([])
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(true)
  const [notificationError, setNotificationError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ApiSearchResult | null>(null)
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) {
      setSearchResults(null)
      setSearchError('')
      setIsSearchLoading(false)
      return
    }

    const timer = window.setTimeout(() => {
      setIsSearchLoading(true)
      setSearchError('')
      void searchGlobal(trimmedQuery, 'all', 1, 5)
        .then(setSearchResults)
        .catch(() => {
          setSearchResults(null)
          setSearchError('Search is unavailable right now. Please try again.')
        })
        .finally(() => setIsSearchLoading(false))
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchQuery])

  // Cmd/Ctrl-K focuses search, the expected shortcut in this class of product.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults(null)
    setSearchError('')
  }

  const resultCount = searchResults
    ? searchResults.users.length + searchResults.projects.length + searchResults.tasks.length
    : 0
  const pageContext = getPageContext(location.pathname)
  const unreadCount = notifications.filter(notification => !notification.read).length

  useEffect(() => {
    setIsNotificationsLoading(true)
    void apiRequest<ApiNotification[]>('/api/notifications?limit=50')
      .then(result => {
        setNotifications(result || [])
        setNotificationError('')
      })
      .catch(() => {
        setNotifications([])
        setNotificationError('Unable to load notifications.')
      })
      .finally(() => setIsNotificationsLoading(false))
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    return onNotification(notification => {
      setNotifications(current =>
        current.some(item => item.id === notification.id) ? current : [notification, ...current]
      )
    })
  }, [user?.id])

  const markNotificationRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' })
    setNotifications(current =>
      current.map(notification =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    )
  }

  const markAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PATCH' })
      setNotifications(current => current.map(notification => ({ ...notification, read: true })))
    } catch {
      setNotificationError('Notifications could not be updated. Please try again.')
    }
  }

  const openNotification = async (notification: ApiNotification) => {
    try {
      await markNotificationRead(notification.id)
      const taskId =
        typeof notification.payload?.taskId === 'string' ? notification.payload.taskId : undefined
      const projectId =
        typeof notification.payload?.projectId === 'string'
          ? notification.payload.projectId
          : undefined
      setIsNotificationOpen(false)
      if (taskId) navigate(`/tasks/${taskId}`)
      else if (projectId) navigate(`/projects/${projectId}`)
    } catch {
      setNotificationError('Notification could not be marked as read. Please try again.')
    }
  }

  const respondToProjectInvitation = async (
    notification: ApiNotification,
    response: 'accept' | 'decline'
  ) => {
    const invitationId =
      typeof notification.payload?.invitationId === 'string'
        ? notification.payload.invitationId
        : undefined
    if (!invitationId) return
    try {
      await respondToInvitation(invitationId, response)
      await markNotificationRead(notification.id)
      setNotificationError('')
      if (response === 'accept' && typeof notification.payload?.projectId === 'string')
        navigate(`/projects/${notification.payload.projectId}`)
    } catch {
      setNotificationError('Invitation response failed. Please try again.')
    }
  }

  const handleLogout = () => {
    logout()
    setIsUserMenuOpen(false)
  }

  const searchPanel = (
    <div className="animate-scale-in scrollbar-slim absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg md:w-[30rem]">
      {isSearchLoading && (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching...
        </div>
      )}
      {!isSearchLoading && searchError && (
        <p className="px-3 py-6 text-sm text-destructive">{searchError}</p>
      )}
      {!isSearchLoading && !searchError && searchResults && resultCount === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          No matching users, projects, or tasks.
        </p>
      )}

      {!isSearchLoading && !searchError && searchResults?.users.length ? (
        <section className="pb-1">
          <h3 className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Users className="h-3 w-3" />
            Users
          </h3>
          {searchResults.users.map(result => (
            <a
              key={result.id}
              href={`mailto:${result.email}`}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
            >
              <Avatar name={result.name} src={result.avatarUrl} size="xs" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{result.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{result.email}</span>
              </span>
            </a>
          ))}
        </section>
      ) : null}

      {!isSearchLoading && !searchError && searchResults?.projects.length ? (
        <section className="pb-1">
          <h3 className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <FolderKanban className="h-3 w-3" />
            Projects
          </h3>
          {searchResults.projects.map(result => (
            <button
              key={result.id}
              type="button"
              onClick={() => {
                navigate(`/projects/${result.id}`)
                clearSearch()
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
            >
              <span className="block truncate text-sm font-medium">{result.name}</span>
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {result.description || 'No description provided.'}
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {!isSearchLoading && !searchError && searchResults?.tasks.length ? (
        <section>
          <h3 className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <CheckSquare className="h-3 w-3" />
            Tasks
          </h3>
          {searchResults.tasks.map(result => (
            <button
              key={result.id}
              type="button"
              onClick={() => {
                navigate(`/tasks/${result.id}`)
                clearSearch()
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                {result.taskKey && (
                  <span className="shrink-0 font-mono text-xs text-primary">{result.taskKey}</span>
                )}
                <span className="truncate text-sm font-medium">{result.title}</span>
              </span>
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {result.description || 'No description provided.'}
              </span>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  )

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="flex h-14 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <SidebarTrigger className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" />

        <div className="hidden min-w-0 shrink items-baseline gap-2 md:flex">
          <span className="truncate text-sm font-semibold text-foreground">{pageContext}</span>
        </div>

        {/* Search grows to fill the bar, collapsing to an icon-width field on mobile. */}
        <div className="relative min-w-0 flex-1" role="search">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search projects, tasks, people"
            aria-label="Search projects, tasks, people"
            className="h-9 w-full rounded-md border border-transparent bg-muted/60 pl-9 pr-16 text-sm text-foreground shadow-none transition-colors placeholder:text-muted-foreground/80 hover:bg-muted focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/25 md:max-w-md"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border bg-card px-1.5 py-0.5 font-sans text-2xs font-medium text-muted-foreground sm:flex">
              <span className="text-[0.875em]">⌘</span>K
            </kbd>
          )}

          {searchQuery.trim() && searchPanel}
        </div>

        <nav aria-label="Header actions" className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              aria-expanded={isNotificationOpen}
              title="Notifications"
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            >
              <Bell />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-none text-primary-foreground ring-2 ring-background">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>

            {isNotificationOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsNotificationOpen(false)}
                  aria-hidden
                />
                <div className="animate-scale-in absolute right-0 z-50 mt-2 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">Notifications</h3>
                      {unreadCount > 0 && (
                        <Badge variant="primary" size="sm">
                          {unreadCount} new
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={unreadCount === 0}
                      onClick={() => void markAllNotificationsRead()}
                    >
                      <CheckCheck />
                      Mark all read
                    </Button>
                  </div>

                  <div className="scrollbar-slim max-h-[24rem] overflow-y-auto">
                    {notificationError && (
                      <p className="border-b px-4 py-3 text-sm text-destructive">
                        {notificationError}
                      </p>
                    )}
                    {isNotificationsLoading && (
                      <p
                        role="status"
                        className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading notifications...
                      </p>
                    )}
                    {!isNotificationsLoading &&
                      !notificationError &&
                      notifications.length === 0 && (
                        <div className="px-4 py-10 text-center">
                          <Bell className="mx-auto h-6 w-6 text-muted-foreground/50" />
                          <p className="mt-3 text-sm font-medium">No notifications yet</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Updates about your tasks and projects appear here.
                          </p>
                        </div>
                      )}
                    {notifications.map(notification => {
                      const invitationId =
                        notification.type === 'project_invite' &&
                        typeof notification.payload?.invitationId === 'string'
                          ? notification.payload.invitationId
                          : undefined
                      const isPendingInvitation =
                        notification.type === 'project_invite' && Boolean(invitationId)
                      return (
                        <div
                          key={notification.id}
                          className={cn(
                            'border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50',
                            !notification.read && 'bg-primary-soft/40'
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={cn(
                                'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                notification.read ? 'bg-muted-foreground/30' : 'bg-primary'
                              )}
                              aria-hidden
                            />
                            <button
                              type="button"
                              onClick={() => void openNotification(notification)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p
                                className={cn(
                                  'text-sm leading-5',
                                  !notification.read && 'font-medium'
                                )}
                              >
                                {notification.title}
                              </p>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {notification.message}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground/80">
                                <time
                                  dateTime={notification.createdAt}
                                  title={formatDateTime(notification.createdAt)}
                                >
                                  {formatRelativeDateTime(notification.createdAt)}
                                </time>
                              </p>
                            </button>
                          </div>
                          {isPendingInvitation && (
                            <div className="mt-2.5 flex gap-2 pl-4">
                              <Button
                                type="button"
                                size="xs"
                                onClick={() =>
                                  void respondToProjectInvitation(notification, 'accept')
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  void respondToProjectInvitation(notification, 'decline')
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="hidden sm:block">
            <ModeToggle />
          </div>

          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              aria-label="Open user menu"
              aria-expanded={isUserMenuOpen}
              className="flex h-9 items-center gap-1 rounded-md pl-1 pr-0.5 transition-colors hover:bg-accent sm:pr-1.5"
            >
              <Avatar name={user?.name || 'User'} src={user?.avatarUrl} size="sm" />
              <ChevronDown
                className={cn(
                  'hidden h-3.5 w-3.5 text-muted-foreground transition-transform sm:block',
                  isUserMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {isUserMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsUserMenuOpen(false)}
                  aria-hidden
                />
                <div className="animate-scale-in absolute right-0 z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
                  <div className="flex items-center gap-2.5 border-b px-3 py-3">
                    <Avatar name={user?.name || 'User'} src={user?.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                  <div className="p-1">
                    <Link
                      to="/settings"
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
