/**
 * @file ERest 自定义错误类
 * @author Yourtion Guo <yourtion@gmail.com>
 */

/** 错误代码类型 */
export type ERestErrorCode =
  | "MISSING_PARAM"
  | "INVALID_PARAM"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR";

/** 错误详情 */
export interface ERestErrorDetails {
  field?: string;
  expected?: string;
  received?: unknown;
  [key: string]: unknown;
}

/**
 * ERest 自定义错误类
 * 提供统一的错误结构，便于错误处理和格式化输出
 */
export class ERestError extends Error {
  /** 错误代码 */
  public readonly code: ERestErrorCode;
  /** 错误详情 */
  public readonly details?: ERestErrorDetails;
  /** HTTP 状态码 */
  public readonly statusCode: number;

  constructor(code: ERestErrorCode, message: string, details?: ERestErrorDetails, statusCode = 400) {
    super(message);
    this.name = "ERestError";
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;

    // 维护正确的原型链
    Object.setPrototypeOf(this, ERestError.prototype);
  }

  /** 创建缺少参数错误 */
  static missingParam(paramName: string): ERestError {
    return new ERestError("MISSING_PARAM", `missing required parameter '${paramName}'`, { field: paramName });
  }

  /** 创建参数无效错误 */
  static invalidParam(paramName: string, expected?: string, received?: unknown): ERestError {
    const message = expected
      ? `'${paramName}' should be valid ${expected}`
      : `incorrect parameter '${paramName}'`;
    return new ERestError("INVALID_PARAM", message, { field: paramName, expected, received });
  }

  /** 创建内部错误 */
  static internal(message: string): ERestError {
    return new ERestError("INTERNAL_ERROR", `internal error ${message}`, undefined, 500);
  }

  /** 创建验证错误 */
  static validation(message: string, details?: ERestErrorDetails): ERestError {
    return new ERestError("VALIDATION_ERROR", message, details);
  }

  /** 转换为 JSON */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
    };
  }
}
