import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
} as const

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  /** Sticky action row pinned to the bottom of the dialog. */
  footer?: React.ReactNode
  size?: keyof typeof sizeClasses
  className?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  const titleId = React.useId()
  const descriptionId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previouslyFocused = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', handleEscape)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog so keyboard users land in the right place.
    const focusTarget = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'
    )
    focusTarget?.focus()

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="animate-in fixed inset-0 bg-foreground/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'animate-slide-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border bg-card shadow-xl sm:rounded-xl',
          sizeClasses[size],
          className
        )}
      >
        {title && (
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold leading-tight">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
