/**
 * Data Transfer Objects for User operations
 */

export interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'manager' | 'user';
  avatar?: string;
  bio?: string;
  skills?: string[];
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  avatar?: string;
  bio?: string;
  skills?: string[];
  isActive?: boolean;
}

export interface UserLoginDTO {
  email: string;
  password: string;
}

export interface UserResponseDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  bio?: string;
  skills: string[];
  isActive: boolean;
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}
