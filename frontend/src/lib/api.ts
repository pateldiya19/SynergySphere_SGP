export function normalizeIds(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeIds)
  if (!value || typeof value !== 'object') return value

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeIds(entry)])
  )

  if (normalized.id === undefined && normalized._id !== undefined) {
    normalized.id = String(normalized._id)
  }
  delete normalized._id
  delete normalized.__v
  return normalized
}

const refreshTokenKey = 'refresh_token'
const pendingGetRequests = new Map<string, Promise<unknown>>()

let refreshRequest: Promise<string | null> | null = null

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshRequest) return refreshRequest

  const refreshToken = localStorage.getItem(refreshTokenKey)
  if (!refreshToken) return null

  refreshRequest = fetch('/api/auth/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async response => {
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Refresh token expired')

      const token = payload?.data?.accessToken ?? payload?.accessToken
      if (!token) throw new Error('Refresh token response did not include an access token')

      localStorage.setItem('auth_token', token)
      return token
    })
    .catch(() => {
      localStorage.removeItem('auth_token')
      localStorage.removeItem(refreshTokenKey)
      localStorage.removeItem('user_data')
      return null
    })
    .finally(() => {
      refreshRequest = null
    })

  return refreshRequest
}

/** Pagination metadata returned by paginated list endpoints. */
export type ApiPagination = {
  page: number
  limit: number
  total: number
  pages: number
}

/** The server caps `limit` at 100 per page (see QueryUtils.parseQueryOptions). */
export const MAX_PAGE_SIZE = 100

/**
 * Reads the pagination metadata that `performApiRequest` attaches to list
 * responses. It is stored as a non-enumerable property so it survives the
 * array without showing up in iteration or serialization.
 */
