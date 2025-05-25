import axios, { AxiosError } from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:9999/api' : '/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)

export interface ApiError {
  message: string
  status?: number
  details?: any
}

export function isApiError(error: unknown): error is AxiosError<ApiError> {
  return axios.isAxiosError(error)
}