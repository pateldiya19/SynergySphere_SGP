import * as React from 'react'
import { cn, getInitials } from '@/lib/utils'

const sizeClasses = {
  xs: 'h-6 w-6 text-[0.625rem]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
} as const

interface AvatarProps {
  src?: string
  alt?: string
  name: string
  size?: keyof typeof sizeClasses
  /** Shows a presence dot in the corner. */
  online?: boolean
  className?: string
}

/**
 * Initials-first avatar. Falls back from image to initials, and derives a
 * stable tint from the name so people are visually distinguishable.
 */
export function Avatar({ src, alt, name, size = 'md', online, className }: AvatarProps) {
  const [imageError, setImageError] = React.useState(false)

  // Deterministic hue per person — same name always gets the same tint.
  const hue = React.useMemo(() => {
    let hash = 0
    for (let index = 0; index < name.length; index += 1) {
      hash = (hash * 31 + name.charCodeAt(index)) % 360
    }
    return hash
  }, [name])

  const showImage = Boolean(src) && !imageError

  return (
    <span className={cn('relative inline-flex shrink-0', className)} title={name}>
      <span
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-inset ring-foreground/[0.06]',
          sizeClasses[size]
        )}
        style={
          showImage
            ? undefined
            : {
                backgroundColor: `hsl(${hue} 52% 92%)`,
                color: `hsl(${hue} 60% 28%)`,
              }
        }
      >
        {showImage ? (
          <img
            src={src}
            alt={alt || name}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span aria-hidden>{getInitials(name)}</span>
        )}
      </span>
      {online !== undefined && (
        <span
          title={online ? 'Online' : 'Offline'}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-card',
            size === 'xs' || size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
            online ? 'bg-success' : 'bg-muted-foreground/40'
          )}
        />
      )}
    </span>
  )
}

/** Overlapping avatar row with a "+N" overflow chip. */
export function AvatarGroup({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: { name: string; avatarUrl?: string }[]
  max?: number
  size?: keyof typeof sizeClasses
  className?: string
}) {
  const visible = people.slice(0, max)
  const overflow = people.length - visible.length

  return (
    <div
      className={cn('flex items-center -space-x-2', className)}
      role="group"
      aria-label={`${people.length} ${people.length === 1 ? 'member' : 'members'}: ${people
        .map(person => person.name)
        .join(', ')}`}
    >
      {visible.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          src={person.avatarUrl}
          size={size}
          className="ring-2 ring-card [&>span]:ring-0"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card',
            sizeClasses[size]
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
