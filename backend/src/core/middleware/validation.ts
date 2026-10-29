import { NextFunction, Request, Response } from 'express';
import { ValidationChain, validationResult } from 'express-validator';
import { ResponseUtils } from '@/utils';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined,
    }));

    ResponseUtils.validationError(res, formattedErrors, 'Validation failed');
  };
};

// Common validation chains
export const commonValidations = {
  email: {
    field: 'email',
    normalizeEmail: true,
    errorMessage: 'Please provide a valid email address',
  },
  password: {
    field: 'password',
    isLength: { min: 6 },
    errorMessage: 'Password must be at least 6 characters long',
  },
  name: {
    field: 'name',
    isLength: { min: 2, max: 100 },
    trim: true,
    errorMessage: 'Name must be between 2 and 100 characters',
  },
  objectId: {
    isMongoId: true,
    errorMessage: 'Invalid ID format',
  },
};
