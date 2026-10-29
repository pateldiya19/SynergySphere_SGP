import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { config } from '@/config';
import Database from '@/config/database';
import { JWTUtils, logger } from '@/utils';
import { errorHandler, notFound } from '@/middleware';
import routes from '@/routes';
import {
  isSocketTrackingProject,
  listProjectPresence,
  projectRoom,
  removeProjectPresence,
  setSocketServer,
  taskRoom,
  trackProjectPresence,
  untrackSocketPresence,
  untrackSocketProject,
  userRoom,
} from '@/infrastructure/socket';
import { Project, User } from '@/models';
import { startScheduler } from '@/infrastructure/scheduler';

class App {
  public app: express.Application;
  public server: any;
  public io: Server;
  private database: Database;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.database = Database.getInstance();
    this.io = new Server(this.server, {
      cors: {
        origin: config.FRONTEND_URL,
        methods: ['GET', 'POST'],
      },
    });

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeSocketIO();
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(
      cors({
        origin: config.FRONTEND_URL,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    // Rate limiting. Skipped under test, where a whole suite shares one client
    // IP and would otherwise exhaust the window.
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW * 60 * 1000, // minutes to milliseconds
      max: config.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => config.NODE_ENV === 'test',
    });
    this.app.use('/api', limiter);

    // Body parsing middleware
    this.app.use(
      express.json({
        limit: '10mb',
        verify: (req: any, _res, buffer) => {
          req.rawBody = buffer;
        },
      })
    );
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: '10mb',
        verify: (req: any, _res, buffer) => {
          req.rawBody = buffer;
        },
      })
    );

    // Compression middleware
    this.app.use(compression());

    // Logging middleware
    if (config.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Trust proxy for rate limiting and correct IP detection
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // Mount API routes
    this.app.use('/api', routes);

    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'SynergySphere API',
        version: '1.0.0',
        status: 'Running',
        documentation: '/api/health',
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFound);

    // Global error handler
    this.app.use(errorHandler);
  }

  private initializeSocketIO(): void {
    // Make the Socket.io server reachable from controllers for broadcasting
    setSocketServer(this.io);

    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication required'));
        const decoded = JWTUtils.verifyAccessToken(token);
        const user = await User.findById(decoded.userId).select('_id name avatarUrl isActive');
        if (!user || !user.isActive) return next(new Error('Authentication required'));
        socket.data.userId = (user._id as any).toString();
        socket.data.user = { id: socket.data.userId, name: user.name, avatarUrl: user.avatarUrl };
        next();
      } catch {
        next(new Error('Authentication required'));
      }
    });

    this.io.on('connection', socket => {
      logger.info(`Socket connected: ${socket.id}`);
      const projectJoinRequests = new Map<string, number>();
      const taskJoinRequests = new Map<string, number>();
      let joinRequestVersion = 0;

      // Join project rooms
      socket.on('join-project', async (projectId: string) => {
        if (projectJoinRequests.has(projectId) || isSocketTrackingProject(socket.id, projectId))
          return;
        const version = ++joinRequestVersion;
        projectJoinRequests.set(projectId, version);
        const project = await Project.findOne({
          _id: projectId,
          isActive: true,
          $or: [{ ownerId: socket.data.userId }, { 'members.userId': socket.data.userId }],
        }).select('_id');
        if (!project || !socket.connected || projectJoinRequests.get(projectId) !== version) {
          if (projectJoinRequests.get(projectId) === version) projectJoinRequests.delete(projectId);
          return;
        }
        socket.join(projectRoom(projectId));
        const becameOnline = trackProjectPresence(socket.id, projectId, socket.data.user);
        socket.emit('presence:state', { projectId, users: listProjectPresence(projectId) });
        if (becameOnline)
          socket
            .to(projectRoom(projectId))
            .emit('presence:changed', { projectId, user: socket.data.user, online: true });
        logger.info(`Socket ${socket.id} joined project-${projectId}`);
      });

      // Leave project rooms
      socket.on('leave-project', (projectId: string) => {
        projectJoinRequests.delete(projectId);
        if (!untrackSocketProject(socket.id, projectId)) return;
        socket.leave(projectRoom(projectId));
        const presence = removeProjectPresence(projectId, socket.data.userId);
        if (presence?.offline)
          socket
            .to(projectRoom(projectId))
            .emit('presence:changed', { projectId, user: presence.user, online: false });
        logger.info(`Socket ${socket.id} left project-${projectId}`);
      });

      socket.on('join-task', async (taskId: string) => {
        if (taskJoinRequests.has(taskId)) return;
        const version = ++joinRequestVersion;
        taskJoinRequests.set(taskId, version);
        const task = await (
          await import('@/models')
        ).Task.findOne({ _id: taskId }).select('projectId');
        if (!task || !socket.connected || taskJoinRequests.get(taskId) !== version) {
          if (taskJoinRequests.get(taskId) === version) taskJoinRequests.delete(taskId);
          return;
        }
        const project = await Project.findOne({
          _id: task.projectId,
          isActive: true,
          $or: [{ ownerId: socket.data.userId }, { 'members.userId': socket.data.userId }],
        }).select('_id');
        if (project && socket.connected && taskJoinRequests.get(taskId) === version)
          socket.join(taskRoom(taskId));
        else if (taskJoinRequests.get(taskId) === version) taskJoinRequests.delete(taskId);
      });

      socket.on('leave-task', (taskId: string) => {
        taskJoinRequests.delete(taskId);
        socket.leave(taskRoom(taskId));
      });

      socket.on(
        'discussion:typing',
        async (data: { projectId?: string; threadId?: string; isTyping?: boolean }) => {
          if (!data?.projectId || !data.threadId) return;
          const project = await Project.findOne({
            _id: data.projectId,
            isActive: true,
            $or: [{ ownerId: socket.data.userId }, { 'members.userId': socket.data.userId }],
          }).select('_id');
          if (!project) return;
          const thread = await (
            await import('@/models')
          ).Thread.findOne({ _id: data.threadId, projectId: data.projectId }).select('_id');
          if (!thread) return;
          socket.to(projectRoom(data.projectId)).emit('discussion:typing', {
            projectId: data.projectId,
            threadId: data.threadId,
            user: socket.data.user,
            isTyping: Boolean(data.isTyping),
          });
        }
      );

      socket.join(userRoom(socket.data.userId));

      // Handle disconnection
      socket.on('disconnect', () => {
        projectJoinRequests.clear();
        taskJoinRequests.clear();
        for (const projectId of untrackSocketPresence(socket.id)) {
          const presence = removeProjectPresence(projectId, socket.data.userId);
          if (presence?.offline)
            socket
              .to(projectRoom(projectId))
              .emit('presence:changed', { projectId, user: presence.user, online: false });
        }
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await this.database.connect();
      logger.info('Database connected successfully');

      // Start server
      const handleListenError = (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(
            `Backend cannot start: port ${config.PORT} is already in use. An existing server is still listening; stop that process before starting another instance.`
          );
        } else {
          logger.error(`Backend failed to listen on port ${config.PORT}:`, error);
        }
        void this.database
          .disconnect()
          .catch(disconnectError =>
            logger.error('Database cleanup after listen failure failed:', disconnectError)
          )
          .then(() => process.exit(1));
      };
      this.server.once('error', handleListenError);
      this.server.listen(config.PORT, () => {
        this.server.off('error', handleListenError);
        logger.info(`Server is running on port ${config.PORT}`);
        logger.info(`Environment: ${config.NODE_ENV}`);
        logger.info(`Frontend URL: ${config.FRONTEND_URL}`);
        startScheduler();
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.database.disconnect();
      this.server.close();
      logger.info('Server stopped gracefully');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }
}

export function createApp(): any {
  return new App().app;
}

export default App;
