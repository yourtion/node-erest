# npm 自动发布

[返回首页](README.md) · [贡献指南](CONTRIBUTING.md)

仓库通过 GitHub 托管 runner 的 `.github/workflows/release.yml` 使用 npm Trusted Publishing（OIDC）。
不需要 `NPM_TOKEN`，也不在 GitHub 保存 npm 长期凭据。workflow 使用 Node 24，并检查实际 npm
版本至少为 11.5.1（OIDC 要求 Node 至少 22.14.0）。公开仓库的公开包通过 OIDC 发布时，npm 自动生成 provenance。

## 一次性 npm 配置

维护者须登录 npm，分别进入以下六个包的 Settings → Trusted Publisher，选择 GitHub Actions。
原有五包已经在 npm 上存在；新增 `@erest/h3` 首发前须先由维护者在 npm 建包并配置 Trusted Publisher。仅合入 workflow 不会替代 npm 后台绑定；本仓库无法从代码确认绑定状态。

| npm 包 | Organization or user | Repository | Workflow filename | Environment name |
| --- | --- | --- | --- | --- |
| `erest` | `yourtion` | `node-erest` | `release.yml` | 留空 |
| `@erest/express` | `yourtion` | `node-erest` | `release.yml` | 留空 |
| `@erest/koa` | `yourtion` | `node-erest` | `release.yml` | 留空 |
| `@erest/leizmweb` | `yourtion` | `node-erest` | `release.yml` | 留空 |
| `@erest/h3` | `yourtion` | `node-erest` | `release.yml` | 留空 |
| `@erest/gen` | `yourtion` | `node-erest` | `release.yml` | 留空 |

workflow 名称填写文件名 `release.yml`，不要填写显示名称 `Release` 或完整路径。如果 npm 界面
提供 Allowed actions，须允许直接 `npm publish`；本流程不使用 staged publishing。
本 workflow 没有 GitHub environment，所以 npm 的 Environment name 留空。将来添加 environment
或重命名 workflow 时，要同步修改每个包的绑定。

