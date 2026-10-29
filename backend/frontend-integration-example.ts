// Frontend API service integration
// Place this in your frontend src/services/api.ts

import axios, { AxiosInstance, AxiosResponse } from 'axios';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
            refreshToken,
          });

          const { accessToken } = response.data.data;
          localStorage.setItem('auth_token', accessToken);

          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// API Service Class
export class ApiService {
  // Auth endpoints
  static async login(email: string, password: string) {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  }

  static async register(name: string, email: string, password: string) {
    const response = await apiClient.post('/auth/register', { name, email, password });
    return response.data;
  }

  static async refreshToken(refreshToken: string) {
    const response = await apiClient.post('/auth/refresh-token', { refreshToken });
    return response.data;
  }

  static async logout() {
    const response = await apiClient.post('/users/logout');
    return response.data;
  }

  // User endpoints
  static async getProfile() {
    const response = await apiClient.get('/users/profile');
    return response.data;
  }

  static async updateProfile(data: { name?: string; avatarUrl?: string }) {
    const response = await apiClient.put('/users/profile', data);
    return response.data;
  }

  // Project endpoints
  static async getProjects(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    order?: 'asc' | 'desc';
  }) {
    const response = await apiClient.get('/projects', { params });
    return response.data;
  }

  static async getProject(id: string) {
    const response = await apiClient.get(`/projects/${id}`);
    return response.data;
  }

  static async createProject(data: {
    name: string;
    description?: string;
    tags?: string[];
    deadline?: string;
  }) {
    const response = await apiClient.post('/projects', data);
    return response.data;
  }

  static async updateProject(id: string, data: {
    name?: string;
    description?: string;
    tags?: string[];
    deadline?: string;
  }) {
    const response = await apiClient.put(`/projects/${id}`, data);
    return response.data;
  }

  static async deleteProject(id: string) {
    const response = await apiClient.delete(`/projects/${id}`);
    return response.data;
  }

  static async addProjectMember(projectId: string, userId: string, role: 'owner' | 'member' = 'member') {
    const response = await apiClient.post(`/projects/${projectId}/members`, { userId, role });
    return response.data;
  }

  static async removeProjectMember(projectId: string, userId: string) {
    const response = await apiClient.delete(`/projects/${projectId}/members/${userId}`);
    return response.data;
  }

  // Task endpoints
  static async getProjectTasks(projectId: string, params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'todo' | 'in_progress' | 'done';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assigneeId?: string;
  }) {
    const response = await apiClient.get(`/tasks/project/${projectId}`, { params });
    return response.data;
  }

  static async getMyTasks(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'todo' | 'in_progress' | 'done';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }) {
    const response = await apiClient.get('/tasks/my-tasks', { params });
    return response.data;
  }

  static async getTask(id: string) {
    const response = await apiClient.get(`/tasks/${id}`);
    return response.data;
  }

  static async createTask(data: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  }) {
    const response = await apiClient.post('/tasks', data);
    return response.data;
  }

  static async updateTask(id: string, data: {
    title?: string;
    description?: string;
    assigneeId?: string;
    dueDate?: string;
    status?: 'todo' | 'in_progress' | 'done';
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  }) {
    const response = await apiClient.put(`/tasks/${id}`, data);
    return response.data;
  }

  static async updateTaskStatus(id: string, status: 'todo' | 'in_progress' | 'done') {
    const response = await apiClient.patch(`/tasks/${id}/status`, { status });
    return response.data;
  }

  static async deleteTask(id: string) {
    const response = await apiClient.delete(`/tasks/${id}`);
    return response.data;
  }

  // Health check
  static async healthCheck() {
    const response = await apiClient.get('/health');
    return response.data;
  }
}

export default ApiService;
