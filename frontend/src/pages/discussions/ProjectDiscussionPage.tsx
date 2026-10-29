import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useToast } from '@/components/ui/Toast'
import { apiRequest, ApiProject } from '@/lib/api'
import { ProjectDiscussion } from '@/components/discussions/ProjectDiscussion'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Button } from '@/components/ui/Button'
import { formatCount } from '@/lib/utils'

export function ProjectDiscussionPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ApiProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { addToast } = useToast()

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setIsLoading(true)
      try {
        setProject(await apiRequest<ApiProject>(`/api/projects/${id}`))
      } catch {
        setLoadError('Unable to load this project. Please try again.')
        addToast({
          title: 'Unable to load project',
          description: 'Please try again.',
          type: 'error',
        })
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [id])

  if (isLoading)
    return (
      <p role="status" className="py-12 text-center text-sm text-muted-foreground">
        Loading discussion...
      </p>
    )
  if (loadError)
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-lg border border-destructive/30 p-8 text-center"
      >
        <h1 className="font-semibold">Unable to load project</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    )
  if (!project || !id)
    return <p className="py-12 text-center text-muted-foreground">Project not found.</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">
          Projects
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{project.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Discussion • {formatCount(project.members?.length || 0, 'member')}
        </p>
      </div>

      <ProjectTabs projectId={id} active="discussion" />

      <ProjectDiscussion projectId={id} />
    </div>
  )
}