export function getPagination(result: unknown): ApiPagination | undefined {
  if (!result || typeof result !== 'object') return undefined
  return (result as { pagination?: ApiPagination }).pagination
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const [base, existing] = path.split('?')
  const search = new URLSearchParams(existing || '')
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${base}?${query}` : base
}

/** Fetch a single page of a paginated list endpoint. */
export async function fetchPage<T>(
  path: string,
  page = 1,
  limit = 20
): Promise<{ items: T[]; pagination?: ApiPagination }> {
  const items = await apiRequest<T[]>(withQuery(path, { page, limit }))
  return { items: items || [], pagination: getPagination(items) }
}

/**
 * Fetch every page of a paginated list endpoint.
 *
 * Views that aggregate over the whole collection — the Kanban board, the Gantt
 * timeline, project progress — are wrong if they only see the first page, so
 * they read the complete set rather than paginating.
 */
export async function fetchAllPages<T>(path: string, limit = MAX_PAGE_SIZE): Promise<T[]> {
  const first = await fetchPage<T>(path, 1, limit)
  const totalPages = first.pagination?.pages ?? 1
  if (totalPages <= 1) return first.items

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage<T>(path, index + 2, limit))
  )
  return [...first.items, ...rest.flatMap(result => result.items)]
}

export function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const token = localStorage.getItem('auth_token')
  const requestKey = method === 'GET' ? `${token || ''}:${path}` : undefined
  if (requestKey) {
    const pendingRequest = pendingGetRequests.get(requestKey)
    if (pendingRequest) return pendingRequest as Promise<T>
  }

  const requestPromise = performApiRequest<T>(path, options)
  if (!requestKey) return requestPromise

  pendingGetRequests.set(requestKey, requestPromise)
  return requestPromise.finally(() => {
    if (pendingGetRequests.get(requestKey) === requestPromise) pendingGetRequests.delete(requestKey)
  })
}

async function performApiRequest<T>(path: string, options: RequestInit): Promise<T> {
  const request = async (token: string | null) => {
    const headers = new Headers(options.headers)
    if (!(typeof FormData !== 'undefined' && options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(path, { ...options, headers })
  }

  let token = localStorage.getItem('auth_token')
  let response = await request(token)

  if (response.status === 401 && path !== '/api/auth/refresh-token') {
    token = await refreshAccessToken()
    if (token) response = await request(token)
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Request failed')
  }

  const normalized = normalizeIds(payload?.data ?? payload)
  if (payload?.pagination && normalized && typeof normalized === 'object') {
    if (Array.isArray(normalized)) {
      Object.defineProperty(normalized, 'pagination', {
        value: normalizeIds(payload.pagination),
        enumerable: false,
        configurable: true,
      })
    } else {
      normalized.pagination = normalizeIds(payload.pagination)
    }
  }

  return normalized as T
}

export type ApiUser = {
  id: string
  name: string
  email: string
  avatarUrl?: string
  /** DEPRECATED: a username the user typed in themselves. Display only, never trusted. */
  githubLogin?: string
  /**
   * OAuth-verified GitHub identity. The only GitHub identity that proof-of-work
   * verification trusts.
   */
  github?: {
    login: string
    avatarUrl?: string
    linkedAt?: string
  }
}

export type ApiProjectMember = {
  userId: string | ApiUser
  role: 'owner' | 'manager' | 'member'
  joinedAt?: string
}

export type ApiProject = {
  id: string
  name: string
  description?: string
  ownerId: string | ApiUser
  members: ApiProjectMember[]
  tags?: string[]
  deadline?: string
  createdAt: string
  updatedAt: string
  github?: {
    owner: string
    name: string
    url?: string
    repositoryId?: number
    /** Set when a webhook delivery last matched this project. */
    lastDeliveryAt?: string
    lastDeliveryEvent?: string
  }
}

export type ApiProjectAnalytics = {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  blockedTasks: number
  readyForReviewTasks: number
  changesRequestedTasks: number
  todoTasks: number
  completionPercentage: number
  overdueTasks: number
  tasksByPriority: { priority: 'urgent' | 'high' | 'medium' | 'low'; count: number }[]
  tasksByAssignee: { assignee: ApiUser | null; total: number; completed: number }[]
  completionOverTime: { date: string; count: number }[]
  memberWorkload: {
    member: {
      id: string
      name: string
      email: string
      avatarUrl?: string
      role: ApiProjectMember['role']
    }
    assignedTasks: number
    completedTasks: number
  }[]
}

export function getProjectAnalytics(projectId: string): Promise<ApiProjectAnalytics> {
  return apiRequest<ApiProjectAnalytics>(`/api/projects/${projectId}/analytics`)
}

export type ApiProjectHealthRisk = {
  key: string
  severity: 'high' | 'critical'
  title: string
  description: string
  tasks: Array<{ id: string; title: string; taskKey?: string }>
}

export type ApiProjectHealth = {
  status: 'Healthy' | 'At Risk' | 'Critical'
  assessedAt: string
  metrics: {
    totalTasks: number
    completedTasks: number
    overdueTasks: number
    blockedTasks: number
    dependencyBlockedTasks: number
    urgentDueSoonTasks: number
    unassignedTasks: number
    activeMembers: number
    inactivityDays: number
    lastActivityAt: string | null
    workloadImbalance: { memberId: string; memberName: string; activeTasks: number } | null
  }
  risks: ApiProjectHealthRisk[]
}

export function getProjectHealth(projectId: string): Promise<ApiProjectHealth> {
  return apiRequest<ApiProjectHealth>(`/api/projects/${projectId}/health`)
}

export type ApiTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'ready_for_review'
  | 'changes_requested'
  | 'done'

export type ApiTaskProof = {
  id: string
  type: 'github' | 'demo_url' | 'developer_notes'
  source: 'user' | 'github'
  submittedBy?: string | ApiUser
  submittedAt: string
  url?: string
  notes?: string
  repository?: string
  pullRequestNumber?: number
  pullRequestTitle?: string
  pullRequestAuthor?: string
  authorMatchesAssignee?: boolean
  state?: 'open' | 'closed' | 'merged'
  branch?: string
  commits?: Array<{ sha: string; message?: string; url?: string }>
  commitCount?: number
  filesChanged?: number
  additions?: number
  deletions?: number
  merged?: boolean
  lastUpdatedAt?: string
}

export type ApiTaskProofReview = {
  id: string
  reviewerId: string | ApiUser
  decision: 'approved' | 'changes_requested'
  comment?: string
  reviewedAt: string
}

export type ApiTask = {
  id: string
  projectId:
    | string
    | {
        id: string
        name: string
        ownerId?: string | ApiUser
        members?: ApiProjectMember[]
        github?: { owner?: string; name?: string; url?: string; repositoryId?: number }
      }
  title: string
  taskKey?: string
  description?: string
  requiresGitHubEvidence?: boolean
  assigneeId?: string | ApiUser
  dueDate?: string
  status: ApiTaskStatus
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  subtasks?: ApiSubtask[]
  dependencies?: ApiTaskDependency[]
  attachments?: ApiTaskAttachment[]
  proofOfWork?: ApiTaskProof[]
  proofReviews?: ApiTaskProofReview[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export type ApiTaskHistory = {
  id: string
  type: string
  source: 'user' | 'github' | 'system'
  description: string
  changes?: Record<string, { before?: unknown; after?: unknown }>
  metadata?: Record<string, any>
  createdAt: string
}

export type ApiTaskComment = {
  id: string
  taskId: string
  projectId: string
  authorId: string | ApiUser
  body: string
  editedAt?: string
  createdAt: string
  updatedAt?: string
}

export type ApiNotification = {
  id: string
  type: string
  title: string
  message: string
  payload?: Record<string, unknown>
  read: boolean
  createdAt: string
}

export type ApiInvitation = {
  id: string
  projectId: string | { id: string; name: string; description?: string }
  inviterId?: string | ApiUser
  inviteeId?: string | ApiUser
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export function getIncomingInvitations(): Promise<ApiInvitation[]> {
  return apiRequest<ApiInvitation[]>('/api/invitations')
}

export function getProjectInvitations(projectId: string): Promise<ApiInvitation[]> {
  return apiRequest<ApiInvitation[]>(`/api/projects/${projectId}/invitations`)
}

export function sendProjectInvitation(projectId: string, userId: string): Promise<ApiInvitation> {
  return apiRequest<ApiInvitation>(`/api/projects/${projectId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export function respondToInvitation(
  invitationId: string,
  response: 'accept' | 'decline'
): Promise<ApiInvitation> {
  return apiRequest<ApiInvitation>(`/api/invitations/${invitationId}/${response}`, {
    method: 'PATCH',
  })
}

export type ApiSearchResult = {
  users: ApiUser[]
  projects: ApiProject[]
  tasks: ApiTask[]
  pagination?: Record<
    string,
    { page: number; limit: number; total: number; pages: number } | number
  >
}

export type GlobalSearchType = 'all' | 'users' | 'projects' | 'tasks'

export function searchGlobal(
  query: string,
  type: GlobalSearchType = 'all',
  page = 1,
  limit = 10
): Promise<ApiSearchResult> {
  const params = new URLSearchParams({
    q: query.trim(),
    type,
    page: String(page),
    limit: String(limit),
  })
  return apiRequest<ApiSearchResult>(`/api/search?${params.toString()}`)
}

export type ApiProjectActivity = {
  id: string
  projectId: string
  eventType: string
  source: 'user' | 'github' | 'system'
  description: string
  actor?: ApiUser
  task?: { id: string; taskKey?: string; title?: string }
  timestamp: string
  metadata?: Record<string, any>
  changes?: Record<string, { before?: unknown; after?: unknown }>
}

export async function getProjectActivity(
  projectId: string,
  page = 1,
  limit = 20
): Promise<{
  items: ApiProjectActivity[]
  pagination?: { page: number; limit: number; total: number; pages: number }
}> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  const items = await apiRequest<ApiProjectActivity[]>(
    `/api/projects/${projectId}/activity?${params.toString()}`
  )
  return {
    items: items || [],
    pagination: (
      items as ApiProjectActivity[] & {
        pagination?: { page: number; limit: number; total: number; pages: number }
      }
    ).pagination,
  }
}

export type ApiDashboardActivity = ApiProjectActivity & { project?: string }

export type ApiDashboardProject = ApiProject & {
  taskProgress: { total: number; done: number; open: number }
}

export type ApiDashboard = {
  tasks: ApiTask[]
  projects: ApiDashboardProject[]
  activities: ApiDashboardActivity[]
  notifications: ApiNotification[]
}

export function getDashboard(): Promise<ApiDashboard> {
  return apiRequest<ApiDashboard>('/api/dashboard')
}

export function cancelProjectInvitation(
  projectId: string,
  invitationId: string
): Promise<ApiInvitation> {
  return apiRequest<ApiInvitation>(`/api/projects/${projectId}/invitations/${invitationId}`, {
    method: 'DELETE',
  })
}

export type ApiSubtask = {
  id?: string
  title: string
  completed: boolean
}

export function updateTaskStatus(taskId: string, status: ApiTaskStatus): Promise<ApiTask> {
  return apiRequest<ApiTask>(`/api/tasks/${taskId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export type ApiTaskDependency = {
  id?: string
  taskKey?: string
  title: string
  status: ApiTask['status']
}

export function addTaskDependency(taskId: string, dependencyTaskId: string): Promise<ApiTask> {
  return apiRequest<ApiTask>(`/api/tasks/${taskId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependencyTaskId }),
  })
}

