import { QueryOptions } from '@/types';

/**
 * Escape every regular-expression metacharacter so a search term is matched
 * literally. Without this, `?search=` is a regex-injection and ReDoS vector:
 * a term like `(a+)+$` causes catastrophic backtracking inside MongoDB.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class QueryUtils {
  static parseQueryOptions(query: any): QueryOptions {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
    const sort = query.sort || 'createdAt';
    const order = query.order === 'asc' ? 'asc' : 'desc';
    const search = query.search?.trim() || '';

    return {
      page,
      limit,
      sort,
      order,
      search,
    };
  }

  static buildSortObject(sort: string, order: 'asc' | 'desc'): any {
    return { [sort]: order === 'asc' ? 1 : -1 };
  }

  static buildSearchQuery(search: string, fields: string[]): any {
    if (!search) return {};

    // Input is escaped above, so the pattern is a literal substring match.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    return {
      $or: fields.map(field => ({
        [field]: searchRegex,
      })),
    };
  }

  static calculateSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  static buildDateRangeQuery(field: string, startDate?: string, endDate?: string): any {
    const query: any = {};

    if (startDate || endDate) {
      query[field] = {};

      if (startDate) {
        query[field].$gte = new Date(startDate);
      }

      if (endDate) {
        query[field].$lte = new Date(endDate);
      }
    }

    return query;
  }

  static sanitizeQuery(query: any): any {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export default QueryUtils;
