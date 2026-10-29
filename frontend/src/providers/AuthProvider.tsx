import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@/types'
import { apiRequest, normalizeIds, refreshAccessToken } from '@/lib/api'
import { disconnectSocket } from '@/lib/socket'

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  updateUser: (user: User) => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('auth_token')
      const refreshToken = localStorage.getItem('refresh_token')
      const userData = localStorage.getItem('user_data')

      if (!token || !refreshToken || !userData) {
        setIsLoading(false)
        return
      }

      try {
        const nextToken = await refreshAccessToken()
        if (!nextToken) throw new Error('Session expired')
        const profile = await apiRequest<User>('/api/users/profile')
        localStorage.setItem('user_data', JSON.stringify(normalizeIds(profile)))
        setUser(normalizeIds(profile))
      } catch {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_data')
      } finally {
        setIsLoading(false)
      }
    }

    void restoreSession()
  }, [])

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      throw new Error('Login failed')
    }

    const result = normalizeIds(await response.json())
    const user = result.data?.user ?? result.user
    const token = result.data?.accessToken ?? result.token
    const refreshToken = result.data?.refreshToken ?? result.refreshToken

    localStorage.setItem('auth_token', token)
    localStorage.setItem('refresh_token', refreshToken)
    localStorage.setItem('user_data', JSON.stringify(user))
    setUser(user)
  }

  const register = async (email: string, password: string, name: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })

    if (!response.ok) {
      throw new Error('Registration failed')
    }

    const result = normalizeIds(await response.json())
    const user = result.data?.user ?? result.user
    const token = result.data?.accessToken ?? result.token
    const refreshToken = result.data?.refreshToken ?? result.refreshToken

    localStorage.setItem('auth_token', token)
    localStorage.setItem('refresh_token', refreshToken)
    localStorage.setItem('user_data', JSON.stringify(user))
    setUser(user)
  }

  const logout = () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      void fetch('/api/users/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_data')
    disconnectSocket()
    setUser(null)
  }

  const updateUser = (nextUser: User) => {
    const normalizedUser = normalizeIds(nextUser)
    localStorage.setItem('user_data', JSON.stringify(normalizedUser))
    setUser(normalizedUser)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