export function removeTaskDependency(taskId: string, dependencyTaskId: string): Promise<ApiTask> {
  return apiRequest<ApiTask>(`/api/tasks/${taskId}/dependencies/${dependencyTaskId}`, {
    method: 'DELETE',
  })
}

export type ApiTaskAttachment = {
  id: string
  filename: string
  size: number
  mimeType: string
  uploaderId: string | { id: string; name: string }
  uploadedAt: string
}

export function uploadTaskAttachment(taskId: string, file: File): Promise<ApiTaskAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<ApiTaskAttachment>(`/api/tasks/${taskId}/attachments`, {
    method: 'POST',
    body: formData,
  })
}

export function deleteTaskAttachment(taskId: string, attachmentId: string): Promise<null> {
  return apiRequest<null>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' })
}

export async function fetchTaskAttachment(taskId: string, attachmentId: string): Promise<Blob> {
  const path = `/api/tasks/${taskId}/attachments/${attachmentId}/download`
  const request = (token: string | null) =>
    fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  let response = await request(localStorage.getItem('auth_token'))
  if (response.status === 401) {
    const token = await refreshAccessToken()
    if (token) response = await request(token)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || payload?.message || 'Attachment could not be downloaded')
  }
  return response.blob()
}

export function submitTaskProof(
  taskId: string,
  proof: { type: ApiTaskProof['type']; url?: string; notes?: string }
): Promise<ApiTask> {
  return apiRequest<ApiTask>(`/api/tasks/${taskId}/proofs`, {
    method: 'POST',
    body: JSON.stringify(proof),
  })
}

export function reviewTaskProof(
  taskId: string,
  decision: ApiTaskProofReview['decision'],
  comment?: string
): Promise<ApiTask> {
  return apiRequest<ApiTask>(`/api/tasks/${taskId}/proofs/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, comment }),
  })
}
