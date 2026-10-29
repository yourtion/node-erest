/** H3 entry: the same blog API, store and middleware as the other hosts. */
import { createServer } from "node:http";
import { H3 } from "h3";
import { toNodeHandler } from "h3/node";
import ERest from "erest";
import { h3Adapter, createErrorHandler } from "@erest/h3";
import { API_INFO, GROUPS, registerApi } from "../api.js";
import { createStore } from "../store.js";
import { authBefore, adminBefore, logMiddleware, timingBefore } from "../hooks.js";

const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });
registerApi(api, store, {
  authBefore: authBefore(store),
  adminBefore: adminBefore(),
  logMiddleware: logMiddleware(),
  timingBefore: timingBefore(),
});
const app = new H3({ onError: createErrorHandler(api) });
api.bind({ adapter: h3Adapter, app, router: H3 });
createServer(toNodeHandler(app)).listen(3100, () => {
  console.log("erest H3 入口：http://localhost:3100");
});