五个子包的 `repository.url` 与根包一致，且包含各自的 `repository.directory`。provenance
要求仓库 URL 与实际发布仓库匹配。不要用 token 掩盖 OIDC 配置错误，也不要将凭据写入仓库或日志。
官方说明：[Trusted publishers](https://docs.npmjs.com/trusted-publishers/)。

### @erest/h3 首次本地发布 1.0.0

在本地检出包含 H3 适配器的代码，使用 Node.js 24、pnpm 9，并登录有 `@erest` scope 发布权限的 npm 账号：

```bash
pnpm install --frozen-lockfile
pnpm run pack:h3-bootstrap
npm login
npm publish ./erest-h3-1.0.0.tgz --access public --tag latest --ignore-scripts
```

`pack:h3-bootstrap` 构建并检查核心与 H3 子包，在临时目录生成 `@erest/h3@1.0.0`，
输出根目录的 `erest-h3-1.0.0.tgz`。包内 peer 依赖为已发布的 `erest ^3.3.1`，
不含 `workspace:` 或开发依赖；准备命令只打包，不执行发布。
仓库 manifest 保持六包统一的 `3.4.0`，无需手动改版本再还原，也不要为这次建包推送 `v1.0.0` tag。

首次发布成功后，进入 <https://www.npmjs.com/package/@erest/h3/access> 的
Settings → Trusted Publisher，填写上表中的 GitHub 用户、仓库和 workflow，Environment name 留空。
配置完成后合入 PR，再按下节推送 `v3.4.0`，由 GitHub Actions 将六包自动发布到 `3.4.0`。
`1.0.0` 只用于此次建包；后续 H3 版本跟随 erest，不单独递增。

## 正式发版

1. 将根包和五个公开子包的版本统一更新，更新 `MIGRATION.md`，通过 PR 合入 `main`。
2. 确认该提交的 CI 通过，且上一次发版已经完成。拉取 `main` 后创建并推送精确 tag：

   ```bash
   git switch main
   git pull --ff-only
   pnpm run tag
   RELEASE_VERSION="$(node --print "require('./package.json').version")"
   git push origin "v${RELEASE_VERSION}"
   ```

   `RELEASE_VERSION` 读取当前 manifest 版本；推送前核对六个包的版本一致。`pnpm run tag`
   只创建本地 tag，不执行 npm 发布。也可用 `git tag v<version>` 创建 tag。
3. 在 Actions → Release 查看结果。只有推送 tag 触发发布，普通 PR/main push 不发布。

tag 必须是严格的 `vX.Y.Z`，支持例如 `v3.3.0-rc.1` 的预发布，拒绝 npm 无法原样保留的
`+build` 元数据。tag 必须指向 `main` 中已有的提交，annotated 和轻量 tag 都会检查实际提交。
所有待发包的版本必须与 tag 一致；private 的 `examples` 永不发布。

正式版显式使用 `latest`；预发布显式使用 `next`，GitHub Release 标记为 prerelease。
发布作业全局串行且不主动取消。GitHub concurrency 不保证 FIFO 且只保留一个 pending，
因此不要同时积压多个版本；逐个确认完成后再发下一个版本。

## 校验、产物与重跑

只读验证 job 在安装项目依赖前校验 tag/版本/main 归属，再运行：

- frozen-lockfile 安装、`check`、`test:release`；
- 显式执行 `prepublishOnly`（format、根包与子包构建、发布产物测试及示例测试）和覆盖率门槛；
- pnpm workspace-aware pack，检查每个真实 tarball 的 manifest、exports/main/types、CLI shebang/执行权限及内部依赖；
- 在临时消费项目安装六个 tarball，验证核心与四框架 adapter 的 ESM 导入以及 codegen CLI 入口；
- 确认 lifecycle 未改动 tag 的受跟踪源码。

产物以 `npm-release` Actions artifact 保留 30 天，包含六个 `.tgz` 和记录 SHA-256 的
`release.json`。发布 job 重新校验全部产物的身份、内容哈希和内部依赖，使用 npm CLI 发布同一批
tarball；不重新 pack 或构建。pnpm 负责 workspace 协议转换，不能直接用 npm 在 workspace
目录打包。声明与实际文件必须一致；通配符 exports 需要先扩展验证器。

先发布依赖，再发布消费者；当前顺序为 `erest`、四个 adapter、`@erest/gen`。每个包先查询
精确版本，已存在则跳过，只有结构化 npm `E404` 才视为缺失。认证、网络、限流、publish 错误均
终止流程。全部必需包完成后才创建或完成 GitHub Release，notes 由 GitHub 生成；tarball 保留在
Actions artifact，不额外附加 GitHub Release assets。

失败后修正外部配置并在原 tag 的 Actions run 中选择 **Re-run all jobs**。已发布的包会跳过，
继续剩余包；npm 全部成功但 GitHub 失败时，重跑只补 GitHub Release，不重复上传 npm 版本。
重新构建的文件仍须经过完整校验。npm 版本不可覆盖：若需要修改发布代码，必须使用新版本和新 tag，
不要移动既有 tag。没有自动回滚已发布包的操作。

PR CI 会运行同一套发布工具测试，并在 Node 24 下真实 pack 和安装消费验证，但不会访问发布 API。
unit test 对 npm/GitHub 发布、404/权限/网络错误及部分失败使用 mock；本地 pack/smoke 成功不代表
真实 OIDC 认证已配置或真实发布已发生。真实端到端认证只能由后台绑定后的首次 tag 发布验证。

原 `publish:all` 保留用于有 npm 发布凭据的明确手动场景；它不等于 OIDC 自动流程。
`postpublish` 不再推送 Git 分支或 tag，避免本地发布生命周期意外触发自动发布。
