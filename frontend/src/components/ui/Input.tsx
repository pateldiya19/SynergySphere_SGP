import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id || generatedId
    const descriptionId = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium leading-none text-foreground"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            aria-invalid={error ? true : undefined}
            aria-describedby={descriptionId}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
              'file:border-0 file:bg-transparent file:text-sm file:font-medium',
              'placeholder:text-muted-foreground/75',
              'hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
              'disabled:cursor-not-allowed disabled:opacity-60',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              error &&
                'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={descriptionId} className="text-sm text-destructive">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

/** Textarea sharing the Input surface, for descriptions and comments. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const generatedId = React.useId()
    const textareaId = id || generatedId
    const descriptionId = error
      ? `${textareaId}-error`
      : helperText
      ? `${textareaId}-helper`
      : undefined

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium leading-none text-foreground"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          className={cn(
            'flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
            'placeholder:text-muted-foreground/75',
            'hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error &&
              'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
            className
          )}
          {...props}
        />
        {error && (
          <p id={descriptionId} className="text-sm text-destructive">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

/** Select sharing the Input surface. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, id, children, ...props }, ref) => {
    const generatedId = React.useId()
    const selectId = id || generatedId
    const descriptionId = error
      ? `${selectId}-error`
      : helperText
      ? `${selectId}-helper`
      : undefined

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium leading-none text-foreground"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors',
            'hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error && 'border-destructive',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p id={descriptionId} className="text-sm text-destructive">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Input, Textarea, Select }
