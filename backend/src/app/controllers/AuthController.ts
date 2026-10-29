import { Request, Response } from 'express';
import { body, query } from 'express-validator';
import { User } from '@/models';
import { JWTUtils, ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';

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
    try {
      const { name, email, password } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        ResponseUtils.error(res, 'User already exists with this email', 409);
        return;
      }

      // Create new user
      const user = new User({
        name,
        email,
        password, // Will be hashed by the pre-save middleware
      });

      await user.save();

      // Generate tokens
      const accessToken = JWTUtils.generateAccessToken({
        userId: (user._id as any).toString(),
        email: user.email,
      });

      const refreshToken = JWTUtils.generateRefreshToken({
        userId: (user._id as any).toString(),
        email: user.email,
      });

      // Remove password from response
      const userResponse = user.getPublicProfile();

      ResponseUtils.created(
        res,
        {
          user: userResponse,
          accessToken,
          refreshToken,
        },
        'User registered successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
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
      if (!user || !user.isActive) {
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
