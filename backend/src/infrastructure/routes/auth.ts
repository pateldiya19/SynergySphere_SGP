import { Router } from 'express';
import { AuthController } from '@/controllers/AuthController';
import { GitHubIdentityController } from '@/controllers/GitHubIdentityController';
import { authenticate, validate } from '@/middleware';

const router = Router();

// Auth routes
router.post('/register', validate(AuthController.registerValidation), AuthController.register);
router.post('/login', validate(AuthController.loginValidation), AuthController.login);
router.post('/refresh-token', AuthController.refreshToken);
router.get('/profile', authenticate, AuthController.getProfile);

// GitHub identity verification. `/callback` is intentionally unauthenticated:
// the browser arrives from GitHub without a bearer token, and the account being
// linked is read from the single-use `state` row rather than the request.
router.get('/github/status', authenticate, GitHubIdentityController.status);
router.post('/github/start', authenticate, GitHubIdentityController.start);
router.get('/github/callback', GitHubIdentityController.callback);
router.delete('/github/link', authenticate, GitHubIdentityController.unlink);

export default router;
