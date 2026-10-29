import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Edit,
  FolderKanban,
  Github,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { AvatarGroup } from '@/components/ui/Avatar'
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/Toast'
import { ApiPagination, apiRequest, ApiProject, fetchPage } from '@/lib/api'
import { LoadMore } from '@/components/ui/LoadMore'
import { formatCount, formatDate } from '@/lib/utils'

export function ProjectsPage() {
  const PAGE_SIZE = 12
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [pagination, setPagination] = useState<ApiPagination>()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingProject, setEditingProject] = useState<ApiProject | null>(null)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    tags: '',
    deadline: '',
    githubOwner: '',
    githubName: '',
  })
  const { addToast } = useToast()

  const loadProjects = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const { items, pagination: meta } = await fetchPage<ApiProject>('/api/projects', 1, PAGE_SIZE)
      setProjects(items)
      setPagination(meta)
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

  const loadMoreProjects = async () => {
    const nextPage = (pagination?.page ?? 1) + 1
    setIsLoadingMore(true)
    try {
      const { items, pagination: meta } = await fetchPage<ApiProject>(
        '/api/projects',
        nextPage,
        PAGE_SIZE
      )
      // De-duplicate: a project created between pages would otherwise shift
      // records across the page boundary and appear twice.
      setProjects(current => {
        const seen = new Set(current.map(project => project.id))
        return [...current, ...items.filter(project => !seen.has(project.id))]
      })
      setPagination(meta)
    } catch {
      addToast({
        title: 'Unable to load more projects',
        description: 'Please try again.',
        type: 'error',
      })
    } finally {
      setIsLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const openCreate = () => {
    setEditingProject(null)
    setForm({ name: '', description: '', tags: '', deadline: '', githubOwner: '', githubName: '' })
    setShowModal(true)
  }

  const openEdit = (project: ApiProject) => {
    setEditingProject(project)
    setForm({
      name: project.name,
      description: project.description || '',
      tags: project.tags?.join(', ') || '',
      deadline: project.deadline?.split('T')[0] || '',
      githubOwner: project.github?.owner || '',
      githubName: project.github?.name || '',
    })
    setShowModal(true)
  }

  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    const body = {
      name: form.name,
      description: form.description,
      tags: form.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
      ...(form.deadline ? { deadline: form.deadline } : {}),
      ...(form.githubOwner && form.githubName
        ? { github: { owner: form.githubOwner, name: form.githubName } }
        : {}),
    }
    try {
      if (editingProject)
        await apiRequest(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
      else await apiRequest('/api/projects', { method: 'POST', body: JSON.stringify(body) })
      setShowModal(false)
      await loadProjects()
      addToast({
        title: editingProject ? 'Project updated' : 'Project created',
        description: 'Changes have been saved.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({ title: 'Project could not be saved', description: error.message, type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const deleteProject = async (id: string) => {
    try {
      await apiRequest(`/api/projects/${id}`, { method: 'DELETE' })
      setProjects(current => current.filter(project => project.id !== id))
      addToast({
        title: 'Project deleted',
        description: 'The project was removed.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({ title: 'Project could not be deleted', description: error.message, type: 'error' })
    }
  }

  const visibleProjects = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return projects
    return projects.filter(
      project =>
        project.name.toLowerCase().includes(trimmed) ||
        (project.description || '').toLowerCase().includes(trimmed) ||
        (project.tags || []).some(tag => tag.toLowerCase().includes(trimmed))
    )
  }, [projects, query])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Every project you own or collaborate on."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            New project
          </Button>
        }
      />

      {!isLoading && !loadError && projects.length > 0 && (
        <div className="max-w-sm">
          <Input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter projects"
            aria-label="Filter projects"
            leftIcon={<Search />}
          />
        </div>
      )}

      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : loadError ? (
        <ErrorState
          title="Unable to load projects"
          description={loadError}
          onRetry={() => void loadProjects()}
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start assigning work and tracking progress."
          action={
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              Create project
            </Button>
          }
        />
      ) : visibleProjects.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching projects"
          description={`Nothing matches "${query.trim()}". Try a different search.`}
          action={
            <Button variant="outline" size="sm" onClick={() => setQuery('')}>
              Clear filter
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleProjects.map(project => {
              const members = (project.members || [])
                .map(member => (typeof member.userId === 'object' ? member.userId : undefined))
                .filter(Boolean)
                .map(member => ({ name: member!.name, avatarUrl: member!.avatarUrl }))

              return (
                <article
                  key={project.id}
                  className="group relative flex h-full flex-col rounded-lg border bg-card p-5 shadow-xs transition-all duration-150 hover:border-primary/35 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {project.tags?.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary" size="sm">
                          {tag}
                        </Badge>
                      ))}
                      {(project.tags?.length || 0) > 3 && (
                        <Badge variant="secondary" size="sm">
                          +{project.tags!.length - 3}
                        </Badge>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Options for ${project.name}`}
                          title="Project options"
                          className="relative z-10 -mr-1.5 -mt-1.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(project)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void deleteProject(project.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <h2 className="mt-3 text-base font-semibold leading-snug">
                    {/* Stretched link keeps the whole card clickable without nesting
                      the dropdown inside an anchor. */}
                    <Link
                      to={`/projects/${project.id}`}
                      className="after:absolute after:inset-0 after:content-[''] group-hover:text-primary"
                    >
                      {project.name}
                    </Link>
                  </h2>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">
                    {project.description || 'No description provided.'}
                  </p>

                  {project.github?.owner && project.github?.name && (
                    <p className="mt-3 inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Github className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate font-mono">
                        {project.github.owner}/{project.github.name}
                      </span>
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                    {members.length > 0 ? (
                      <AvatarGroup people={members} max={4} size="xs" />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {formatCount(project.members?.length || 0, 'member')}
                      </span>
                    )}
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                      <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time>
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
          {/* The filter is client-side, so only offer more pages on the full list. */}
          {!query.trim() && (
            <LoadMore
              pagination={pagination}
              loaded={projects.length}
              isLoading={isLoadingMore}
              onLoadMore={() => void loadMoreProjects()}
              noun="project"
              className="rounded-lg border bg-card shadow-xs"
            />
          )}
        </>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingProject ? 'Edit project' : 'Create project'}
        description={
          editingProject
            ? 'Update the project details and repository link.'
            : 'Set up a workspace for your team to collaborate in.'
        }
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="project-form" loading={isSaving}>
              {editingProject ? 'Save changes' : 'Create project'}
            </Button>
          </>
        }
      >
        <form id="project-form" onSubmit={saveProject} className="space-y-4">
          <Input
            label="Project name"
            value={form.name}
            onChange={event => setForm({ ...form, name: event.target.value })}
            placeholder="Website Revamp"
            required
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            rows={3}
            placeholder="What is this project about?"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Tags"
              value={form.tags}
              onChange={event => setForm({ ...form, tags: event.target.value })}
              placeholder="web, design"
              helperText="Comma separated"
            />
            <Input
              label="Deadline"
              type="date"
              value={form.deadline}
              onChange={event => setForm({ ...form, deadline: event.target.value })}
            />
          </div>

          <fieldset className="rounded-md border bg-muted/30 p-4">
            <legend className="flex items-center gap-1.5 px-1.5 text-sm font-medium">
              <Github className="h-3.5 w-3.5" aria-hidden />
              GitHub repository
            </legend>
            <p className="text-xs text-muted-foreground">
              Connecting a repository lets SynergySphere verify commits and pull requests as proof
              of work.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Owner"
                value={form.githubOwner}
                onChange={event => setForm({ ...form, githubOwner: event.target.value })}
                placeholder="organization or user"
              />
              <Input
                label="Repository"
                value={form.githubName}
                onChange={event => setForm({ ...form, githubName: event.target.value })}
                placeholder="repository-name"
              />
            </div>
          </fieldset>
        </form>
      </Modal>
    </div>
  )
}
