import { ERestError } from "../error.js";
import type { LifecycleHooks } from "../hooks.js";
import type { Context } from "./types.js";

const observedError = Symbol("erest.observedError");
type ObservedContext = Context & { [observedError]?: unknown };

/** Only known JSON parser failures are normalized; arbitrary application errors retain their identity. */
export function normalizeRequestError(error: unknown): unknown {
  const err = error as Error & { type?: string; status?: number; statusCode?: number };
  if (
    err &&
    (err.type === "entity.parse.failed" ||
      (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400)) ||
      (err.message === "Invalid JSON body" && (err.status === 400 || err.statusCode === 400)))
  ) {
    if (err instanceof ERestError) return err;
    const normalized = new ERestError("INVALID_BODY", "Invalid JSON body", undefined, 400);
    normalized.cause = error;
    return normalized;
  }
  return error;
}

/** Observe each error once, including when it subsequently reaches the host error boundary. */
export function observeError(ctx: Context, error: unknown, onError?: LifecycleHooks["onError"]): void {
  if (!onError || (Object.hasOwn(ctx, observedError) && (ctx as ObservedContext)[observedError] === error)) return;
  (ctx as ObservedContext)[observedError] = error;
  try {
    onError(ctx, error as Error);
  } catch {
    /* observers cannot change control flow */
  }
}
