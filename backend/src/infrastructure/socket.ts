import { Server } from 'socket.io';

/**
 * Small registry so controllers can broadcast over the Socket.io server that
 * App creates, without importing App (which would be a circular import).
 */
let io: Server | null = null;
const projectPresence = new Map<
  string,
  Map<string, { count: number; user: { id: string; name: string; avatarUrl?: string } }>
>();
const socketProjects = new Map<string, Set<string>>();

export const setSocketServer = (server: Server): void => {
  io = server;
};

export const getSocketServer = (): Server | null => io;

export const projectRoom = (projectId: string): string => `project-${projectId}`;
export const taskRoom = (taskId: string): string => `task-${taskId}`;
export const userRoom = (userId: string): string => `user-${userId}`;

export const emitToProject = (projectId: string, event: string, payload: unknown): void => {
  if (!io) return;
  io.to(projectRoom(projectId)).emit(event, payload);
};

export const emitToTask = (taskId: string, event: string, payload: unknown): void => {
  if (!io) return;
  io.to(taskRoom(taskId)).emit(event, payload);
};

export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
};

export const trackProjectPresence = (
  socketId: string,
  projectId: string,
  user: { id: string; name: string; avatarUrl?: string }
): boolean => {
  const projects = socketProjects.get(socketId) || new Set<string>();
  if (projects.has(projectId)) return false;

  const users = projectPresence.get(projectId) || new Map();
  const existing = users.get(user.id);
  users.set(user.id, { count: (existing?.count || 0) + 1, user });
  projectPresence.set(projectId, users);
  projects.add(projectId);
  socketProjects.set(socketId, projects);
  return !existing;
};

export const isSocketTrackingProject = (socketId: string, projectId: string): boolean =>
  socketProjects.get(socketId)?.has(projectId) || false;

export const untrackSocketProject = (socketId: string, projectId: string): boolean => {
  const projects = socketProjects.get(socketId);
  if (!projects?.delete(projectId)) return false;
  if (projects.size === 0) socketProjects.delete(socketId);
  return true;
};

export const untrackSocketPresence = (socketId: string): string[] => {
  const projects = [...(socketProjects.get(socketId) || [])];
  socketProjects.delete(socketId);
  return projects;
};

export const removeProjectPresence = (
  projectId: string,
  userId: string
): { user: { id: string; name: string; avatarUrl?: string }; offline: boolean } | null => {
  const users = projectPresence.get(projectId);
  const existing = users?.get(userId);
  if (!users || !existing) return null;
  if (existing.count > 1) {
    users.set(userId, { ...existing, count: existing.count - 1 });
    return { user: existing.user, offline: false };
  }
  users.delete(userId);
  if (users.size === 0) projectPresence.delete(projectId);
  return { user: existing.user, offline: true };
};

export const listProjectPresence = (
  projectId: string
): { id: string; name: string; avatarUrl?: string }[] => {
  return [...(projectPresence.get(projectId)?.values() || [])].map(entry => entry.user);
};
