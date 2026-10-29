import { describe, expect, it, vi } from "vitest";
import { createDispatcher, decodePathParams, defaultErrorFormatter, type Context } from "erest";

describe("invalid encoded path parameters", () => {
  it.each(["%", "%E4%B8", "%C0%AF"])("rejects %s before entering the business handler", async (id) => {
    const handler = vi.fn();
    const onError = vi.fn();
    let status = 200;
    let body: unknown;
    const ctx: Context = {
      method: "GET",
      path: `/items/${id}`,
      headers: {},
      params: { id },
      query: {},
      body: {},
      state: {},
      reply: {
        status(code) {
          status = code;
          return this;
        },
        json(value) {
          body = value;
        },
        send: vi.fn(),
        markSent: vi.fn(),
        raw: undefined,
      },
    };
    const dispatch = createDispatcher(
      [decodePathParams, handler],
      { onError },
      {
        error: (error) => defaultErrorFormatter(error as Error),
      }
    );

    await dispatch(ctx);

    expect(status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    const error = onError.mock.calls[0][1];
    expect(error).toBeInstanceOf(URIError);
    expect(error.statusCode).toBe(400);
    expect(body).toMatchObject({ error: error.message });
    expect(ctx.params.id).toBe(id);
  });
});
