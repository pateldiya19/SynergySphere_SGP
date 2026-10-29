import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/components/ui/Toast'
import { apiRequest, ApiProject } from '@/lib/api'
import { ProjectDiscussion } from '@/components/discussions/ProjectDiscussion'
import { Button } from '@/components/ui/Button'

export function DiscussionsPage() {
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [projectId, setProjectId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { addToast } = useToast()

  const selectedProject = useMemo(
    () => projects.find(project => project.id === projectId) || null,
    [projects, projectId]
  )

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const result = await apiRequest<ApiProject[]>('/api/projects')
        setProjects(result || [])
        if (result?.[0]) setProjectId(current => current || result[0].id)
      } catch {
        setLoadError('Unable to load projects. Please try again.')
        addToast({
          title: 'Unable to load projects',
          description: 'Please try again.',
          type: 'error',
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadProjects()
  }, [])

  if (isLoading) {
    return (
      <p role="status" className="py-12 text-center text-sm text-muted-foreground">
        Loading discussions...
      </p>
    )
  }

  if (loadError)
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-lg border border-destructive/30 p-8 text-center"
      >
        <h1 className="font-semibold">Unable to load discussions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    )

  if (!projects.length) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Discussions</h1>
          <p className="text-muted-foreground">Team conversations and project discussions</p>
        </div>
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          You are not a member of any projects yet.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Discussions</h1>
          <p className="text-muted-foreground">Team conversations and project discussions</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={projectId}
            onChange={event => setProjectId(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {selectedProject && (
            <Link
              to={`/projects/${selectedProject.id}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Open project
            </Link>
          )}
        </div>
      </div>

      {projectId && <ProjectDiscussion projectId={projectId} />}
    </div>
  )
}
