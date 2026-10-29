import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { ICrudController } from '@/core/interfaces';
import { ResponseUtils } from '@/core/utils';

/**
 * Base Controller class that implements common functionality
 */
export abstract class BaseController implements ICrudController {
  /**
   * Handle validation errors
   */
  protected handleValidation(req: Request, res: Response): boolean {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      ResponseUtils.validationError(res, errors.array(), 'Validation failed');
      return false;
    }
    return true;
  }

  /**
   * Handle async operations with try-catch
   */
  protected async handleAsync(
    req: Request,
    res: Response,
    next: NextFunction,
    operation: (req: Request, res: Response, next?: NextFunction) => Promise<void>
  ): Promise<void> {
    try {
      await operation(req, res, next);
    } catch (error: any) {
      console.error('Controller Error:', error);
      ResponseUtils.serverError(res, error.message);
    }
  }

  /**
   * Abstract methods to be implemented by child controllers
   */
  abstract handle(req: Request, res: Response, next?: NextFunction): Promise<void> | void;
  abstract index(req: Request, res: Response, next?: NextFunction): Promise<void>;
  abstract show(req: Request, res: Response, next?: NextFunction): Promise<void>;
  abstract store(req: Request, res: Response, next?: NextFunction): Promise<void>;
  abstract update(req: Request, res: Response, next?: NextFunction): Promise<void>;
  abstract destroy(req: Request, res: Response, next?: NextFunction): Promise<void>;
}
