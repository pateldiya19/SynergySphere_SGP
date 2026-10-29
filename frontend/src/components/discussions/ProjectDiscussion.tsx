import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { apiRequest, ApiUser } from '@/lib/api'
import { emitDiscussionTyping, getSocket, joinProjectRoom, onDiscussionTyping } from '@/lib/socket'
import { useAuth } from '@/providers/AuthProvider'
import { cn, formatCompactDateTime } from '@/lib/utils'

export type DiscussionReply = {
  id: string
  threadId: string
  authorId: string
  author?: ApiUser
  body: string
  createdAt: string
  updatedAt: string
}

export type DiscussionThread = {
  id: string
  projectId: string
  title: string
  authorId: string
  author?: ApiUser
  createdAt: string
  updatedAt: string
  replyCount: number
  lastReplyAt?: string
  replies: DiscussionReply[]
}

export function formatMessageTime(value: string | Date) {
  return formatCompactDateTime(value)
}

function sortThreads(threads: DiscussionThread[]) {
  return [...threads].sort((a, b) => {
    const aTime = new Date(a.lastReplyAt || a.createdAt).getTime()
    const bTime = new Date(b.lastReplyAt || b.createdAt).getTime()
    return bTime - aTime
  })
}

export function ProjectDiscussion({ projectId }: { projectId: string }) {
  const [threads, setThreads] = useState<DiscussionThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newThread, setNewThread] = useState({ title: '', body: '' })
  const [message, setMessage] = useState('')
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({})
  const { addToast } = useToast()
  const { user: currentUser } = useAuth()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const typingTimerRef = useRef<number | null>(null)

  const activeThread = useMemo(
    () => threads.find(thread => thread.id === activeThreadId) || null,
    [threads, activeThreadId]
  )

  const loadThreads = useCallback(async () => {
    if (!projectId) return
    try {
      setIsLoading(true)
      setLoadError('')
      const result = await apiRequest<DiscussionThread[]>(`/api/discussions/project/${projectId}`)
      const loaded = sortThreads(result || [])
      setThreads(loaded)
      setActiveThreadId(current => {
        if (current && loaded.some(thread => thread.id === current)) return current
        return loaded[0]?.id ?? null
      })
    } catch {
      setLoadError('Unable to load discussions. Please try again.')
      addToast({
        title: 'Unable to load discussion',
        description: 'Please try again.',
        type: 'error',
      })
      setThreads([])
      setActiveThreadId(null)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, addToast])

  useEffect(() => {
    setThreads([])
    setActiveThreadId(null)
    void loadThreads()
  }, [projectId])

  // Live updates: everyone viewing this project shares a Socket.io room.
  useEffect(() => {
    if (!projectId) return

    const leaveRoom = joinProjectRoom(projectId)
    const socket = getSocket()

    const onThreadCreated = (payload: { projectId: string; thread: DiscussionThread }) => {
      if (payload.projectId !== projectId) return
      setThreads(current => {
        if (current.some(thread => thread.id === payload.thread.id)) return current
        return sortThreads([...current, payload.thread])
      })
    }

    const onReplyCreated = (payload: {
      projectId: string
      threadId: string
      reply: DiscussionReply
    }) => {
      if (payload.projectId !== projectId) return
      setThreads(current =>
        sortThreads(
          current.map(thread => {
            if (thread.id !== payload.threadId) return thread
            if (thread.replies?.some(reply => reply.id === payload.reply.id)) return thread
            return {
              ...thread,
              replies: [...(thread.replies || []), payload.reply],
              replyCount: (thread.replyCount || 0) + 1,
              lastReplyAt: payload.reply.createdAt,
            }
          })
        )
      )
    }

    socket.on('discussion:thread-created', onThreadCreated)
    socket.on('discussion:reply-created', onReplyCreated)
    const stopTyping = onDiscussionTyping(payload => {
      if (payload.projectId !== projectId) return
      const key = `${payload.threadId}:${payload.user.id}`
      setTypingUsers(current => {
        const next = { ...current }
        if (payload.isTyping) next[key] = payload.user.name
        else delete next[key]
        return next
      })
    })

    return () => {
      socket.off('discussion:thread-created', onThreadCreated)
      socket.off('discussion:reply-created', onReplyCreated)
      stopTyping()
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      leaveRoom()
    }
  }, [projectId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeThreadId, activeThread?.replies?.length])

  const createThread = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!projectId || !newThread.title.trim() || !newThread.body.trim()) return

    setIsCreating(true)
    try {
      const created = await apiRequest<DiscussionThread>(`/api/discussions/project/${projectId}`, {
        method: 'POST',
        body: JSON.stringify({ title: newThread.title.trim(), body: newThread.body.trim() }),
      })

      setThreads(current =>
        current.some(thread => thread.id === created.id)
          ? sortThreads(current)
          : sortThreads([...current, created])
      )
      setActiveThreadId(created.id)
      setShowCreateModal(false)
      setNewThread({ title: '', body: '' })
      addToast({ title: 'Discussion started', description: created.title, type: 'success' })
    } catch (error: any) {
      addToast({ title: 'Unable to start discussion', description: error.message, type: 'error' })
    } finally {
      setIsCreating(false)
    }
  }

  const sendMessage = async () => {
    const body = message.trim()
    if (!body || !activeThreadId || !projectId) return

    emitDiscussionTyping(projectId, activeThreadId, false)

    setIsSending(true)
    try {
      const reply = await apiRequest<DiscussionReply>(
        `/api/discussions/project/${projectId}/${activeThreadId}/replies`,
        { method: 'POST', body: JSON.stringify({ body }) }
      )

      setThreads(current =>
        sortThreads(
          current.map(thread => {
            if (thread.id !== activeThreadId) return thread
            if (thread.replies?.some(existing => existing.id === reply.id)) return thread
            return {
              ...thread,
              replies: [...(thread.replies || []), reply],
              replyCount: (thread.replyCount || 0) + 1,
              lastReplyAt: reply.createdAt,
            }
          })
        )
      )
      setMessage('')
    } catch (error: any) {
      addToast({ title: 'Message not sent', description: error.message, type: 'error' })
    } finally {
      setIsSending(false)
    }
  }

  const handleMessageChange = (value: string) => {
    setMessage(value)
    if (!activeThreadId || !projectId) return
    emitDiscussionTyping(projectId, activeThreadId, value.trim().length > 0)
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(
      () => emitDiscussionTyping(projectId, activeThreadId, false),
      1200
    )
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading discussions..." />
  }
  if (loadError) {
    return (
      <ErrorState
        title="Unable to load discussions"
        description="Please try again."
        onRetry={() => void loadThreads()}
      />
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Thread list */}
      <aside className="min-w-0 space-y-3">
        <Button className="w-full" onClick={() => setShowCreateModal(true)}>
          <Plus aria-hidden />
          New discussion
        </Button>

        <div className="space-y-2">
          {threads.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No discussions yet.
            </p>
          ) : (
            threads.map(thread => {
              const isActive = thread.id === activeThreadId
              const lastReply = thread.replies?.[thread.replies.length - 1]
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setActiveThreadId(thread.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-all',
                    isActive
                      ? 'border-primary/50 bg-primary-soft shadow-xs'
                      : 'bg-card hover:border-border hover:bg-accent/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-medium">{thread.title}</span>
                    <Badge variant="secondary" size="sm">
                      {thread.replyCount ?? thread.replies?.length ?? 0}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {lastReply
                      ? `${lastReply.author?.name || 'Someone'}: ${lastReply.body}`
                      : 'No messages yet'}
                  </p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {formatMessageTime(thread.lastReplyAt || thread.createdAt)}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Message pane */}
      <section className="flex min-h-[32rem] min-w-0 flex-col rounded-lg border bg-card shadow-xs">
        {!activeThread ? (
          <EmptyState
            variant="inline"
            icon={MessageSquare}
            title="No discussion selected"
            description="Start a discussion to chat with your project members."
            className="flex-1"
          />
        ) : (
          <>
            <header className="border-b px-4 py-3.5">
              <h2 className="font-semibold leading-tight">{activeThread.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Started by {activeThread.author?.name || 'Unknown user'} •{' '}
                {formatMessageTime(activeThread.createdAt)}
              </p>
            </header>

            <div
              className="scrollbar-slim flex-1 space-y-4 overflow-y-auto p-4"
              style={{ maxHeight: '52vh' }}
            >
              {activeThread.replies?.length ? (
                activeThread.replies.map(reply => {
                  const isMine = currentUser?.id === reply.authorId
                  return (
                    <div
                      key={reply.id}
                      className={`flex gap-3 ${isMine ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar
                        name={reply.author?.name || 'User'}
                        src={reply.author?.avatarUrl}
                        size="sm"
                      />
                      <div className={cn('min-w-0 max-w-[75%]', isMine && 'text-right')}>
                        <div
                          className={cn(
                            'flex items-baseline gap-2 text-xs text-muted-foreground',
                            isMine && 'justify-end'
                          )}
                        >
                          <span className="truncate font-medium text-foreground">
                            {isMine ? 'You' : reply.author?.name || 'Unknown user'}
                          </span>
                          <span>{formatMessageTime(reply.createdAt)}</span>
                        </div>
                        <div
                          className={cn(
                            // `break-words` stops a long URL or unbroken token
                            // from widening the whole conversation column.
                            'mt-1 inline-block whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-left text-sm',
                            isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                          )}
                        >
                          {reply.body}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              )}
              <div ref={messagesEndRef} />
            </div>

            {Object.entries(typingUsers).filter(([key]) => key.startsWith(`${activeThread.id}:`))
              .length > 0 && (
              <p className="px-4 pb-2 text-xs text-muted-foreground">
                {Object.entries(typingUsers)
                  .filter(([key]) => key.startsWith(`${activeThread.id}:`))
                  .map(([, name]) => name)
                  .join(', ')}{' '}
                typing...
              </p>
            )}

            <footer className="flex items-end gap-2 border-t p-3">
              <textarea
                value={message}
                onChange={event => handleMessageChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={2}
                placeholder="Write a message... (Enter to send, Shift+Enter for a new line)"
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!message.trim() || isSending}
              >
                <Send className="mr-2 h-4 w-4" />
                {isSending ? 'Sending...' : 'Send'}
              </Button>
            </footer>
          </>
        )}
      </section>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Start New Discussion"
        className="max-w-lg"
      >
        <form onSubmit={createThread} className="space-y-4">
          <Input
            label="Discussion Title"
            value={newThread.title}
            onChange={event => setNewThread(prev => ({ ...prev, title: event.target.value }))}
            placeholder="What would you like to discuss?"
            required
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">First message</label>
            <textarea
              value={newThread.body}
              onChange={event => setNewThread(prev => ({ ...prev, body: event.target.value }))}
              placeholder="Start the conversation..."
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              rows={4}
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!newThread.title.trim() || !newThread.body.trim() || isCreating}
              className="flex-1"
            >
              {isCreating ? 'Creating...' : 'Start Discussion'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
