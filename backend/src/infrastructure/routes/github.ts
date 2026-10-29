import { Router } from 'express';
import { GitHubController } from '@/controllers/GitHubController';

const router = Router();
router.get('/webhook-config', GitHubController.webhookConfig);
router.post('/webhook', GitHubController.webhook);
export default router;
