import { useParams } from 'react-router-dom'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { ProjectActivityTimeline } from '@/components/projects/ProjectActivityTimeline'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/States'

export function ActivityPage() {
  const { id } = useParams<{ id: string }>()

  if (!id)
    return (
      <EmptyState title="Project not found" description="This project may have been deleted." />
    )

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', to: '/projects' },
          { label: 'Project', to: `/projects/${id}` },
          { label: 'Activity' },
        ]}
        title="Activity"
        description="A chronological audit trail of task, discussion, and GitHub events."
      />
      <ProjectTabs projectId={id} active="activity" />
      <ProjectActivityTimeline projectId={id} />
    </div>
  )
}
