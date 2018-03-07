const INFO = {
  title: "erest-demo",
  description: "Easy to write, easy to test, easy to generate document.",
  version: new Date(),
  host: "http://127.0.0.1:3001",
  basePath: "/api",
};
const GROUPS = {
  Index: "首页",
};

export { INFO, GROUPS };

export default (options = { info: INFO, groups: GROUPS}) => {
  const packPath = process.env.ISCOV ? "../src/lib" : "../dist/lib";
  const pack = require(packPath);
  const API = pack.default;
  const apiService = new API({
    info: INFO,
    groups: GROUPS,
  });
  return apiService;
};
