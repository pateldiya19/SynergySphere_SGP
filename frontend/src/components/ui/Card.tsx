import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva(
  // `min-w-0` keeps a card from forcing its grid or flex parent wider than the
  // viewport: without it, grid items default to `min-width: auto` and long
  // content inside the card causes page-level horizontal scroll on mobile.
  'min-w-0 rounded-lg border bg-card text-card-foreground',
  {
    variants: {
      elevation: {
        flat: 'shadow-none',
        xs: 'shadow-xs',
        sm: 'shadow-sm',
        md: 'shadow-md',
      },
      interactive: {
        true: 'transition-all duration-150 hover:border-primary/35 hover:shadow-md',
        false: '',
      },
    },
    defaultVariants: {
      elevation: 'xs',
      interactive: false,
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ elevation, interactive }), className)} {...props} />
  )
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-wrap items-start justify-between gap-3 px-5 py-4', className)}
      {...props}
    />
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn('text-base font-semibold leading-tight', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('mt-1 text-sm text-muted-foreground', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 pb-5', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-wrap items-center gap-3 border-t px-5 py-3.5', className)}
      {...props}
    />
  )
)
CardFooter.displayName = 'CardFooter'

/** Section heading used inside cards and between page blocks. */
export function SectionHeading({
  title,
  description,
  eyebrow,
  action,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h2 className={cn('text-lg font-semibold tracking-tight', eyebrow && 'mt-1')}>{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

export { cardVariants }
