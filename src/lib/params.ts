/**
 * @file API 参数检测
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as z from 'zod';
import type ERest from './index';
import { create, params as debug } from "./debug";
import type API from './api';

const schemaDebug = create("params:schema");
const apiDebug = create("params:api");

export function paramsChecker(ctx: ERest<any>, name: string, input: any, schema: z.ZodTypeAny): any {
  const { error } = ctx.privateInfo;
  const result = schema.safeParse(input);
  if (!result.success) {
    const firstError = result.error.errors[0];
    // Construct a message. For deep objects, path can have multiple elements.
    const path = firstError.path.join('.');
    const message = `'${name}${path ? '.' + path : ''}' ${firstError.message}`;
    debug("paramsChecker: validation failed for '%s': %s", name, message);
    throw error.invalidParameter(message);
  }
  return result.data;
}

export function schemaChecker<T extends Record<string, any>>(
  ctx: ERest<any>,
  data: T,
  schema: z.AnyZodObject,
  requiredOneOf: string[] = []
) {
  const { error } = ctx.privateInfo;
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstError = result.error.errors[0];
    const fieldName = firstError.path.join('.');
    if (firstError.code === z.ZodIssueCode.invalid_type && firstError.message.toLowerCase().includes("required")) {
      // This is a simplistic check for missing parameters based on message content
      debug("schemaChecker: missing parameter for '%s'", fieldName);
      throw error.missingParameter(`'${fieldName}' is required`);
    }
    debug("schemaChecker: invalid parameter for '%s': %s", fieldName, firstError.message);
    throw error.invalidParameter(`'${fieldName}' ${firstError.message}`);
  }

  const validatedData = result.data;

  // 可选参数检查 (requiredOneOf)
  if (requiredOneOf.length > 0) {
    let oneOfsatisfied = false;
    for (const name of requiredOneOf) {
      if (validatedData[name] !== undefined) {
        oneOfsatisfied = true;
        schemaDebug("requiredOneOf: satisfied by '%s'", name);
        break;
      }
    }
    if (!oneOfsatisfied) {
      debug("schemaChecker: missing one of required parameters: %s", requiredOneOf.join(", "));
      throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
    }
  }
  return validatedData;
}

export function responseChecker<T extends Record<string, any>>(
  ctx: ERest<any>,
  data: T,
  schema: z.ZodTypeAny
): { ok: boolean; value?: any; error?: z.ZodError<any> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error };
}

/**
 * API 参数检查
 */
export function apiParamsCheck<
  THandler, // Handler type from API
  TQuery extends z.AnyZodObject | undefined,
  TParams extends z.AnyZodObject | undefined,
  TBody extends z.AnyZodObject | undefined,
  THeaders extends z.AnyZodObject | undefined
>(
  ctx: ERest<any>,
  apiSchema: API<THandler, TQuery, TParams, TBody, THeaders>,
  paramsData?: Record<string, any>,
  queryData?: Record<string, any>,
  bodyData?: Record<string, any>,
  headersData?: Record<string, any>
): (THeaders extends z.AnyZodObject ? z.infer<THeaders> : {}) &
  (TQuery extends z.AnyZodObject ? z.infer<TQuery> : {}) &
  (TParams extends z.AnyZodObject ? z.infer<TParams> : {}) &
  (TBody extends z.AnyZodObject ? z.infer<TBody> : {}) {
  const { error } = ctx.privateInfo;

  const parsedHeaders = apiSchema.options.headers ? apiSchema.options.headers.safeParse(headersData || {}) : { success: true, data: {} as (THeaders extends z.AnyZodObject ? z.infer<THeaders> : {}) };
  const parsedQuery = apiSchema.options.query ? apiSchema.options.query.safeParse(queryData || {}) : { success: true, data: {} as (TQuery extends z.AnyZodObject ? z.infer<TQuery> : {}) };
  const parsedParams = apiSchema.options.params ? apiSchema.options.params.safeParse(paramsData || {}) : { success: true, data: {} as (TParams extends z.AnyZodObject ? z.infer<TParams> : {}) };
  const parsedBody = apiSchema.options.body ? apiSchema.options.body.safeParse(bodyData || {}) : { success: true, data: {} as (TBody extends z.AnyZodObject ? z.infer<TBody> : {}) };

  const handleError = (result: z.SafeParseError<any>, partName: string) => {
    if (!result.success) {
      const firstError = result.error.errors[0];
      const fieldName = firstError.path.join('.');
      const errorMessage = `'${fieldName}' ${firstError.message}`;
      if (firstError.code === z.ZodIssueCode.invalid_type && firstError.message.toLowerCase().includes("required")) {
        throw error.missingParameter(`Missing ${partName} parameter: ${errorMessage}`);
      }
      throw error.invalidParameter(`Invalid ${partName} parameter: ${errorMessage}`);
    }
  };

  handleError(parsedHeaders as any, "header"); // Cast to any to satisfy SafeParseError type if success is false
  handleError(parsedQuery as any, "query");
  handleError(parsedParams as any, "params");
  handleError(parsedBody as any, "body");
  
  const validatedData = {
    ...(parsedHeaders.success ? parsedHeaders.data : {}),
    ...(parsedQuery.success ? parsedQuery.data : {}),
    ...(parsedBody.success ? parsedBody.data : {}),
    ...(parsedParams.success ? parsedParams.data : {}),
  };

  // 必填参数检查 (apiSchema.options.required is Set<string>)
  if (apiSchema.options.required && apiSchema.options.required.size > 0) {
    for (const name of apiSchema.options.required) {
      apiDebug("required : %s", name);
      if (!((validatedData as Record<string, any>)[name] !== undefined)) {
        throw error.missingParameter(`'${name}' is required`);
      }
    }
  }

  // 可选参数检查 (apiSchema.options.requiredOneOf is string[][])
  if (apiSchema.options.requiredOneOf && apiSchema.options.requiredOneOf.length > 0) {
    for (const names of apiSchema.options.requiredOneOf) {
      apiDebug("requiredOneOf : %o", names);
      let oneSatisfied = false;
      for (const name of names) {
        if ((validatedData as Record<string, any>)[name] !== undefined) {
          oneSatisfied = true;
          apiDebug("requiredOneOf : %s - satisfied", name);
          break;
        }
      }
      if (!oneSatisfied) {
        throw error.missingParameter(`One of ${names.join(", ")} is required`);
      }
    }
  }

  return validatedData as (THeaders extends z.AnyZodObject ? z.infer<THeaders> : {}) &
    (TQuery extends z.AnyZodObject ? z.infer<TQuery> : {}) &
    (TParams extends z.AnyZodObject ? z.infer<TParams> : {}) &
    (TBody extends z.AnyZodObject ? z.infer<TBody> : {});
}
