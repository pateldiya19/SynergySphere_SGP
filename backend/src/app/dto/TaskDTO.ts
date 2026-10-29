/**
 * Data Transfer Objects for Task operations
 */

import { TaskAttachment, TaskStatus } from '@/types';

export interface CreateTaskDTO {
  title: string;
  description: string;
  projectId: string;
  assignedTo?: string;
  status?: TaskStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  tags?: string[];
  attachments?: TaskAttachment[];
  timeEstimate?: number;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  assignedTo?: string;
  status?: TaskStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  tags?: string[];
  attachments?: TaskAttachment[];
  timeEstimate?: number;
  timeSpent?: number;
}

export interface TaskResponseDTO {
  id: string;
  title: string;
  description: string;
  project: {
    id: string;
    title: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  status: string;
  priority: string;
  dueDate?: Date;
  tags: string[];
  attachments: TaskAttachment[];
  timeEstimate?: number;
  timeSpent?: number;
  createdAt: Date;
  updatedAt: Date;
}
