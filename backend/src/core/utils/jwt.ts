import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { JwtPayload } from '@/types';

export class JWTUtils {
  static generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRE as jwt.SignOptions['expiresIn'],
    });
  }

  static generateRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRE as jwt.SignOptions['expiresIn'],
    });
  }

  static verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  static verifyRefreshToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.JWT_REFRESH_SECRET) as JwtPayload;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  static decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch (error) {
      return null;
    }
  }
}

export default JWTUtils;
