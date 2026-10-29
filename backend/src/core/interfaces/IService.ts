/**
 * Base Service Interface
 * Business logic layer interface
 */
export interface IService<T, CreateDTO, UpdateDTO> {
  /**
   * Get all items with pagination and filtering
   */
  getAll(params: {
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
  }>;

  /**
   * Get item by ID
   */
  getById(id: string): Promise<T | null>;

  /**
   * Create new item
   */
  create(data: CreateDTO): Promise<T>;

  /**
   * Update existing item
   */
  update(id: string, data: UpdateDTO): Promise<T | null>;

  /**
   * Delete item
   */
  delete(id: string): Promise<boolean>;

  /**
   * Validate business rules
   */
  validate(data: CreateDTO | UpdateDTO): Promise<void>;
}
