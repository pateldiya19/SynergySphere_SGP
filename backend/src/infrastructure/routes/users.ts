import { Router } from 'express';
import { AuthController } from '@/controllers/AuthController';
import { authenticate, validate } from '@/middleware';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// User routes
router.get('/search', validate(AuthController.searchValidation), AuthController.searchUsers);
router.get('/profile', AuthController.getProfile);
router.put('/profile', AuthController.updateProfile);
router.post('/logout', AuthController.logout);

export default router;
