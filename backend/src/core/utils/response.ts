import { Response } from 'express';
import { ApiResponse } from '@/types';

export class ResponseUtils {
  static success<T>(
    res: Response,
    data?: T,
    message?: string,
    statusCode: number = 200
  ): Response<ApiResponse<T>> {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
    });
  }

  static successWithPagination<T>(
    res: Response,
    data: T,
    pagination: Record<string, unknown>,
    message?: string
  ): Response<ApiResponse<T>> {
    return res.status(200).json({
      success: true,
      data,
      message,
      pagination,
    });
  }

  static error(
    res: Response,
    error: string,
    statusCode: number = 400,
    data?: any
  ): Response<ApiResponse> {
    return res.status(statusCode).json({
      success: false,
      error,
      data,
    });
  }

  static paginated<T>(
    res: Response,
    data: T[],
    page: number,
    limit: number,
    total: number,
    message?: string
  ): Response<ApiResponse<T[]>> {
    const pages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data,
      message,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
  }

  static created<T>(res: Response, data: T, message?: string): Response<ApiResponse<T>> {
    return res.status(201).json({
      success: true,
      data,
      message: message || 'Resource created successfully',
    });
  }

  static noContent(res: Response, message?: string): Response<ApiResponse> {
    return res.status(204).json({
      success: true,
      message: message || 'Operation completed successfully',
    });
  }

  static notFound(res: Response, message: string = 'Resource not found'): Response<ApiResponse> {
    return res.status(404).json({
      success: false,
      error: message,
    });
  }

  static unauthorized(
    res: Response,
    message: string = 'Unauthorized access'
  ): Response<ApiResponse> {
    return res.status(401).json({
      success: false,
      error: message,
    });
  }

  static forbidden(res: Response, message: string = 'Access forbidden'): Response<ApiResponse> {
    return res.status(403).json({
      success: false,
      error: message,
    });
  }

  static validationError(
    res: Response,
    errors: any,
    message: string = 'Validation failed'
  ): Response<ApiResponse> {
    return res.status(422).json({
      success: false,
      error: message,
      data: errors,
      errors,
    });
  }

  static serverError(
    res: Response,
    message: string = 'Internal server error'
  ): Response<ApiResponse> {
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
}

export default ResponseUtils;
