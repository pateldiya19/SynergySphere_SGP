// Updated AuthProvider.tsx for your frontend
// Replace the existing file with this implementation

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@/types'

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // API helper function
  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('auth_token')
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'API request failed')
    }

    return data
  }

  useEffect(() => {
    // Check for existing session on mount
    const initializeAuth = async () => {
      const token = localStorage.getItem('auth_token')
      const userData = localStorage.getItem('user_data')
      
      if (token && userData) {
        try {
          // Verify token is still valid by fetching profile
          const response = await apiCall('/users/profile')
          setUser(response.data)
        } catch (error) {
          // Token is invalid, clear storage
          localStorage.removeItem('auth_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('user_data')
        }
      }
      
      setIsLoading(false)
    }

    initializeAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const response = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      
      const { user, accessToken, refreshToken } = response.data
      
      localStorage.setItem('auth_token', accessToken)
      localStorage.setItem('refresh_token', refreshToken)
      localStorage.setItem('user_data', JSON.stringify(user))
      setUser(user)
    } catch (error) {
      throw error
    }
  }

  const register = async (email: string, password: string, name: string) => {
    try {
      const response = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      })
      
      const { user, accessToken, refreshToken } = response.data
      
      localStorage.setItem('auth_token', accessToken)
      localStorage.setItem('refresh_token', refreshToken)
      localStorage.setItem('user_data', JSON.stringify(user))
      setUser(user)
    } catch (error) {
      throw error
    }
  }

  const logout = async () => {
    try {
      // Call logout endpoint
      await apiCall('/users/logout', { method: 'POST' })
    } catch (error) {
      // Even if logout fails, clear local storage
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_data')
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
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
