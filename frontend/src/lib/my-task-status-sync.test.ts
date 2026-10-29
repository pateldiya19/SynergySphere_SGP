import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as socket from '@/lib/socket'
import { subscribeToTaskStatusUpdates } from '@/lib/my-task-status-sync'

let eventHandler: ((event: any) => void) | undefined
const leaveProjectRoom = vi.fn()
const stopListening = vi.fn()

describe('my task status realtime sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandler = undefined
    vi.spyOn(socket, 'joinProjectRoom').mockReturnValue(leaveProjectRoom)
    vi.spyOn(socket, 'onTaskEvent').mockImplementation((handler: (event: any) => void) => {
      eventHandler = handler
      return stopListening
    })
  })

  it('reflects GitHub opened and merged status events without reloading', () => {
    let tasks: any[] = [
      {
        id: 'task-42',
        projectId: { id: 'project-1', name: 'Web' },
        status: 'todo',
      },
    ]
    const setTasks = (update: (current: any[]) => any[]) => {
      tasks = update(tasks)
    }

    const unsubscribe = subscribeToTaskStatusUpdates(tasks, setTasks)
    eventHandler?.({
      projectId: 'project-1',
      source: 'github',
      task: { id: 'task-42', taskKey: 'TASK-42', status: 'in_progress' },
    })
    expect(tasks[0].status).toBe('in_progress')

    eventHandler?.({
      projectId: 'project-1',
      source: 'github',
      task: { id: 'task-42', taskKey: 'TASK-42', status: 'done' },
    })
    expect(tasks[0].status).toBe('done')
    expect(socket.joinProjectRoom).toHaveBeenCalledWith('project-1')

    unsubscribe()
    expect(stopListening).toHaveBeenCalledOnce()
    expect(leaveProjectRoom).toHaveBeenCalledOnce()
  })
})
