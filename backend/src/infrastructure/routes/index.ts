import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import projectRoutes from './projects';
import taskRoutes from './tasks';
import discussionRoutes from './discussions';
import githubRoutes from './github';
import notificationRoutes from './notifications';
import searchRoutes from './search';
import projectActivityRoutes from './projectActivity';
import invitationRoutes from './invitations';
import { DashboardController } from '@/controllers/DashboardController';
import { authenticate } from '@/middleware';

const router = Router();

router.use('/github', githubRoutes);

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/discussions', discussionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/invitations', invitationRoutes);
router.use('/search', searchRoutes);
router.use('/projects', projectActivityRoutes);
router.get('/dashboard', authenticate, DashboardController.getDashboard);

// Health check route
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SynergySphere API is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
