/**
 * Common API helper functions for testing
 * Extracted from helper.ts and enhanced for reusability
 */

import type { IApiInfo } from "../../lib";
import { build, TYPES } from "../helper";

/**
 * Common parameter definitions
 */
export const commonParams = {
  name: build(TYPES.String, "Your name", true),
  age: build(TYPES.Integer, "Your age", false),
  email: build(TYPES.Email, "Email address", false),
  id: build(TYPES.String, "Unique identifier", true),
  status: build(TYPES.ENUM, "Status", false, "active", ["active", "inactive", "pending"]),
} as const;

/**
 * Create a standardized GET API for testing
 */
export function createGetApi(api: IApiInfo<unknown>, path = "/", title = "Get Test") {
  return api
    .get(path)
    .group("Index")
    .title(title)
    .register(function get(_req: unknown, res: unknown) {
      res.end("Hello, API Framework Index");
    });
}

/**
 * Create a standardized POST API with body validation
 */
export function createPostApi(api: IApiInfo<unknown>, path = "/", title = "Post Test") {
  return api
    .post(path)
    .group("Index")
    .title(title)
    .query({ name: commonParams.name })
    .body({ age: commonParams.age })
    .required(["name", "age"])
    .register(function post(req: unknown, res: unknown) {
      res.end(`Post ${req.$params.name}:${req.$params.age}`);
    });
}

/**
 * Create a standardized DELETE API with params
 */
export function createDeleteApi(api: IApiInfo<unknown>, path = "/:id", title = "Delete Test") {
  return api
    .delete(path)
    .group("Index")
    .title(title)
    .params({ id: commonParams.id })
    .register(function del(req: unknown, res: unknown) {
      res.end(`Delete ${req.$params.id}`);
    });
}

/**
 * Create a JSON response API for testing
 */
export function createJsonApi(api: IApiInfo<unknown>, path = "/json", title = "JSON Test") {
  function jsonHandler(req: unknown, res: unknown) {
    if (!req.$params.age || req.$params.age < 18) {
      return res.json({ success: false });
    }
    return res.json({ success: true, result: req.$params, headers: req.headers });
  }

  return api.define({
    method: "get",
    path,
    group: "Index",
    title,
    query: { age: commonParams.age },
    handler: jsonHandler,
  });
}

/**
 * Create all standard CRUD APIs for comprehensive testing
 */
export function createAllCrudApis(api: IApiInfo<unknown>) {
  const apis = {
    get: createGetApi(api, "/", "Get"),
    post: createPostApi(api, "/index", "Post"),
    delete: createDeleteApi(api, "/index/:id", "Delete"),
    json: createJsonApi(api, "/json", "JSON"),
  };

  // Create additional HTTP method APIs
  apis.get = api
    .put("/index")
    .group("Index")
    .title("Put")
    .body({ age: commonParams.age })
    .register(function put(req: unknown, res: unknown) {
      res.end(`Put ${req.$params.age}`);
    });

  apis.get = api
    .patch("/index")
    .group("Index")
    .title("Patch")
    .register(function patch(_req: unknown, res: unknown) {
      res.end("Patch");
    });

  return apis;
}

/**
 * Create API with headers validation
 */
export function createHeaderApi(api: IApiInfo<unknown>, path = "/header", title = "Header Test") {
  return api
    .get(path)
    .group("Index")
    .title(title)
    .headers({ name: commonParams.name })
    .register((req: unknown, res: unknown) => {
      res.end(`Get ${req.$params.name}`);
    });
}
