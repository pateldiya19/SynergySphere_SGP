import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { body, query } from 'express-validator';
import { EmailVerificationCode, User } from '@/models';
import { config } from '@/config';
import { EmailService } from '@/services/EmailService';
import { JWTUtils, logger, ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';

const VERIFICATION_CODE_TTL_MS = 5 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

function hashVerificationCode(email: string, code: string): string {
  return createHmac('sha256', config.JWT_SECRET)
    .update(`email-verification:${email}:${code}`)
    .digest('hex');
}

function codesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return (
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export class AuthController {
  // Validation rules
  static registerValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
  ];

  static loginValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ];

  static verificationValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('code')
      .matches(/^\d{6}$/)
      .withMessage('Enter the 6-digit verification code'),
  ];

  static resendVerificationValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  ];

  static searchValidation = [
    query('email').isEmail().normalizeEmail().withMessage('A valid email is required'),
  ];

  static async searchUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = await User.findOne({ email: req.query.email }).select(
        'name email avatarUrl isActive'
      );
      if (!user || !user.isActive) {
        ResponseUtils.notFound(res, 'User not found or inactive');
        return;
      }

      ResponseUtils.success(res, [user.getPublicProfile()], 'Users retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Register new user
  static async register(req: Request, res: Response): Promise<void> {
    let userId: string | undefined;
    try {
      const { name, password } = req.body;
      const email = String(req.body.email).trim().toLowerCase();

      if (!EmailService.isConfigured()) {
        ResponseUtils.error(
          res,
          'Email delivery is not configured. Registration cannot continue.',
          503
        );
        return;
      }

      if (await User.exists({ email })) {
        ResponseUtils.error(res, 'User already exists with this email', 409);
        return;
      }

      const user = new User({
        name,
        email,
        password,
        isEmailVerified: false,
      });
      await user.save();
      userId = String(user._id);

      const now = new Date();
      const code = String(randomInt(100000, 1000000));
      await EmailVerificationCode.create({
        email,
        codeHash: hashVerificationCode(email, code),
        expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS),
        resendAvailableAt: new Date(now.getTime() + VERIFICATION_RESEND_COOLDOWN_MS),
        attempts: 0,
      });

      const delivery = await EmailService.sendVerificationCode({ to: email, code });
      if (!delivery.sent) {
        await EmailVerificationCode.deleteOne({ email });
        await User.deleteOne({ _id: user._id, isEmailVerified: false });
        ResponseUtils.error(
          res,
          `The verification email could not be delivered: ${delivery.error}`,
          503
        );
        return;
      }

      ResponseUtils.created(
        res,
        {
          email,
          requiresVerification: true,
          resendAvailableAt: new Date(now.getTime() + VERIFICATION_RESEND_COOLDOWN_MS),
        },
        'Verification code sent. It expires in 5 minutes.'
      );
    } catch (error: any) {
      if (userId) {
        await EmailVerificationCode.deleteOne({ email: String(req.body.email).toLowerCase() });
        await User.deleteOne({ _id: userId, isEmailVerified: false });
      }
      if (error?.code === 11000) {
        ResponseUtils.error(res, 'User already exists with this email', 409);
        return;
      }
      logger.error('Registration failed:', error);
      ResponseUtils.serverError(res, 'Registration could not be completed.');
    }
  }

  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const email = String(req.body.email).trim().toLowerCase();
      const code = String(req.body.code);
      const now = new Date();
      const challenge = await EmailVerificationCode.findOne({ email }).select('+codeHash');

      if (!challenge) {
        ResponseUtils.error(res, 'Verification code is invalid or expired.', 400);
        return;
      }
      if (challenge.expiresAt <= now) {
        await EmailVerificationCode.deleteOne({ _id: challenge._id });
        ResponseUtils.error(res, 'Verification code expired. Request a new code.', 400);
        return;
      }
      if (challenge.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        ResponseUtils.error(res, 'Too many incorrect codes. Request a new code.', 429);
        return;
      }

      if (!codesMatch(challenge.codeHash, hashVerificationCode(email, code))) {
        const updated = await EmailVerificationCode.findOneAndUpdate(
          {
            _id: challenge._id,
            expiresAt: { $gt: now },
            attempts: { $lt: MAX_VERIFICATION_ATTEMPTS },
          },
          { $inc: { attempts: 1 } },
          { new: true }
        );
        if (!updated || updated.attempts >= MAX_VERIFICATION_ATTEMPTS) {
          await EmailVerificationCode.deleteOne({
            _id: challenge._id,
            attempts: { $gte: MAX_VERIFICATION_ATTEMPTS },
          });
          ResponseUtils.error(res, 'Too many incorrect codes. Request a new code.', 429);
          return;
        }
        ResponseUtils.error(
          res,
          `Invalid verification code. ${MAX_VERIFICATION_ATTEMPTS - updated.attempts} attempts remaining.`,
          400
        );
        return;
      }

      const consumed = await EmailVerificationCode.deleteOne({
        _id: challenge._id,
        codeHash: challenge.codeHash,
        expiresAt: { $gt: now },
        attempts: { $lt: MAX_VERIFICATION_ATTEMPTS },
      });
      if (consumed.deletedCount !== 1) {
        ResponseUtils.error(res, 'Verification code is invalid, expired, or already used.', 400);
        return;
      }

      const user = await User.findOneAndUpdate(
        { email, isEmailVerified: false },
        { $set: { isEmailVerified: true } },
        { new: true }
      );
      if (!user && !(await User.exists({ email, isEmailVerified: true }))) {
        ResponseUtils.error(res, 'Account not found. Register again to request a new code.', 404);
        return;
      }

      ResponseUtils.success(res, { email, verified: true }, 'Email verified. You can now sign in.');
    } catch (error: any) {
      logger.error('Email verification failed:', error);
      ResponseUtils.serverError(res, 'Email verification could not be completed.');
    }
  }

  static async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const email = String(req.body.email).trim().toLowerCase();
      const genericMessage = 'If the account needs verification, a new code will be sent.';
      const user = await User.findOne({ email }).select('_id isEmailVerified');
      if (!user || user.isEmailVerified) {
        ResponseUtils.success(res, { email }, genericMessage);
        return;
      }
      if (!EmailService.isConfigured()) {
        ResponseUtils.error(res, 'Email delivery is not configured. Please contact support.', 503);
        return;
      }

      const now = new Date();
      const existing = await EmailVerificationCode.findOne({ email });
      if (existing && existing.resendAvailableAt > now) {
        ResponseUtils.error(
          res,
          `Please wait ${Math.ceil((existing.resendAvailableAt.getTime() - now.getTime()) / 1000)} seconds before requesting another code.`,
          429
        );
        return;
      }

      const code = String(randomInt(100000, 1000000));
      const update = {
        codeHash: hashVerificationCode(email, code),
        expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS),
        resendAvailableAt: new Date(now.getTime() + VERIFICATION_RESEND_COOLDOWN_MS),
        attempts: 0,
      };

      let challenge;
      if (existing) {
        challenge = await EmailVerificationCode.findOneAndUpdate(
          { _id: existing._id, resendAvailableAt: { $lte: now } },
          { $set: update },
          { new: true }
        );
        if (!challenge) {
          ResponseUtils.error(res, 'Please wait before requesting another code.', 429);
          return;
        }
      } else {
        try {
          challenge = await EmailVerificationCode.create({ email, ...update });
        } catch (error: any) {
          if (error?.code === 11000) {
            ResponseUtils.error(res, 'Please wait before requesting another code.', 429);
            return;
          }
          throw error;
        }
      }

      const delivery = await EmailService.sendVerificationCode({ to: email, code });
      if (!delivery.sent) {
        await EmailVerificationCode.deleteOne({
          _id: challenge._id,
          codeHash: update.codeHash,
        });
        ResponseUtils.error(
          res,
          `The verification email could not be delivered: ${delivery.error}`,
          503
        );
        return;
      }
      ResponseUtils.success(
        res,
        { email, resendAvailableAt: challenge.resendAvailableAt },
        genericMessage
      );
    } catch (error: any) {
      logger.error('Verification code resend failed:', error);
      ResponseUtils.serverError(res, 'A verification code could not be sent.');
    }
  }

  // Login user
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      // Find user and include password for comparison
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        ResponseUtils.unauthorized(res, 'Invalid credentials');
        return;
      }

      // Check if user is active
      if (!user.isActive) {
        ResponseUtils.unauthorized(res, 'Account is deactivated');
        return;
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        ResponseUtils.unauthorized(res, 'Invalid credentials');
        return;
      }
      if (!user.isEmailVerified) {
        ResponseUtils.forbidden(res, 'Please verify your email before signing in.');
        return;
      }

      // Generate tokens
      const accessToken = JWTUtils.generateAccessToken({
        userId: (user._id as any).toString(),
        email: user.email,
      });

      const refreshToken = JWTUtils.generateRefreshToken({
        userId: (user._id as any).toString(),
        email: user.email,
      });

      // Update last seen
      user.lastSeen = new Date();
      await user.save();

      // Remove password from response
      const userResponse = user.getPublicProfile();

      ResponseUtils.success(
        res,
        {
          user: userResponse,
          accessToken,
          refreshToken,
        },
        'Login successful'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Get current user profile
  static async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      ResponseUtils.success(res, user.getPublicProfile(), 'Profile retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Update user profile
  static async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name, avatarUrl, githubLogin } = req.body;
      const userId = req.user._id;

      // A GitHub username can no longer be self-declared. It used to be writable
      // here and was then trusted to decide whether a pull request author was
      // the task's assignee -- so typing a colleague's username was enough to
      // have their commits reported as your own verified work. Identity now
      // comes from the OAuth flow in GitHubIdentityController, which is the only
      // writer of the verified `user.github` field. Rejecting loudly rather than
      // ignoring the field keeps an older client from believing it succeeded.
      if (githubLogin !== undefined) {
        ResponseUtils.error(
          res,
          'A GitHub username cannot be set directly, because a self-declared one proves ' +
            'nothing. Link your account via POST /api/auth/github/start instead.',
          400
        );
        return;
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (avatarUrl) updateData.avatarUrl = avatarUrl;

      const user = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        ResponseUtils.notFound(res, 'User not found');
        return;
      }

      ResponseUtils.success(res, user.getPublicProfile(), 'Profile updated successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Refresh access token
  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        ResponseUtils.unauthorized(res, 'Refresh token is required');
        return;
      }

      const decoded = JWTUtils.verifyRefreshToken(refreshToken);

      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive || !user.isEmailVerified) {
        ResponseUtils.unauthorized(res, 'User not found or inactive');
        return;
      }

      // Generate new access token
      const newAccessToken = JWTUtils.generateAccessToken({
        userId: (user._id as any).toString(),
        email: user.email,
      });

      ResponseUtils.success(
        res,
        {
          accessToken: newAccessToken,
        },
        'Token refreshed successfully'
      );
    } catch (error: any) {
      ResponseUtils.unauthorized(res, 'Invalid refresh token');
    }
  }

  // Logout (client-side token removal, but can be used for logging)
  static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // In a more complex setup, you might want to blacklist the token
      // For now, we'll just return success
      ResponseUtils.success(res, null, 'Logout successful');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
