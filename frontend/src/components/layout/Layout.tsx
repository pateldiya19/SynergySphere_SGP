import { useLocation } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <Header />
        <main className="min-w-0 flex-1">
          {/* Keyed on pathname so each route animates in, and so scroll-linked
              state from the previous page cannot bleed into the next. */}
          <div
            key={location.pathname}
            className="animate-rise mx-auto w-full max-w-[90rem] px-4 pb-24 pt-5 sm:px-6 sm:pt-6 md:pb-10 lg:px-8"
          >
            {children}
          </div>
        </main>
        <BottomNav />
      </SidebarInset>
    </SidebarProvider>
  )
}
