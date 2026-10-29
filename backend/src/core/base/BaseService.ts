import { IService } from '@/core/interfaces';
import { BaseRepository } from './BaseRepository';
import { Document } from 'mongoose';

/**
 * Base Service class implementing common business logic
 */
export abstract class BaseService<T extends Document, CreateDTO, UpdateDTO>
  implements IService<T, CreateDTO, UpdateDTO>
{
  protected repository: BaseRepository<T>;

  constructor(repository: BaseRepository<T>) {
    this.repository = repository;
  }

  /**
   * Get all items with pagination and filtering
   */
  async getAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    [key: string]: any;
  }): Promise<{
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const { page = 1, limit = 10, search, sort = 'createdAt', order = 'desc', ...filters } = params;

    // Build filter query
    const filter: any = {};

    // Apply search if provided
    if (search) {
      filter.$or = this.buildSearchFilter(search);
    }

    // Apply additional filters
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        filter[key] = filters[key];
      }
    });

    // Build sort object
    const sortObj: any = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    return this.repository.findAll(filter, {
      page,
      limit,
      sort: sortObj,
      populate: this.getPopulateFields(),
    });
  }

  /**
   * Get item by ID
   */
  async getById(id: string): Promise<T | null> {
    return this.repository.findById(id, this.getPopulateFields());
  }

  /**
   * Create new item
   */
  async create(data: CreateDTO): Promise<T> {
    await this.validate(data);
    return this.repository.create(data as any);
  }

  /**
   * Update existing item
   */
  async update(id: string, data: UpdateDTO): Promise<T | null> {
    await this.validate(data);
    return this.repository.updateById(id, data as any);
  }

  /**
   * Delete item
   */
  async delete(id: string): Promise<boolean> {
    return this.repository.deleteById(id);
  }

  /**
   * Abstract methods to be implemented by child services
   */
  abstract validate(data: CreateDTO | UpdateDTO): Promise<void>;
  abstract buildSearchFilter(search: string): any[];
  abstract getPopulateFields(): string | string[] | undefined;
}
