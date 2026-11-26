import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/layout/AuthLayout'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [verificationRequired, setVerificationRequired] = useState(false)

  const { login } = useAuth()
  const { addToast } = useToast()

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {}

    if (!email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    try {
      await login(email, password)
      addToast({
        title: 'Welcome back',
        description: 'You have successfully signed in.',
        type: 'success',
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Please check your credentials and try again.'
      setVerificationRequired(message.toLowerCase().includes('verify your email'))
      addToast({
        title: 'Sign in failed',
        description: message,
        type: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to pick up where your team left off."
      footer={
        <>
          New to SynergySphere?{' '}
          <Link to="/register" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {searchParams.get('verified') === '1' && (
          <p role="status" className="text-sm text-success">
            Your email is verified. Sign in to continue.
          </p>
        )}
        <Input
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => {
            setEmail(e.target.value)
            setVerificationRequired(false)
            if (errors.email) setErrors(prev => ({ ...prev, email: '' }))
          }}
          placeholder="you@company.com"
          leftIcon={<Mail />}
          error={errors.email}
        />

        <Input
          id="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={e => {
            setPassword(e.target.value)
            if (errors.password) setErrors(prev => ({ ...prev, password: '' }))
          }}
          placeholder="Enter your password"
          leftIcon={<LockKeyhole />}
          error={errors.password}
          rightIcon={
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}
              className="pointer-events-auto rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <Button type="submit" variant="brand" size="lg" className="w-full" loading={isLoading}>
          Sign in
        </Button>
        {verificationRequired && (
          <p className="text-sm text-muted-foreground">
            Need a verification code?{' '}
            <Link
              to={`/verify-email?email=${encodeURIComponent(email.trim())}`}
              className="font-medium text-brand hover:underline"
            >
              Verify your email
            </Link>
          </p>
        )}
      </form>
    </AuthLayout>
  )
}
