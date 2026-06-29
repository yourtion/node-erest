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
    const message = expected ? `'${paramName}' should be valid ${expected}` : `incorrect parameter '${paramName}'`;
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

/**
 * 错误响应格式器：把任意错误归一化为 { status, body } 结构。
 *
 * 用户在 app 级错误中间件中调用（三框架一行替换），实现跨框架统一的错误响应体。
 * 不由 adapter 内置——adapter 只做桥接，错误响应格式由用户在 app 级决定。
 *
 * @example
 * // Express
 * app.use((err, _req, res, _next) => {
 *   const { status, body } = defaultErrorFormatter(err);
 *   res.status(status).json(body);
 * });
 * // Koa
 * app.use(async (ctx, next) => {
 *   try { await next(); }
 *   catch (err) {
 *     const { status, body } = defaultErrorFormatter(err);
 *     ctx.status = status; ctx.body = body;
 *   }
 * });
 */
export interface ErrorFormatter {
  (err: ERestError | Error): { status: number; body: unknown };
}

/** 内置默认格式器（与 examples 错误中间件一致），可直接用或自定义 */
export const defaultErrorFormatter: ErrorFormatter = (err) => {
  const e = err as ERestError & { status?: number };
  const status = e.statusCode || e.status || 400;
  return {
    status,
    body: {
      error: err.message,
      code: e.code ?? "INTERNAL_ERROR",
    },
  };
};
