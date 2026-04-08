# Cloudflare 部署说明

## 默认 GitHub 部署

这个项目现在使用 [wrangler.jsonc](/D:/team/drift-mail/wrangler.jsonc) 作为 Cloudflare Worker 配置。该配置声明了：

- `DB` D1 绑定，名称为 `drift-mail-db`
- `MAIL_KV` KV 绑定
- `migrations/` 目录下的 D1 migrations
- `public/` 静态资源绑定

在 Cloudflare Dashboard 连接 GitHub 仓库时，使用你当前这组 Worker 构建参数即可：

```bash
Root directory: /
npm run build
npx wrangler deploy
npx wrangler versions upload
```

由于仓库不再把 `wrangler` 固定安装到本地依赖中，`npx wrangler ...` 会在部署阶段拉取当前可用版本，避免 `package.json` 和 `package-lock.json` 因 `wrangler` 版本不一致而让 `npm clean-install` 失败。

如果你需要手动执行 D1 migration，可以额外运行：

```bash
npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc
```

因此首次部署时会：

- 自动 provision D1 与 KV 资源
- 自动绑定到 Worker
- 使用 `wrangler.jsonc` 作为默认 Wrangler 配置

## 仍需手动提供的配置

默认配置已经在 `wrangler.jsonc` 中提供：

- `ACCESS_KEY=admin`
- `EXPIRE_MINUTES=30`
- `MAIL_DOMAINS=""`

因此首次部署后，`/login` 默认可以先使用 `admin` 登录。正式上线时，建议你在 `Settings -> Variables and Secrets` 中覆盖 `ACCESS_KEY`，并在 `Settings -> Variables` 中补充真实的 `MAIL_DOMAINS`。

以下值仍建议由你按实际环境补充：

- `JWT_SECRET`：可选；如果不设置，Worker 会使用 `MAIL_KV` 自动生成并保存
- `MAIL_DOMAINS`：你的 Email Routing 域名列表，多个值用逗号分隔

## 运行时兜底

即使部署流程没有额外执行 `d1 migrations apply`，Worker 在 `fetch`、`scheduled` 和 `email` 三个入口都会检查必需表结构是否存在；如果是空库或换绑了新的 D1，会自动补齐表和索引，而不再依赖 `MAIL_KV` 里的 `db_initialized` 标志。
