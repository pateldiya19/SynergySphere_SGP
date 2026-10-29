import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return formatDayMonth(date, true)
}

export function formatDateTime(date: string | Date) {
  const value = parseDate(date)
  return `${formatDayMonth(value, true)}, ${new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)}`
}

export function formatCompactDateTime(date: string | Date) {
  const value = parseDate(date)
  return `${formatDayMonth(value, false)}, ${new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)}`
}

export function formatRelativeDateTime(date: string | Date) {
  const value = parseDate(date)
  const difference = Date.now() - value.getTime()
  if (difference >= 0 && difference < 60_000) return 'Just now'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (
    value.getFullYear() === yesterday.getFullYear() &&
    value.getMonth() === yesterday.getMonth() &&
    value.getDate() === yesterday.getDate()
  ) {
    return 'Yesterday'
  }
  if (difference >= 0 && difference < 60 * 60_000) {
    const minutes = Math.floor(difference / 60_000)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }
  if (difference >= 0 && difference < 24 * 60 * 60_000) {
    const hours = Math.floor(difference / (60 * 60_000))
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  return formatDateTime(value)
}

export function formatStatus(value: string) {
  const labels: Record<string, string> = {
    todo: 'To do',
    in_progress: 'In progress',
    ready_for_review: 'Ready for Review',
    changes_requested: 'Changes Requested',
    done: 'Done',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  }
  if (labels[value]) return labels[value]
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function formatActivityLabel(eventType: string) {
  const labels: Record<string, string> = {
    TASK_CREATED: 'Task created',
    TASK_ASSIGNED: 'Task assigned',
    TASK_COMPLETED: 'Task completed',
    STATUS_CHANGED: 'Task status updated',
    PROOF_SUBMITTED: 'Proof submitted',
    PROOF_APPROVED: 'Proof approved',
    DISCUSSION_CREATED: 'Discussion started',
    DISCUSSION_REPLY_CREATED: 'Discussion reply posted',
    GIT_COMMIT: 'Commit detected',
    PULL_REQUEST_CREATED: 'Pull request opened',
    PULL_REQUEST_UPDATED: 'Pull request updated',
    PULL_REQUEST_CLOSED: 'Pull request closed',
    PULL_REQUEST_MERGED: 'Pull request merged',
  }
  if (labels[eventType]) return labels[eventType]
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, character => character.toUpperCase())
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function parseDate(date: string | Date) {
  if (date instanceof Date) return date
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  return new Date(date)
}

function formatDayMonth(date: string | Date, includeYear: boolean) {
  const value = parseDate(date)
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  }).formatToParts(value)
  const day = parts.find(part => part.type === 'day')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const year = parts.find(part => part.type === 'year')?.value
  return `${day} ${month}${year ? ` ${year}` : ''}`
}

export function formatRelativeTime(date: string | Date) {
  const now = new Date()
  const target = new Date(date)
  const diffInMs = target.getTime() - now.getTime()
  const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24))

  if (diffInDays < 0) {
    return `${Math.abs(diffInDays)} days overdue`
  } else if (diffInDays === 0) {
    return 'Due today'
  } else if (diffInDays === 1) {
    return 'Due tomorrow'
  } else {
    return `Due in ${diffInDays} days`
  }
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9)
}
