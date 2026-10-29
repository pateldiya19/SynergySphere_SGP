import { Link } from 'react-router-dom'
import { GitPullRequest, ShieldCheck, Users } from 'lucide-react'
import { Logo, LogoMark } from '@/components/brand/Logo'

const highlights = [
  {
    icon: ShieldCheck,
    title: 'Verified proof of work',
    description: 'Approve tasks against real commits and pull requests, not just a checkbox.',
  },
  {
    icon: GitPullRequest,
    title: 'GitHub built in',
    description: 'Branches, commits, and PRs attach themselves to the right task automatically.',
  },
  {
    icon: Users,
    title: 'Clear ownership',
    description: 'Assignees, reviewers, and project managers always know the next action.',
  },
]

/**
 * Shared shell for sign in and sign up.
 *
 * The brand panel uses the indigo/violet brand tokens rather than `--primary`,
 * so the public surface can look like marketing while the product keeps its own
 * palette. It collapses entirely below `lg`, where the form takes the screen.
 */
export function AuthLayout({
  title,
  description,
  footer,
  children,
}: {
  title: string
  description: string
  footer: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          className="absolute inset-0 bg-gradient-to-br from-brand via-brand-strong to-brand-accent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 12%, hsl(0 0% 100% / 0.22), transparent 45%), radial-gradient(circle at 88% 78%, hsl(var(--brand-sky) / 0.38), transparent 46%)',
          }}
          aria-hidden
        />
        {/* Faint grid, for a little engineered texture under the copy. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(0 0% 100% / 0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 50% 40%, black, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, black, transparent 72%)',
          }}
          aria-hidden
        />

        <Link
          to="/"
          className="relative flex items-center gap-2.5 rounded-md outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <LogoMark className="h-9 w-9" />
          <span className="font-display text-lg font-semibold tracking-tight">SynergySphere</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="font-display text-[2rem] font-semibold leading-[1.15] tracking-tight xl:text-[2.4rem]">
            Project management with evidence, not assumptions.
          </h2>
          <ul className="mt-9 space-y-5">
            {highlights.map(({ icon: Icon, title: itemTitle, description: itemDescription }) => (
              <li key={itemTitle} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-sm">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{itemTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-white/75">{itemDescription}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/65">
          Tasks, discussions, and GitHub activity in one workspace.
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative flex min-h-screen flex-col justify-center px-5 py-12 sm:px-10 lg:min-h-0 lg:px-14 xl:px-20">
        {/* A whisper of brand at the top edge on small screens, where the
            gradient panel is hidden entirely. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand-soft to-transparent lg:hidden"
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-[26rem]">
          <Link to="/" className="mb-9 inline-flex lg:hidden">
            <Logo markClassName="h-9 w-9" textClassName="text-lg" />
          </Link>

          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-8 border-t pt-6 text-sm text-muted-foreground">{footer}</div>
        </div>
      </main>
    </div>
  )
}
