import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Toast {
  id: string
  title?: string
  description?: string
  type?: 'default' | 'success' | 'error' | 'warning'
  duration?: number
}

interface ToastProps extends Toast {
  onClose: (id: string) => void
}

const typeStyles = {
  default: 'border-border bg-popover text-popover-foreground',
  success: 'border-success/30 bg-success-soft text-foreground',
  error: 'border-destructive/30 bg-destructive-soft text-foreground',
  warning: 'border-warning/30 bg-warning-soft text-foreground',
} as const

const typeIcons = {
  default: { Icon: Info, className: 'text-info' },
  success: { Icon: CheckCircle2, className: 'text-success' },
  error: { Icon: XCircle, className: 'text-destructive' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
} as const

export function ToastComponent({
  id,
  title,
  description,
  type = 'default',
  duration = 5000,
  onClose,
}: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  const { Icon, className: iconClassName } = typeIcons[type]

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn(
        'animate-slide-up pointer-events-auto flex items-start gap-3 rounded-lg border p-3.5 shadow-lg',
        typeStyles[type]
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClassName)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold leading-5">{title}</p>}
        {description && (
          <p className={cn('text-sm leading-5 text-muted-foreground', title && 'mt-0.5')}>
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onClose(id)}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

interface ToastProviderProps {
  children: React.ReactNode
}

type ToastContextValue = {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 11)
    // Cap the stack so a burst of events cannot cover the viewport.
    setToasts(prev => [...prev, { ...toast, id }].slice(-4))
  }, [])

  const value = React.useMemo(
    () => ({ toasts, addToast, removeToast }),
    [toasts, addToast, removeToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm"
      >
        {toasts.map(toast => (
          <ToastComponent key={toast.id} {...toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
