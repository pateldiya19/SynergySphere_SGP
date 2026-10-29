import { NextFunction, Request, Response } from 'express';
import { JWTUtils, ResponseUtils } from '@/utils';
import { User } from '@/models';
import { JwtPayload } from '@/types';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ResponseUtils.unauthorized(res, 'Access token is required');
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      ResponseUtils.unauthorized(res, 'Access token is required');
      return;
    }

    const decoded: JwtPayload = JWTUtils.verifyAccessToken(token);

    const user = await User.findById(decoded.userId).select('+password');

    if (!user || !user.isActive) {
      ResponseUtils.unauthorized(res, 'User not found or inactive');
      return;
    }

    // Update last seen
    user.lastSeen = new Date();
    await user.save();

    req.user = user;
    next();
  } catch (error: any) {
    ResponseUtils.unauthorized(res, error.message);
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      if (token) {
        const decoded: JwtPayload = JWTUtils.verifyAccessToken(token);
        const user = await User.findById(decoded.userId);

        if (user && user.isActive) {
          req.user = user;
        }
      }
    }

    next();
  } catch (error) {
    // Ignore errors for optional authentication
    next();
  }
};
