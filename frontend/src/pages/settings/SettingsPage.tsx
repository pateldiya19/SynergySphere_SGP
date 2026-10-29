import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Github, LogOut, Mail, ShieldCheck, Unlink, User } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { ModeToggle } from '@/components/mode-toggle'
import { useToast } from '@/components/ui/Toast'
import { apiRequest, ApiUser } from '@/lib/api'

type GitHubIdentityStatus = {
  configured: boolean
  linked: { login: string; avatarUrl?: string; linkedAt?: string } | null
  unverifiedClaim: string | null
}

export function SettingsPage() {
  const { user, logout, updateUser } = useAuth()
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [github, setGithub] = useState<GitHubIdentityStatus | null>(null)
  const [isLinking, setIsLinking] = useState(false)
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const loadGitHubStatus = useCallback(async () => {
    try {
      setGithub(await apiRequest<GitHubIdentityStatus>('/api/auth/github/status'))
    } catch {
      setGithub(null)
    }
  }, [])

  useEffect(() => {
    void loadGitHubStatus()
  }, [loadGitHubStatus])

  // The OAuth callback redirects back here with the outcome in the query string,
  // since it has no way to talk to this tab directly.
  useEffect(() => {
    const outcome = searchParams.get('github')
    if (!outcome) return

    if (outcome === 'linked') {
      addToast({
        title: 'GitHub account linked',
        description: `Verified as @${searchParams.get('login') || 'your account'}.`,
        type: 'success',
      })
      void loadGitHubStatus()
    } else if (outcome === 'cancelled') {
      addToast({ title: 'GitHub linking cancelled', type: 'default' })
    } else {
      addToast({
        title: 'GitHub linking failed',
        description: searchParams.get('reason') || 'Please try again.',
        type: 'error',
      })
    }

    // Clear the params so a refresh does not replay the toast.
    const next = new URLSearchParams(searchParams)
    for (const key of ['github', 'login', 'reason']) next.delete(key)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, addToast, loadGitHubStatus])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      const updatedUser = await apiRequest<ApiUser>('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: profile.name }),
      })
      if (user) updateUser({ ...user, ...updatedUser })

      addToast({
        title: 'Profile updated',
        description: 'Your changes have been saved.',
        type: 'success',
      })
    } catch {
      addToast({
        title: 'Profile could not be saved',
        description: 'Please check your details and try again.',
        type: 'error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleConnectGitHub = async () => {
    setIsLinking(true)
    try {
      // Full-page navigation, not a popup: GitHub's consent screen refuses to
      // render in an iframe and a popup would be blocked as often as not.
      const { url } = await apiRequest<{ url: string }>('/api/auth/github/start', {
        method: 'POST',
      })
      window.location.href = url
    } catch {
      addToast({
        title: 'Could not start GitHub linking',
        description: 'Please try again in a moment.',
        type: 'error',
      })
      setIsLinking(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    setIsLinking(true)
    try {
      await apiRequest('/api/auth/github/link', { method: 'DELETE' })
      if (user) updateUser({ ...user, github: undefined, githubLogin: undefined })
      await loadGitHubStatus()
      addToast({
        title: 'GitHub account unlinked',
        description: 'Author verification will show as unverified until you link again.',
        type: 'success',
      })
    } catch {
      addToast({ title: 'Could not unlink the GitHub account', type: 'error' })
    } finally {
      setIsLinking(false)
    }
  }

  const linkedLogin = github?.linked?.login
  const isGithubLinked = Boolean(linkedLogin)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your profile, identity verification, and appearance."
      />

      <Card elevation="xs">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={profile.name || 'User'} src={user?.avatarUrl} size="xl" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">{profile.name || 'Your name'}</h2>
              <p className="mt-0.5 inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{profile.email}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Badge variant={isGithubLinked ? 'success' : 'secondary'} size="sm" dot>
                  {isGithubLinked ? `GitHub verified: @${linkedLogin}` : 'GitHub not linked'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card elevation="xs">
        <CardHeader className="border-b">
          <div className="flex min-w-0 items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <CardTitle>Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <Input
              label="Full name"
              value={profile.name}
              onChange={e => setProfile(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter your full name"
            />

            <Input
              label="Email address"
              type="email"
              value={profile.email}
              disabled
              helperText="Your email address cannot be changed."
            />

            <div className="flex justify-end pt-1">
              <Button type="submit" loading={isSaving}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card elevation="xs">
        <CardHeader className="border-b">
          <div className="flex min-w-0 items-center gap-2">
            <Github className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <CardTitle>Developer identity</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <p className="flex items-start gap-1.5 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Sign in with GitHub so reviewers can confirm that commits and pull requests on your
            tasks were genuinely authored by you. Verification is handled by GitHub itself — a
            username typed by hand proves nothing, so it is no longer accepted.
          </p>

          {github?.configured === false && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span>
                GitHub linking is not configured on this server yet. Ask an administrator to set the
                GitHub OAuth credentials.
              </span>
            </div>
          )}

          {github?.unverifiedClaim && !isGithubLinked && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span>
                <span className="font-medium">@{github.unverifiedClaim}</span> was entered by hand
                and has never been verified, so it is ignored when checking commit authorship. Link
                with GitHub to make it count.
              </span>
            </div>
          )}

          {isGithubLinked ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={linkedLogin || 'GitHub'} src={github?.linked?.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">@{linkedLogin}</p>
                  <p className="text-xs text-muted-foreground">
                    Verified by GitHub
                    {github?.linked?.linkedAt
                      ? ` on ${new Date(github.linked.linkedAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={handleDisconnectGitHub} loading={isLinking}>
                <Unlink aria-hidden />
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnectGitHub}
              loading={isLinking}
              disabled={github?.configured === false}
            >
              <Github aria-hidden />
              Connect GitHub account
            </Button>
          )}
        </CardContent>
      </Card>

      <Card elevation="xs">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Appearance</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch between light, dark, and system themes.
            </p>
          </div>
          <ModeToggle />
        </CardHeader>
      </Card>

      <Card elevation="xs" className="border-destructive/25">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle className="text-destructive">Sign out</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              You&apos;ll need to sign in again to access your workspace.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={logout}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut aria-hidden />
            Sign out
          </Button>
        </CardHeader>
      </Card>
    </div>
  )
}
