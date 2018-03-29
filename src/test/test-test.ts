import { apiAll, apiGet, apiPost, hook } from "./helper";
import lib from "./lib";
import { GROUPS, INFO } from "./lib";

import * as express from "express";

const app = express();
const apiService = lib();
const api = apiService.api;
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
app.use("/api", router);

apiAll(api);
apiService.bindRouter(router);

router.use((err: any, req: any, res: any, next: any) => {
  if (err) { return res.end(err.message ); }
  next();
});

apiService.initTest(app);
const agent = apiService.test.session();
const share = {
  name: "Yourtion",
  age: 22,
  ageStr: "abc",
};

describe("TEST - Index", () => {
  it("TEST - Get no session", async () => {
    const ret = await apiService.test
      .get("/api/")
      .takeExample("Index-Get")
      .raw();
    expect(ret).toBe("Hello, API Framework Index");
  });

  it("TEST - Get2 success", async () => {
    const ret = await agent
      .get("/api/index")
      .input({
        name: share.name,
      })
      .takeExample("Index-Get2")
      .raw();
    expect(ret).toBe(`Get ${share.name}`);
  });

  it("TEST - Post success", async () => {
    const ret = await agent
      .post("/api/index")
      .query({
        name: share.name,
      })
      .input({
        age: share.age,
      })
      .takeExample("Index-Post")
      .raw();
    expect(ret).toBe(`Post ${share.name}:${share.age}`);
  });

  it("TEST - Put success", async () => {
    const ret = await agent
      .put("/api/index")
      .input({
        age: share.age,
      })
      .takeExample("Index-Put")
      .raw();
    expect(ret).toBe(`Put ${share.age}`);
  });

  it("TEST - Delete success", async () => {
    const ret = await agent
      .delete("/api/index/" + share.name)
      .takeExample("Index-Delete")
      .raw();
    expect(ret).toBe(`Delete ${share.name}`);
  });

  it("TEST - Patch success", async () => {
    const ret = await agent
      .patch("/api/index")
      .takeExample("Index-Patch")
      .raw();
    expect(ret).toBe(`Patch`);
  });

  it("TEST - Post missing params", async () => {
    const ret = await agent
      .post("/api/index")
      .input({
        age: share.age,
      })
      .takeExample("Index-Post")
      .raw();
    expect(ret).toBe("missing required parameter 'name' is required!");
  });

  it("TEST - Post missing params", async () => {
    const ret = await agent
      .put("/api/index")
      .input({
        age: share.ageStr,
      })
      .takeExample("Index-Put")
      .raw();
    expect(ret).toBe("incorrect parameter 'age' should be valid Integer");
  });

  it("TEST - Gen docs", () => {
    apiService.genDocs("/tmp/", false);
  });
});
