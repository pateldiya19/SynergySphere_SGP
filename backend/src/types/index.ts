export type ID = string;

export interface User {
  _id: ID;
  name: string;
  email: string;
  password: string;
  avatarUrl?: string;
  /** DEPRECATED, self-declared and unverified. Never use for authorization. */
  githubLogin?: string;
  /** OAuth-verified GitHub identity; the only one verification may trust. */
  github?: {
    id: number;
    login: string;
    avatarUrl?: string;
    linkedAt: Date;
  };
  isActive: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  user: Omit<User, 'password'>;
  token: string;
  refreshToken: string;
  expiresAt: number;
}

export type ProjectRole = 'owner' | 'manager' | 'member';

export interface ProjectMember {
  userId: ID;
  role: ProjectRole;
  joinedAt: Date;
}

export interface Project {
  _id: ID;
  name: string;
  description?: string;
  ownerId: ID;
  members: ProjectMember[];
  tags?: string[];
  deadline?: Date;
  isActive: boolean;
  github?: GitHubRepository;
  taskSequence?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  url?: string;
  repositoryId?: number;
  lastDeliveryAt?: Date;
  lastDeliveryEvent?: string;
}

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'ready_for_review'
  | 'changes_requested'
  | 'done';

export type TaskProofType = 'github' | 'demo_url' | 'developer_notes';

export interface TaskProofCommit {
  sha: string;
  message?: string;
  url?: string;
}

export interface TaskProof {
  _id?: ID;
  type: TaskProofType;
  source: 'user' | 'github';
  submittedBy?: ID;
  submittedAt: Date;
  url?: string;
  notes?: string;
  repository?: string;
  pullRequestNumber?: number;
  pullRequestTitle?: string;
  pullRequestAuthor?: string;
  pullRequestAuthorId?: number;
  authorMatchesAssignee?: boolean;
  state?: 'open' | 'closed' | 'merged';
  branch?: string;
  commits?: TaskProofCommit[];
  commitCount?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  merged?: boolean;
  lastUpdatedAt?: Date;
}

export interface TaskProofReview {
  _id?: ID;
  reviewerId: ID;
  decision: 'approved' | 'changes_requested';
  comment?: string;
  reviewedAt: Date;
}

export interface TaskSubtask {
  _id?: ID;
  title: string;
  completed: boolean;
}

export interface TaskDependency {
  _id?: ID;
  taskKey?: string;
  title: string;
  status: TaskStatus;
}

export interface TaskAttachment {
  _id?: ID;
  filename: string;
  size: number;
  mimeType: string;
  uploaderId: ID;
  uploadedAt: Date;
}

export interface Task {
  _id: ID;
  projectId: ID;
  title: string;
  taskKey: string;
  description?: string;
  requiresGitHubEvidence?: boolean;
  assigneeId?: ID;
  dueDate?: Date;
  status: TaskStatus;
  tags?: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subtasks?: TaskSubtask[];
  dependencies?: ID[];
  attachments?: TaskAttachment[];
  proofOfWork?: TaskProof[];
  proofReviews?: TaskProofReview[];
  createdAt: Date;
  updatedAt: Date;
}

export type TaskHistoryType =
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'DEADLINE_CHANGED'
  | 'TASK_UPDATED'
  | 'TASK_DELETED'
  | 'DEPENDENCY_ADDED'
  | 'DEPENDENCY_REMOVED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'GIT_COMMIT'
  | 'PULL_REQUEST_CREATED'
  | 'PULL_REQUEST_UPDATED'
  | 'PULL_REQUEST_CLOSED'
  | 'PULL_REQUEST_MERGED';

export interface TaskHistory {
  _id: ID;
  taskId?: ID;
  projectId: ID;
  actorId?: ID;
  type: TaskHistoryType;
  source: 'user' | 'github' | 'system';
  description: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Thread {
  _id: ID;
  projectId: ID;
  title: string;
  authorId: ID;
  createdAt: Date;
  updatedAt: Date;
  replyCount: number;
  lastReplyAt?: Date;
  tags?: string[];
}

export interface Reply {
  _id: ID;
  threadId: ID;
  authorId: ID;
  body: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType =
  | 'task_assigned'
  | 'task_reassigned'
  | 'task_unassigned'
  | 'task_status_changed'
  | 'task_completed'
  | 'task_due'
  | 'task_overdue'
  | 'task_comment'
  | 'task_dependency_changed'
  | 'task_blocked'
  | 'thread_new'
  | 'reply_new'
  | 'project_invite'
  | 'project_invite_accepted'
  | 'project_invite_declined'
  | 'project_invite_cancelled'
  | 'project_member_added'
  | 'project_member_removed';

export interface Notification {
  _id: ID;
  userId: ID;
  type: NotificationType;
  title: string;
  message: string;
  payload: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  filter?: Record<string, any>;
}

export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
