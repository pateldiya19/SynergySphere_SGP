import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  GitMerge,
  GitPullRequest,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Logo, LogoMark } from '@/components/brand/Logo'

const featureItems = [
  {
    title: 'Project control',
    description:
      'Organize initiatives with clear ownership, milestones, and member access in one focused workspace.',
    icon: FolderKanban,
  },
  {
    title: 'Task ownership',
    description:
      'Assign tasks with due dates and priorities so everyone knows what to do next and when.',
    icon: CheckCircle2,
  },
  {
    title: 'Verified proof of work',
    description:
      'Approve completed work against real commits and pull requests instead of trusting a checkbox.',
    icon: ShieldCheck,
  },
  {
    title: 'GitHub integration',
    description:
      'Branches, commits, and pull requests attach themselves to the right task automatically.',
    icon: GitPullRequest,
  },
  {
    title: 'Team collaboration',
    description:
      'Keep project communication aligned with member visibility and shared execution context.',
    icon: Users,
  },
  {
    title: 'Focused discussions',
    description:
      'Capture decisions and updates where work happens so context is never lost between teammates.',
    icon: MessageSquareText,
  },
]

const workflowSteps = [
  {
    step: '01',
    title: 'Assign the work',
    description: 'A project manager creates a task and assigns it to a developer.',
  },
  {
    step: '02',
    title: 'Build and push',
    description: 'The developer references the task key in a branch, commit, or pull request.',
  },
  {
    step: '03',
    title: 'Evidence arrives',
    description: 'A signed GitHub webhook attaches verified development evidence to the task.',
  },
  {
    step: '04',
    title: 'Review and approve',
    description: 'The manager checks the evidence, then approves the task as done.',
  },
]

/** The checks a reviewer actually sees, mirrored in the hero preview. */
const previewChecks = [
  'Repository matches project',
  'Pull request detected',
  'Developer matches assignee',
  'Code changes detected',
]

/**
 * A small, honest rendering of the product's proof-of-work panel.
 *
 * Built from the same tokens as the real thing rather than a screenshot, so it
 * stays sharp at any size and follows light and dark mode.
 */
function EvidencePreview() {
  return (
    <div className="relative rounded-xl border bg-card p-5 shadow-xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <GitMerge className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">TASK-128</p>
            <p className="text-xs text-muted-foreground">Add idempotency keys</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Verified by GitHub
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-y py-4">
        {[
          { label: 'Commits', value: '3' },
          { label: 'Files', value: '6' },
          { label: 'Changes', value: '+184' },
        ].map(metric => (
          <div key={metric.label}>
            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </dt>
            <dd className="mt-0.5 font-display text-lg font-semibold">{metric.value}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-4 space-y-2.5">
        {previewChecks.map(check => (
          <li key={check} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="text-muted-foreground">{check}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            to="/"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Logo />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button variant="brand" size="sm" asChild>
              <Link to="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 80% 55% at 12% -8%, hsl(var(--brand) / 0.22), transparent 60%), radial-gradient(ellipse 65% 50% at 92% 8%, hsl(var(--brand-accent) / 0.16), transparent 58%), radial-gradient(ellipse 60% 45% at 55% 100%, hsl(var(--brand-sky) / 0.1), transparent 60%)',
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse at 50% 0%, black, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black, transparent 75%)',
            }}
            aria-hidden
          />

          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-14 lg:py-28">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Proof of work, built in
              </span>

              <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                Project management with{' '}
                <span className="bg-gradient-to-r from-brand via-brand-accent to-brand-sky bg-clip-text text-transparent">
                  evidence
                </span>
                , not assumptions.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                SynergySphere connects your tasks to real GitHub activity, so a project manager can
                verify that work was genuinely completed before marking anything done.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button variant="brand" size="lg" asChild>
                  <Link to="/register">
                    Create your workspace
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button variant="brand-outline" size="lg" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {['Signed GitHub webhooks', 'Reviewer approval required', 'No credit card'].map(
                  item => (
                    <li key={item} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-brand" aria-hidden />
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>

            {/* Product preview. Hidden below `sm` where it would crowd the copy. */}
            <div className="relative hidden sm:block">
              <div
                className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-brand/20 via-brand-accent/10 to-transparent blur-2xl"
                aria-hidden
              />
              <div className="relative">
                <EvidencePreview />
              </div>
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section className="border-b">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand">
                How it works
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                From assignment to verified completion
              </h2>
            </div>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map(item => (
                <li
                  key={item.step}
                  className="group relative rounded-xl border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft font-mono text-xs font-bold text-brand">
                    {item.step}
                  </span>
                  <h3 className="mt-3.5 text-base font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="border-b bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand">
                Capabilities
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Everything teams need to stay in sync
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                A straightforward workflow for planning, ownership, and day-to-day execution.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featureItems.map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="group rounded-xl border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section>
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand via-brand-strong to-brand-accent p-8 text-center shadow-xl sm:p-14">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={{
                  backgroundImage:
                    'linear-gradient(hsl(0 0% 100% / 0.7) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.7) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                  maskImage: 'radial-gradient(ellipse at 50% 50%, black, transparent 70%)',
                  WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black, transparent 70%)',
                }}
                aria-hidden
              />
              <div className="relative">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                  Start tracking work you can verify
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
                  Create a workspace, invite your team, and connect a repository in a few minutes.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button
                    size="lg"
                    asChild
                    className="bg-white text-brand shadow-sm hover:bg-white/90"
                  >
                    <Link to="/register">
                      Create your workspace
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="border-white/35 bg-transparent text-white hover:border-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <Link to="/login">I already have an account</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-9 text-sm text-muted-foreground sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <LogoMark className="h-6 w-6" />
            <span className="font-medium text-foreground">SynergySphere</span>
          </div>
          <p>Team collaboration and project management.</p>
        </div>
      </footer>
    </div>
  )
}
