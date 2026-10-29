import { BarChart3, FolderKanban, ListTodo, LogOut, MessageSquare, Settings } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Link, useLocation } from 'react-router-dom'
import { LogoMark } from '@/components/brand/Logo'
import { useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'

const navigationGroups = [
  {
    title: 'Workspace',
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
      { title: 'Projects', url: '/projects', icon: FolderKanban },
      { title: 'My tasks', url: '/my-tasks', icon: ListTodo },
    ],
  },
  {
    title: 'Collaboration',
    items: [{ title: 'Discussions', url: '/discussions', icon: MessageSquare }],
  },
]

/** Active-item treatment: tinted surface, accent text, and a left rail. */
const navButtonClassName =
  'relative h-9 gap-2.5 rounded-md px-2.5 text-sidebar-foreground/75 transition-colors ' +
  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ' +
  'data-[active=true]:bg-sidebar-primary/10 data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary ' +
  'data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:-left-0.5 ' +
  'data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-sidebar-primary'

export function AppSidebar() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const isProjectDiscussion = /^\/projects\/[^/]+\/discussions(?:\/|$)/.test(location.pathname)

  const isActive = (url: string) => {
    if (url === '/projects') return location.pathname.startsWith(url) && !isProjectDiscussion
    if (url === '/discussions') return location.pathname.startsWith(url) || isProjectDiscussion
    return location.pathname === url
  }

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 rounded-md px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <LogoMark className="h-8 w-8 shrink-0" />
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-display text-sm font-semibold leading-tight text-sidebar-accent-foreground">
              SynergySphere
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="scrollbar-slim gap-0 px-2 py-3">
        {navigationGroups.map(group => (
          <SidebarGroup key={group.title} className="py-1">
            <SidebarGroupLabel className="h-7 px-2.5 text-2xs font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map(item => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className={navButtonClassName}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="mt-auto gap-1 border-t border-sidebar-border px-2 py-2.5">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location.pathname === '/settings'}
              tooltip="Settings"
              className={navButtonClassName}
            >
              <Link to="/settings">
                <Settings className="h-4 w-4 shrink-0" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              tooltip="Sign out"
              className="h-9 gap-2.5 rounded-md px-2.5 text-sidebar-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mt-1 flex min-w-0 items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2 py-2 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <Avatar name={user?.name || 'User'} src={user?.avatarUrl} size="sm" />
          <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
              {user?.name || 'User'}
            </span>
            <span className="truncate text-xs text-sidebar-foreground/55">{user?.email}</span>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
