import { ApiTask } from '@/lib/api'

export type TimelineScale = 'week' | 'month'

export type TimelineRange = {
  start: Date
  end: Date
}

export type TimelineBar = {
  leftUnits: number
  widthUnits: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfWeek(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export function getTimelineRange(tasks: ApiTask[], now = new Date()): TimelineRange {
  const timestamps = [now.getTime()]
  for (const task of tasks) {
    const start = new Date(task.createdAt).getTime()
    if (Number.isFinite(start)) timestamps.push(start)
    const end = task.dueDate ? new Date(task.dueDate).getTime() : start + DAY_MS
    if (Number.isFinite(end)) timestamps.push(end)
  }
  const start = startOfWeek(new Date(Math.min(...timestamps)))
  start.setDate(start.getDate() - 7)
  const end = startOfWeek(new Date(Math.max(...timestamps)))
  end.setDate(end.getDate() + 14)
  return { start, end }
}

export function getTimelineBar(
  task: ApiTask,
  range: TimelineRange,
  scale: TimelineScale
): TimelineBar {
  const unitMs = DAY_MS * (scale === 'week' ? 1 : 7)
  const taskStart = new Date(task.createdAt).getTime()
  const due = task.dueDate ? new Date(task.dueDate).getTime() : taskStart + DAY_MS
  const taskEnd = Math.max(due, taskStart + DAY_MS)
  const rangeStart = range.start.getTime()
  const rangeEnd = range.end.getTime()
  const visibleStart = Math.max(taskStart, rangeStart)
  const visibleEnd = Math.min(taskEnd, rangeEnd)
  return {
    leftUnits: Math.max(0, (visibleStart - rangeStart) / unitMs),
    widthUnits: Math.max(0.35, (visibleEnd - visibleStart) / unitMs),
  }
}

export function getTimelineUnitCount(range: TimelineRange, scale: TimelineScale): number {
  return Math.ceil(
    (range.end.getTime() - range.start.getTime()) / (DAY_MS * (scale === 'week' ? 1 : 7))
  )
}

export function getTimelineDateAtUnit(
  range: TimelineRange,
  unit: number,
  scale: TimelineScale
): Date {
  const date = new Date(range.start)
  date.setDate(date.getDate() + unit * (scale === 'week' ? 1 : 7))
  return date
}

export function getTodayOffset(
  range: TimelineRange,
  scale: TimelineScale,
  now = new Date()
): number {
  return Math.max(
    0,
    (now.getTime() - range.start.getTime()) / (DAY_MS * (scale === 'week' ? 1 : 7))
  )
}
