/**
 * @file ERest<State> 类型推导测试（编译期）
 *
 * 验证 State 泛型透传到 ctx.state：before 钩子/handler 内 ctx.state 类型安全。
 * 运行时仅 expect typeof（真正校验在 typecheck 阶段）。
 */
import { describe, expect, it } from "vitest";
import type { Context, Middleware } from "../lib/adapters/types.js";
import type ERest from "../lib/index.js";

describe("ERest<State> 类型推导（编译期）", () => {
  it("State 泛型透传到 ctx.state", () => {
    // 注意：State 须用 type alias（而非 interface）定义——type alias 对象类型
    // 有隐式 index signature，可赋给 Record<string, unknown>；interface 则无。
    type MyState = {
      userId?: number;
      role: string;
    };

    // 模拟 createERest<MyState>() 返回的实例类型
    type Api = ERest<Middleware, unknown, MyState>;
    const _api = {} as unknown as Api;
    expect(typeof _api).toBe("object");

    // before 钩子：ctx.state 必须是 MyState
    const hook: Middleware<MyState> = (ctx, next) => {
      ctx.state.userId = 1; // OK：number 可赋给 number|undefined
      ctx.state.role = "admin"; // OK：string
      // @ts-expect-error 未知键应报错（MyState 无 unknownKey）
      ctx.state.unknownKey = "x";
      return next();
    };
    expect(typeof hook).toBe("function");

    // 断言 ctx.state 类型
    const checkState = (ctx: Context<MyState>) => {
      const role: string = ctx.state.role;
      return role;
    };
    expect(typeof checkState).toBe("function");
  });

  it("未声明 State 时 ctx.state 退回 Record<string, unknown>（向后兼容）", () => {
    const hook: Middleware = (ctx, next) => {
      ctx.state.anyKey = "any"; // OK：Record<string, unknown>
      return next();
    };
    expect(typeof hook).toBe("function");
  });
});
