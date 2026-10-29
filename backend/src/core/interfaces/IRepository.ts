import { Document, FilterQuery, UpdateQuery } from 'mongoose';

/**
 * Base Repository Interface
 * Provides common database operations
 */
export interface IRepository<T extends Document> {
  /**
   * Find all documents with optional filtering and pagination
   */
  findAll(
    filter?: FilterQuery<T>,
    options?: {
      page?: number;
      limit?: number;
      sort?: any;
      populate?: string | string[];
    }
  ): Promise<{
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }>;

  /**
   * Find a single document by ID
   */
  findById(id: string, populate?: string | string[]): Promise<T | null>;

  /**
   * Find a single document by filter
   */
  findOne(filter: FilterQuery<T>, populate?: string | string[]): Promise<T | null>;

  /**
   * Create a new document
   */
  create(data: Partial<T>): Promise<T>;

  /**
   * Update a document by ID
   */
  updateById(id: string, data: UpdateQuery<T>): Promise<T | null>;

  /**
   * Delete a document by ID
   */
  deleteById(id: string): Promise<boolean>;

  /**
   * Count documents matching filter
   */
  count(filter?: FilterQuery<T>): Promise<number>;

  /**
   * Check if document exists
   */
  exists(filter: FilterQuery<T>): Promise<boolean>;
}
