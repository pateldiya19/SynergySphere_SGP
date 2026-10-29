import { NextFunction, Request, Response } from 'express';
import { logger, ResponseUtils } from '@/utils';

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let message = error.message || 'Internal server error';
  let statusCode = error.statusCode || 500;

  // Log error
  logger.error(`Error ${statusCode}: ${message}`, {
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map((err: any) => ({
      field: err.path,
      message: err.message,
    }));
    ResponseUtils.validationError(res, errors, 'Validation failed');
    return;
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    message = `${field} already exists`;
    statusCode = 409;
  }

  // Mongoose cast error
  if (error.name === 'CastError') {
    message = 'Invalid ID format';
    statusCode = 400;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    message = 'Invalid token';
    statusCode = 401;
  }

  if (error.name === 'TokenExpiredError') {
    message = 'Token expired';
    statusCode = 401;
  }

  ResponseUtils.error(res, message, statusCode);
};

export const notFound = (req: Request, res: Response, _next: NextFunction): void => {
  ResponseUtils.notFound(res, `Route ${req.originalUrl} not found`);
};

/** Request handler that may return a promise; rejections are forwarded to `next`. */
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;

export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
