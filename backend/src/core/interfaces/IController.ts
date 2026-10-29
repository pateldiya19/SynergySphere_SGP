import { NextFunction, Request, Response } from 'express';

/**
 * Base Controller Interface
 * All controllers should implement this interface
 */
export interface IController {
  /**
   * Handle HTTP requests
   */
  handle(req: Request, res: Response, next?: NextFunction): Promise<void> | void;
}

/**
 * CRUD Controller Interface
 * For controllers that handle CRUD operations
 */
export interface ICrudController extends IController {
  /**
   * Get all resources with pagination and filtering
   */
  index(req: Request, res: Response, next?: NextFunction): Promise<void>;

  /**
   * Get a single resource by ID
   */
  show(req: Request, res: Response, next?: NextFunction): Promise<void>;

  /**
   * Create a new resource
   */
  store(req: Request, res: Response, next?: NextFunction): Promise<void>;

  /**
   * Update an existing resource
   */
  update(req: Request, res: Response, next?: NextFunction): Promise<void>;

  /**
   * Delete a resource
   */
  destroy(req: Request, res: Response, next?: NextFunction): Promise<void>;
}
