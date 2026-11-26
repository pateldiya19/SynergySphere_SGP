import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { config } from '@/config';
import { AuthController } from '@/controllers/AuthController';
import { GitHubIdentityController } from '@/controllers/GitHubIdentityController';
import { authenticate, validate } from '@/middleware';

const router = Router();
const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts. Try again later.' },
  skip: () => config.NODE_ENV === 'test',
});

// Auth routes
router.post(
  '/register',
  authenticationLimiter,
  validate(AuthController.registerValidation),
  AuthController.register
);
router.post(
  '/login',
  authenticationLimiter,
  validate(AuthController.loginValidation),
  AuthController.login
);
router.post(
  '/verify-email',
  authenticationLimiter,
  validate(AuthController.verificationValidation),
  AuthController.verifyEmail
);
router.post(
  '/resend-verification',
  authenticationLimiter,
  validate(AuthController.resendVerificationValidation),
  AuthController.resendVerification
);
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
