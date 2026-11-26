import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/layout/AuthLayout'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { verifyEmail, resendVerification } = useAuth()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [code, setCode] = useState('')
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    const resendAt = Date.parse(searchParams.get('resendAt') || '')
    return Number.isFinite(resendAt) ? Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)) : 0
  })
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = window.setTimeout(
      () => setRemainingSeconds(seconds => Math.max(0, seconds - 1)),
      1000
    )
    return () => window.clearTimeout(timer)
  }, [remainingSeconds])

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.')
      return
    }

    setIsVerifying(true)
    try {
      await verifyEmail(email.trim(), code)
      navigate(`/login?verified=1&email=${encodeURIComponent(email.trim())}`, { replace: true })
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : 'Email verification could not be completed.'
      )
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setMessage('')
    setIsResending(true)
    try {
      const resendAt = await resendVerification(email.trim())
      setMessage('If the account needs verification, a new code has been requested.')
      if (resendAt) {
        setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(resendAt) - Date.now()) / 1000)))
      }
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : 'A verification code could not be sent.'
      )
    } finally {
      setIsResending(false)
    }
  }

  return (
    <AuthLayout
      title="Verify your email"
      description="Enter the 6-digit code we sent. It expires in 5 minutes."
      footer={
        <>
          Already verified?{' '}
          <Link
            to={`/login?email=${encodeURIComponent(email.trim())}`}
            className="font-medium text-brand hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleVerify} className="space-y-4" noValidate>
        <Input
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          leftIcon={<Mail />}
          required
        />
        <Input
          id="code"
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6-digit code"
          maxLength={6}
          required
          error={error}
        />
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
        <Button type="submit" variant="brand" size="lg" className="w-full" loading={isVerifying}>
          Verify email
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => void handleResend()}
          loading={isResending}
          disabled={!email.trim() || remainingSeconds > 0}
        >
          {remainingSeconds > 0 ? `Resend code in ${remainingSeconds}s` : 'Resend code'}
        </Button>
      </form>
    </AuthLayout>
  )
}
