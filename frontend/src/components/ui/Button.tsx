import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:translate-y-px',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:shadow-sm',
        destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        outline:
          'border border-input bg-card text-foreground shadow-xs hover:border-border hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        subtle: 'bg-primary-soft text-primary hover:bg-primary-soft/70',
        link: 'text-primary underline-offset-4 hover:underline active:translate-y-0',
        // Public/marketing surfaces only. Additive on purpose: the product UI
        // keeps `default`, so the brand refresh cannot leak into the dashboard.
        brand:
          'bg-gradient-to-r from-brand to-brand-accent text-brand-foreground shadow-sm transition-shadow hover:shadow-lg hover:shadow-brand/25 focus-visible:ring-brand/40',
        'brand-outline':
          'border border-brand/30 bg-transparent text-brand hover:border-brand/50 hover:bg-brand-soft focus-visible:ring-brand/40',
      },
      size: {
        default: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        sm: 'h-8 rounded-md px-3 text-[0.8125rem] [&_svg]:size-3.5',
        xs: 'h-7 rounded-md px-2.5 text-xs [&_svg]:size-3.5',
        lg: 'h-11 rounded-lg px-6 text-sm [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
        'icon-sm': 'h-8 w-8 rounded-md [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    // `asChild` renders the caller's element (e.g. a router Link) with button
    // styling; a spinner cannot be injected into an arbitrary child, so the
    // loading affordance only applies to real buttons.
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
          {children}
        </Slot>
      )
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
