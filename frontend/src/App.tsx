import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { LandingPage } from '@/pages/landing/LandingPage'
import { ProjectsPage } from '@/pages/projects/ProjectsPage'
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage'
import { TasksPage } from '@/pages/tasks/TasksPage'
import { MyTasksPage } from '@/pages/tasks/MyTasksPage'
import { DiscussionsPage } from '@/pages/discussions/DiscussionsPage'
import { ProjectDiscussionPage } from '@/pages/discussions/ProjectDiscussionPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { TaskDetailPage } from '@/pages/tasks/TaskDetailPage'
import { KanbanPage } from '@/pages/tasks/KanbanPage'
import { ActivityPage } from '@/pages/projects/ActivityPage'
import { AnalyticsPage } from '@/pages/projects/AnalyticsPage'
import { HealthPage } from '@/pages/projects/HealthPage'
import { TimelinePage } from '@/pages/projects/TimelinePage'
import { ThemeProvider } from '@/components/theme-provider'

function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="synergysphere-ui-theme">
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      </ThemeProvider>
    )
  }

  if (!user) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="synergysphere-ui-theme">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="synergysphere-ui-theme">
      <Layout>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/tasks" element={<TasksPage />} />
          <Route path="/projects/:id/kanban" element={<KanbanPage />} />
          <Route path="/projects/:id/timeline" element={<TimelinePage />} />
          <Route path="/projects/:id/health" element={<HealthPage />} />
          <Route path="/projects/:id/activity" element={<ActivityPage />} />
          <Route path="/projects/:id/analytics" element={<AnalyticsPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/projects/:id/discussions" element={<ProjectDiscussionPage />} />
          <Route path="/my-tasks" element={<MyTasksPage />} />
          <Route path="/discussions" element={<DiscussionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </ThemeProvider>
  )
}

export default App
