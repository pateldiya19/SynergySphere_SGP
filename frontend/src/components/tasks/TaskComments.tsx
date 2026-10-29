import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquare, Pencil, Send, Trash2, X } from 'lucide-react'
import { apiRequest, ApiTaskComment, ApiUser } from '@/lib/api'
import { onTaskComment } from '@/lib/socket'
import { useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/utils'

const MAX_LENGTH = 2000

function author(comment: ApiTaskComment): ApiUser | undefined {
  return typeof comment.authorId === 'object' ? comment.authorId : undefined
}

export function TaskComments({ taskId, canModerate }: { taskId: string; canModerate: boolean }) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [comments, setComments] = useState<ApiTaskComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const listEndRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const result = await apiRequest<ApiTaskComment[]>(`/api/tasks/${taskId}/comments`)
      setComments(result || [])
    } catch {
      setComments([])
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  // Keep the thread live for everyone looking at the same task.
  useEffect(() => {
    return onTaskComment(event => {
      if (event.taskId !== taskId) return
      setComments(current => {
        if (event.kind === 'deleted') {
          return current.filter(comment => comment.id !== event.commentId)
        }
        if (!event.comment) return current
        const incoming = event.comment as ApiTaskComment
        const exists = current.some(comment => comment.id === incoming.id)
        if (event.kind === 'updated' || exists) {
          return current.map(comment => (comment.id === incoming.id ? incoming : comment))
        }
        return [...current, incoming]
      })
    })
  }, [taskId])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return

    setIsSending(true)
    try {
      const created = await apiRequest<ApiTaskComment>(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      // The socket echo may not reach the sender's own tab first, so add it here
      // and let the de-duplication above drop the duplicate if it arrives.
      setComments(current =>
        current.some(comment => comment.id === created.id) ? current : [...current, created]
      )
      setDraft('')
      listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch {
      addToast({ title: 'Comment could not be posted', type: 'error' })
    } finally {
      setIsSending(false)
    }
  }

  const handleSaveEdit = async (commentId: string) => {
    const body = editDraft.trim()
    if (!body) return
    try {
      const updated = await apiRequest<ApiTaskComment>(
        `/api/tasks/${taskId}/comments/${commentId}`,
        { method: 'PUT', body: JSON.stringify({ body }) }
      )
      setComments(current => current.map(comment => (comment.id === commentId ? updated : comment)))
      setEditingId(null)
    } catch {
      addToast({ title: 'Comment could not be updated', type: 'error' })
    }
  }

  const handleDelete = async (commentId: string) => {
    try {
      await apiRequest(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' })
      setComments(current => current.filter(comment => comment.id !== commentId))
    } catch {
      addToast({ title: 'Comment could not be deleted', type: 'error' })
    }
  }

  return (
    <Card elevation="xs">
      <CardHeader className="border-b">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <CardTitle>Comments</CardTitle>
          {comments.length > 0 && (
            <span className="text-sm text-muted-foreground">({comments.length})</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading comments…</p>
        ) : comments.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No comments yet"
            description="Ask a question or leave an update for the team."
          />
        ) : (
          <ul className="space-y-4">
            {comments.map(comment => {
              const writer = author(comment)
              const isMine = writer?.id === user?.id
              const isEditing = editingId === comment.id
              return (
                <li key={comment.id} className="flex gap-3">
                  <Avatar name={writer?.name || 'Unknown'} src={writer?.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium">{writer?.name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </span>
                      {comment.editedAt && (
                        <span className="text-xs text-muted-foreground">(edited)</span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editDraft}
                          onChange={e => setEditDraft(e.target.value)}
                          rows={3}
                          maxLength={MAX_LENGTH}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveEdit(comment.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X aria-hidden />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                        {comment.body}
                      </p>
                    )}

                    {!isEditing && (isMine || canModerate) && (
                      <div className="mt-1.5 flex gap-1">
                        {isMine && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(comment.id)
                              setEditDraft(comment.body)
                            }}
                          >
                            <Pencil aria-hidden />
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(comment.id)}
                        >
                          <Trash2 aria-hidden />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
            <div ref={listEndRef} />
          </ul>
        )}

        <form onSubmit={handleSubmit} className="space-y-2 border-t pt-4">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            maxLength={MAX_LENGTH}
            onKeyDown={e => {
              // Ctrl/Cmd+Enter submits, matching the discussion composer.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleSubmit(e)
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {draft.length}/{MAX_LENGTH} · Ctrl+Enter to post
            </span>
            <Button type="submit" loading={isSending} disabled={!draft.trim()}>
              <Send aria-hidden />
              Comment
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
