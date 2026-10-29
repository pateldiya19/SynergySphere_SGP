import { io, Socket } from 'socket.io-client'
import { normalizeIds, ApiNotification } from '@/lib/api'

const noop = (): void => undefined

let socket: Socket | null = null
type RoomSubscription = {
  socket: Socket
  count: number
  join: () => void
  releaseTimer?: ReturnType<typeof setTimeout>
}
const projectRoomSubscriptions = new Map<string, RoomSubscription>()
const taskRoomSubscriptions = new Map<string, RoomSubscription>()

/**
 * Shared Socket.io connection. The backend keeps one room per project
 * (`project-<id>`), which is what `joinProjectRoom` subscribes to.
 */
export function getSocket(): Socket {
  if (!socket) {
    const url = import.meta.env.VITE_WS_URL || window.location.origin
    const token = localStorage.getItem('auth_token')
    socket = io(url, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
      autoConnect: true,
    })
  }
  return socket
}

function subscribeToRoom(
  roomId: string,
  joinEvent: 'join-project' | 'join-task',
  leaveEvent: 'leave-project' | 'leave-task',
  subscriptions: Map<string, RoomSubscription>
): () => void {
  // Nothing to unsubscribe from when there is no room to join.
  if (!roomId) return noop

  let subscription = subscriptions.get(roomId)
  if (subscription) {
    if (subscription.releaseTimer) clearTimeout(subscription.releaseTimer)
    subscription.releaseTimer = undefined
    subscription.count += 1
  } else {
    const activeSocket = getSocket()
    const join = () => activeSocket.emit(joinEvent, roomId)
    subscription = { socket: activeSocket, count: 1, join }
    subscriptions.set(roomId, subscription)
    activeSocket.on('connect', join)
    if (activeSocket.connected) join()
  }

  let released = false
  return () => {
    if (released) return
    released = true
    const currentSubscription = subscriptions.get(roomId)
    if (!currentSubscription || currentSubscription !== subscription) return
    currentSubscription.count -= 1
    if (currentSubscription.count > 0) return

    currentSubscription.releaseTimer = setTimeout(() => {
      if (currentSubscription.count > 0 || subscriptions.get(roomId) !== currentSubscription) return
      currentSubscription.socket.off('connect', currentSubscription.join)
      if (currentSubscription.socket.connected) currentSubscription.socket.emit(leaveEvent, roomId)
      subscriptions.delete(roomId)
    }, 0)
  }
}

export function joinProjectRoom(projectId: string): () => void {
  return subscribeToRoom(projectId, 'join-project', 'leave-project', projectRoomSubscriptions)
}

export function joinTaskRoom(taskId: string): () => void {
  return subscribeToRoom(taskId, 'join-task', 'leave-task', taskRoomSubscriptions)
}

export function onTaskActivity(listener: (activity: any) => void): () => void {
  const activeSocket = getSocket()
  activeSocket.on('task:activity', listener)
  return () => activeSocket.off('task:activity', listener)
}

/** Live task-comment changes for everyone viewing the project. */
export function onTaskComment(
  listener: (event: {
    projectId: string
    taskId: string
    comment?: any
    commentId?: string
    kind: 'added' | 'updated' | 'deleted'
  }) => void
): () => void {
  const activeSocket = getSocket()
  const events = {
    'task:comment-added': 'added',
    'task:comment-updated': 'updated',
    'task:comment-deleted': 'deleted',
  } as const
  const handlers = Object.entries(events).map(([event, kind]) => {
    const handler = (payload: any) => listener({ ...payload, kind })
    activeSocket.on(event, handler)
    return () => activeSocket.off(event, handler)
  })
  return () => handlers.forEach(off => off())
}

export function onTaskEvent(listener: (event: any) => void): () => void {
  const activeSocket = getSocket()
  const events = [
    'task:created',
    'task:updated',
    'task:deleted',
    'task:status-changed',
    'task:attachment-changed',
  ]
  events.forEach(event => activeSocket.on(event, listener))
  return () => events.forEach(event => activeSocket.off(event, listener))
}

export function onProjectActivity(listener: (event: any) => void): () => void {
  const activeSocket = getSocket()
  const events = [
    'task:activity',
    'task:created',
    'task:updated',
    'task:deleted',
    'task:status-changed',
    'discussion:thread-created',
    'discussion:reply-created',
    'project:created',
    'project:updated',
    'project:deleted',
  ]
  events.forEach(event => activeSocket.on(event, listener))
  return () => events.forEach(event => activeSocket.off(event, listener))
}

export function onNotification(listener: (notification: ApiNotification) => void): () => void {
  const activeSocket = getSocket()
  const handler = (notification: unknown) => listener(normalizeIds(notification) as ApiNotification)
  activeSocket.on('notification:new', handler)
  return () => activeSocket.off('notification:new', handler)
}

export function onPresenceState(
  listener: (payload: { projectId: string; users: any[] }) => void
): () => void {
  const activeSocket = getSocket()
  activeSocket.on('presence:state', listener)
  return () => activeSocket.off('presence:state', listener)
}

export function onPresenceChanged(
  listener: (payload: { projectId: string; user: any; online: boolean }) => void
): () => void {
  const activeSocket = getSocket()
  activeSocket.on('presence:changed', listener)
  return () => activeSocket.off('presence:changed', listener)
}

export function onDiscussionTyping(
  listener: (payload: { projectId: string; threadId: string; user: any; isTyping: boolean }) => void
): () => void {
  const activeSocket = getSocket()
  activeSocket.on('discussion:typing', listener)
  return () => activeSocket.off('discussion:typing', listener)
}

export function emitDiscussionTyping(projectId: string, threadId: string, isTyping: boolean): void {
  getSocket().emit('discussion:typing', { projectId, threadId, isTyping })
}

export function disconnectSocket(): void {
  for (const subscriptions of [projectRoomSubscriptions, taskRoomSubscriptions]) {
    for (const subscription of subscriptions.values()) {
      if (subscription.releaseTimer) clearTimeout(subscription.releaseTimer)
      subscription.socket.off('connect', subscription.join)
    }
    subscriptions.clear()
  }
  socket?.disconnect()
  socket = null
}
