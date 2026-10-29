import { Document, FilterQuery, Model, UpdateQuery } from 'mongoose';
import { IRepository } from '@/core/interfaces';

/**
 * Base Repository class implementing common database operations
 */
export abstract class BaseRepository<T extends Document> implements IRepository<T> {
  protected model: Model<T>;

  constructor(model: Model<T>) {
    this.model = model;
  }

  /**
   * Find all documents with pagination and filtering
   */
  async findAll(
    filter: FilterQuery<T> = {},
    options: {
      page?: number;
      limit?: number;
      sort?: any;
      populate?: string | string[];
    } = {}
  ): Promise<{
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const { page = 1, limit = 10, sort = { createdAt: -1 }, populate } = options;

    const skip = (page - 1) * limit;
    const total = await this.model.countDocuments(filter);
    const pages = Math.ceil(total / limit);

    let query = this.model.find(filter).sort(sort).skip(skip).limit(limit);

    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(pop => (query = query.populate(pop)));
      } else {
        query = query.populate(populate);
      }
    }

    const data = await query.exec();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    };
  }

  /**
   * Find document by ID
   */
  async findById(id: string, populate?: string | string[]): Promise<T | null> {
    let query = this.model.findById(id);

    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(pop => (query = query.populate(pop)));
      } else {
        query = query.populate(populate);
      }
    }

    return query.exec();
  }

  /**
   * Find single document by filter
   */
  async findOne(filter: FilterQuery<T>, populate?: string | string[]): Promise<T | null> {
    let query = this.model.findOne(filter);

    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(pop => (query = query.populate(pop)));
      } else {
        query = query.populate(populate);
      }
    }

    return query.exec();
  }

  /**
   * Create new document
   */
  async create(data: Partial<T>): Promise<T> {
    const document = new this.model(data);
    return document.save();
  }

  /**
   * Update document by ID
   */
  async updateById(id: string, data: UpdateQuery<T>): Promise<T | null> {
    return this.model
      .findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
      })
      .exec();
  }

  /**
   * Delete document by ID
   */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  /**
   * Count documents
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter);
  }

  /**
   * Check if document exists
   */
  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const count = await this.model.countDocuments(filter);
    return count > 0;
  }
}
