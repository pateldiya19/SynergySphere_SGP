import { ApiTask } from '@/lib/api'
import { joinProjectRoom, onTaskEvent } from '@/lib/socket'

type TaskListUpdater = (update: (current: ApiTask[]) => ApiTask[]) => void

export function subscribeToTaskStatusUpdates(
  tasks: ApiTask[],
  updateTasks: TaskListUpdater
): () => void {
  const projectIds = [
    ...new Set(
      tasks
        .map(task => (typeof task.projectId === 'string' ? task.projectId : task.projectId?.id))
        .filter((projectId): projectId is string => Boolean(projectId))
    ),
  ]
  const leaveProjectRooms = projectIds.map(projectId => joinProjectRoom(projectId))
  const stopListening = onTaskEvent(event => {
    const updatedTask = event?.task
    const taskId = updatedTask?.id || updatedTask?._id || event?.taskId
    if (!taskId || !updatedTask) return

    updateTasks(current =>
      current.map(task => (task.id === String(taskId) ? { ...task, ...updatedTask } : task))
    )
  })

  return () => {
    stopListening()
    leaveProjectRooms.forEach(leave => leave())
  }
}
