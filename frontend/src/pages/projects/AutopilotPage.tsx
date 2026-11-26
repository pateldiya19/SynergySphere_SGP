import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  Github,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle, SectionHeading } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, StatsSkeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import {
  ApiAutopilot,
  ApiAutopilotRecord,
  approveAutopilotAction,
  askAutopilot,
  getAutopilot,
  rejectAutopilotAction,
  runAutopilotAnalysis,
  streamAutopilot,
} from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'

const severityVariant = {
  low: 'info',
  medium: 'warning',
  high: 'warning',
  critical: 'destructive',
} as const

function recordTaskLabel(record: ApiAutopilotRecord) {
  const taskId = record.action?.taskId
  if (!taskId) return null
  return (
    <Link className="text-primary hover:underline" to={`/tasks/${taskId}`}>
      View task
    </Link>
  )
}

export function AutopilotPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ApiAutopilot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<{
    answer: string
    evidence: Array<{ label: string; value: string }>
    ai?: { configured: boolean; provider: 'openai' | 'gemini' | null; model: string | null }
  } | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [workingAction, setWorkingAction] = useState('')
  // AI runs only when the user presses the button, so its progress and failure
  // are tracked separately from the deterministic board load.
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisRanAt, setAnalysisRanAt] = useState<Date | null>(null)
  const { addToast } = useToast()

  const load = async () => {
    if (!id) return
    try {
      setData(await getAutopilot(id))
      setError('')
    } catch (loadError: any) {
      setError(loadError.message || 'Unable to load Autopilot.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  const runAnalysis = async () => {
    if (!id) return
    setIsAnalyzing(true)
    setAnalysisError('')
    try {
      const result = await runAutopilotAnalysis(id)
      setData(result)
      setAnalysisRanAt(new Date())
      addToast({
        title: 'AI analysis complete',
        description: `Analysed by ${result.ai.provider ?? 'the configured provider'}.`,
        type: 'success',
      })
    } catch (runError: any) {
      // Never leave a failed run looking like a successful one: keep the
      // deterministic board as it was and say plainly that the AI step failed.
      const message = runError?.message || 'The AI provider could not complete this analysis.'
      setAnalysisError(message)
      addToast({ title: 'AI analysis failed', description: message, type: 'error' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const pendingActions = useMemo(
    () =>
      data?.recommendations.filter(
        record => record.status === 'pending' || record.status === 'observed'
      ) || [],
    [data]
  )

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault()
    if (!id || !question.trim()) return
    setIsAsking(true)
    setAnswer({ answer: '', evidence: [] })
    try {
      if (!data?.ai.configured) {
        const result = await askAutopilot(id, question.trim())
        setAnswer({
          answer: result.answer,
          evidence: result.evidence,
          ai: {
            configured: result.ai.available,
            provider: result.ai.provider,
            model: result.ai.model,
          },
        })
      } else {
        let streamedAnswer = ''
        const result = await streamAutopilot(id, question.trim(), token => {
          streamedAnswer += token
          setAnswer(current => ({
            answer: streamedAnswer,
            evidence: current?.evidence || [],
            ai: current?.ai,
          }))
        })
        setAnswer({ answer: streamedAnswer, evidence: result.evidence, ai: result.ai })
      }
      setQuestion('')
    } catch (askError: any) {
      setAnswer(null)
      addToast({ title: 'Assistant unavailable', description: askError.message, type: 'error' })
    } finally {
      setIsAsking(false)
    }
  }

  const decide = async (record: ApiAutopilotRecord, decision: 'approve' | 'reject') => {
    setWorkingAction(record.id)
    try {
      if (decision === 'approve') await approveAutopilotAction(record.id)
      else await rejectAutopilotAction(record.id)
      addToast({
        title: decision === 'approve' ? 'Action executed' : 'Recommendation rejected',
        description:
          decision === 'approve' ? 'The project data was updated.' : 'The proposal was dismissed.',
        type: 'success',
      })
      await load()
    } catch (actionError: any) {
      addToast({
        title: 'Action could not be completed',
        description: actionError.message,
        type: 'error',
      })
    } finally {
      setWorkingAction('')
    }
  }

  if (!id)
    return (
      <EmptyState title="Project not found" description="This project may have been deleted." />
    )

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: 'Projects', to: '/projects' },
        { label: 'Project', to: `/projects/${id}` },
        { label: 'Autopilot' },
      ]}
      title="SGP Autopilot"
      description="An evidence-led project manager that spots delivery risk and prepares the next move."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsLoading(true)
            void load()
          }}
          loading={isLoading}
        >
          <RefreshCw aria-hidden /> Refresh
        </Button>
      }
    />
  )

  if (isLoading && !data)
    return (
      <div className="space-y-6">
        {header}
        <ProjectTabs projectId={id} active="autopilot" />
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Loading current project data and Autopilot analysis…
          </CardContent>
        </Card>
        <StatsSkeleton count={4} />
      </div>
    )
  if (error || !data)
    return (
      <div className="space-y-6">
        {header}
        <ProjectTabs projectId={id} active="autopilot" />
        <ErrorState
          title="Autopilot unavailable"
          description={error || 'Please try again.'}
          onRetry={() => {
            setIsLoading(true)
            void load()
          }}
        />
      </div>
    )

  const { context } = data
  const healthTone =
    context.health.status === 'Healthy'
      ? 'success'
      : context.health.status === 'Critical'
      ? 'destructive'
      : 'warning'
  const history = data.records
    .filter(
      record =>
        record.type === 'chat' || record.status === 'executed' || record.status === 'rejected'
    )
    .slice(0, 6)

  return (
    <div className="space-y-6">
      {header}
      <ProjectTabs projectId={id} active="autopilot" />

      {/*
        Four honest states: a failed run, a completed run, a configured
        provider waiting to be asked, and no provider at all. The board below
        is rule-based and is fully populated in every one of them.
      */}
      <Card
        className={cn(
          analysisError && 'border-destructive/30 bg-destructive-soft/30',
          !analysisError && data.ai.available && 'border-primary/25 bg-primary-soft/30',
          !analysisError && !data.ai.available && 'border-border'
        )}
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-start gap-3">
            {analysisError ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <Bot
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  data.ai.available ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {analysisError
                  ? 'AI analysis failed'
                  : data.ai.available
                  ? `AI analysis complete · ${data.ai.provider}`
                  : data.ai.configured
                  ? 'AI analysis not run yet'
                  : 'Rule-based analysis'}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {analysisError ||
                  (data.ai.available
                    ? data.ai.summary ||
                      'Recommendations below are grounded in this project context.'
                    : data.ai.configured
                    ? 'The risks and recommendations below are rule-based. Run an AI analysis for contextual reasoning — it calls the provider, so it only runs when you ask.'
                    : 'Risk detection runs without an API key. Configure a backend AI provider to add contextual reasoning.')}
              </p>
              {analysisRanAt && !analysisError && (
                <p className="mt-1 text-2xs text-muted-foreground">
                  Last run {formatDateTime(analysisRanAt.toISOString())}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={analysisError ? 'destructive' : data.ai.available ? 'primary' : 'secondary'}
            >
              {data.ai.available && !analysisError
                ? data.ai.model
                : data.ai.configured
                ? `${data.ai.provider ?? 'Provider'} ready`
                : 'No provider'}
            </Badge>
            <Button
              size="sm"
              variant={data.ai.available ? 'outline' : 'default'}
              onClick={runAnalysis}
              loading={isAnalyzing}
              disabled={!data.ai.configured || isAnalyzing}
              title={
                data.ai.configured
                  ? 'Calls the configured AI provider'
                  : 'No AI provider configured on this server'
              }
            >
              <Sparkles aria-hidden />
              {isAnalyzing
                ? 'Analysing…'
                : analysisError
                ? 'Retry AI analysis'
                : data.ai.available
                ? 'Re-run AI analysis'
                : 'Run AI analysis'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Autopilot briefing
              </p>
              <h2 className="mt-1 text-xl">{context.project.name}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {context.health.risks.length
                  ? `${context.health.risks.length} live signal${
                      context.health.risks.length === 1 ? '' : 's'
                    } need attention.`
                  : 'No delivery risks detected in the latest assessment.'}
              </p>
            </div>
          </div>
          <Badge variant={healthTone} dot size="lg">
            {context.health.status}
          </Badge>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Progress',
              value: `${context.progress}%`,
              detail: `${context.health.metrics.completedTasks}/${context.health.metrics.totalTasks} tasks`,
              icon: CheckCircle2,
            },
            {
              label: 'Open risks',
              value: context.health.risks.length,
              detail: `${context.health.metrics.overdueTasks} overdue`,
              icon: ShieldAlert,
            },
            {
              label: 'Activity',
              value: context.activity.events,
              detail: `${context.activity.discussions} discussions`,
              icon: Activity,
            },
            {
              label: 'GitHub signal',
              value: context.github.connected ? context.github.commits : '—',
              detail: context.github.connected
                ? `${context.github.mergedPullRequests} merged PRs`
                : 'Not connected',
              icon: Github,
            },
          ].map(metric => (
            <div key={metric.label} className="rounded-lg border bg-background/50 p-4">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs">{metric.label}</span>
                <metric.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular">{metric.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
        <div
          className="mt-5 h-2 overflow-hidden rounded-full bg-muted"
          aria-label={`${context.progress}% complete`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${context.progress}%` }}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionHeading
              eyebrow="Signal detection"
              title="Risks that deserve a decision"
              description="Every signal below is derived from current tasks, dependencies, workload, activity, or linked GitHub evidence."
            />
            {data.risks.length === 0 ? (
              <Card className="border-success/25 bg-success-soft/30">
                <CardContent className="flex items-center gap-3 pt-5">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm font-semibold">Project is tracking cleanly</p>
                    <p className="text-sm text-muted-foreground">
                      Autopilot will notify managers if a meaningful new risk appears.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              data.risks.map(risk => (
                <Card key={risk.key} elevation="xs">
                  <CardHeader>
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                          risk.severity === 'critical'
                            ? 'bg-destructive-soft text-destructive'
                            : 'bg-warning-soft text-warning'
                        )}
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div>
                        <CardTitle className="text-sm">{risk.title}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{risk.description}</p>
                      </div>
                    </div>
                    <Badge variant={severityVariant[risk.severity]}>{risk.severity}</Badge>
                  </CardHeader>
                  {risk.tasks.length > 0 && (
                    <div className="border-t px-5 py-3 text-xs text-muted-foreground">
                      {risk.tasks.slice(0, 3).map(task => (
                        <Link
                          key={task.id}
                          to={`/tasks/${task.id}`}
                          className="mr-3 inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {task.taskKey || 'Task'} <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
              ))
            )}
          </section>

          <section className="space-y-3">
            <SectionHeading
              eyebrow="Recovery planning"
              title="Recommended next moves"
              description="Proposals never change project data until an owner or manager approves them."
            />
            {pendingActions.length === 0 ? (
              <Card>
                <CardContent className="pt-5 text-sm text-muted-foreground">
                  No new actions are waiting for approval.
                </CardContent>
              </Card>
            ) : (
              pendingActions.map(record => (
                <Card key={record.id} elevation="xs">
                  <CardHeader>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{record.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{record.summary}</p>
                      {record.reasoning && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Reasoning:</span>{' '}
                          {record.reasoning}
                        </p>
                      )}
                    </div>
                    <Badge variant={severityVariant[record.severity || 'medium']}>
                      {record.severity || 'suggested'}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs">
                      {record.evidence.map(item => (
                        <div key={item.label} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="text-right font-medium">{item.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {recordTaskLabel(record)}
                      </span>
                      {record.action && record.status === 'pending' ? (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void decide(record, 'reject')}
                            disabled={workingAction === record.id}
                          >
                            <X /> Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void decide(record, 'approve')}
                            loading={workingAction === record.id}
                          >
                            <CheckCircle2 /> Approve & execute
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary">Review only</Badge>
                      )}
                      {record.estimates && record.estimates.length > 0 && (
                        <p className="mt-3 text-2xs text-warning">
                          Estimate: {record.estimates.join(' ')}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </div>

        <div className="space-y-6">
          <Card elevation="sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Ask Autopilot</CardTitle>
              </div>
              <Badge variant={data.ai.configured ? 'primary' : 'secondary'}>
                {data.ai.configured ? 'LangGraph + AI' : 'Rule-based fallback'}
              </Badge>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitQuestion} className="space-y-3">
                <Input
                  value={question}
                  onChange={event => setQuestion(event.target.value)}
                  placeholder="What should we focus on next?"
                  aria-label="Ask Autopilot a question"
                />
                <Button type="submit" className="w-full" loading={isAsking}>
                  <MessageSquare /> Ask assistant
                </Button>
              </form>
              {answer && (
                <div className="mt-4 rounded-lg border bg-primary-soft/40 p-4">
                  <p className="text-sm leading-6">{answer.answer}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {answer.evidence.map(item => (
                      <Badge key={item.label} variant="outline">
                        {item.label}: {item.value}
                      </Badge>
                    ))}
                  </div>
                  {answer.ai && (
                    <p className="mt-3 text-2xs text-muted-foreground">
                      {answer.ai.configured
                        ? `Streamed from ${answer.ai.provider} · ${answer.ai.model}`
                        : 'Deterministic fallback · configure a provider for AI reasoning'}
                    </p>
                  )}
                </div>
              )}
              <p className="mt-3 text-2xs text-muted-foreground">
                Answers are grounded in the selected project's current tasks and activity. They do
                not execute actions.
              </p>
            </CardContent>
          </Card>

          <Card elevation="xs">
            <CardHeader>
              <div>
                <CardTitle className="text-sm">Autopilot activity</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recent assistant and execution events
                </p>
              </div>
              <Clock3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No execution history yet.</p>
              ) : (
                history.map(record => (
                  <div key={record.id} className="flex gap-3 border-b pb-3 last:border-0 last:pb-0">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {record.type === 'chat' ? (
                        <MessageSquare className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {record.type === 'chat' ? record.question : record.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {record.result || record.answer || record.status} ·{' '}
                        {formatDateTime(record.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Monitoring runs periodically and deduplicates unchanged
        risk signals before notifying project owners and managers.
      </p>
    </div>
  )
}
