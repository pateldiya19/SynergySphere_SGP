import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Mail, User } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { cn } from '@/lib/utils'

export function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const { register } = useAuth()
  const { addToast } = useToast()

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required'
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required'
    }

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (!agreedToTerms) {
      newErrors.terms = 'You must agree to the terms and privacy policy'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    try {
      const fullName = `${formData.firstName} ${formData.lastName}`
      await register(formData.email, formData.password, fullName)
      addToast({
        title: 'Account created',
        description: 'Welcome to SynergySphere. You can now start collaborating.',
        type: 'success',
      })
    } catch {
      addToast({
        title: 'Registration failed',
        description: 'Please try again or contact support if the problem persists.',
        type: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Set up a workspace for your team in less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="firstName"
            label="First name"
            autoComplete="given-name"
            value={formData.firstName}
            onChange={handleChange('firstName')}
            placeholder="Ada"
            leftIcon={<User />}
            error={errors.firstName}
          />
          <Input
            id="lastName"
            label="Last name"
            autoComplete="family-name"
            value={formData.lastName}
            onChange={handleChange('lastName')}
            placeholder="Lovelace"
            error={errors.lastName}
          />
        </div>

        <Input
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange('email')}
          placeholder="you@company.com"
          leftIcon={<Mail />}
          error={errors.email}
        />

        <Input
          id="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={formData.password}
          onChange={handleChange('password')}
          placeholder="At least 8 characters"
          leftIcon={<LockKeyhole />}
          error={errors.password}
          helperText="Use at least 8 characters."
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

        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => {
                setAgreedToTerms(e.target.checked)
                if (errors.terms) setErrors(prev => ({ ...prev, terms: '' }))
              }}
              aria-invalid={errors.terms ? true : undefined}
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded border-input',
                errors.terms && 'border-destructive'
              )}
            />
            <span className="text-muted-foreground">
              I agree to the terms of service and privacy policy.
            </span>
          </label>
          {errors.terms && <p className="mt-1.5 text-sm text-destructive">{errors.terms}</p>}
        </div>

        <Button type="submit" variant="brand" size="lg" className="w-full" loading={isLoading}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
