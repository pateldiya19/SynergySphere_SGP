/**
 * Data Transfer Objects for Project operations
 */

export interface CreateProjectDTO {
  title: string;
  description: string;
  category: 'development' | 'design' | 'marketing' | 'research';
  status?: 'planning' | 'in_progress' | 'completed' | 'on_hold';
  priority?: 'low' | 'medium' | 'high';
  startDate?: Date;
  endDate?: Date;
  members?: string[];
  budget?: number;
}

export interface UpdateProjectDTO {
  title?: string;
  description?: string;
  category?: 'development' | 'design' | 'marketing' | 'research';
  status?: 'planning' | 'in_progress' | 'completed' | 'on_hold';
  priority?: 'low' | 'medium' | 'high';
  startDate?: Date;
  endDate?: Date;
  members?: string[];
  budget?: number;
  progress?: number;
}

export interface ProjectMemberDTO {
  userId: string;
  role: 'owner' | 'manager' | 'member';
  joinedAt?: Date;
}

export interface ProjectResponseDTO {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  startDate?: Date;
  endDate?: Date;
  owner: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  members: ProjectMemberDTO[];
  progress: number;
  budget?: number;
  tasksCount: number;
  completedTasksCount: number;
  createdAt: Date;
  updatedAt: Date;
}
