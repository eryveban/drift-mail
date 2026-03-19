# Cloudflare 部署说明

## 默认 GitHub 部署

这个项目现在使用 [wrangler.jsonc](/D:/team/drift-mail/wrangler.jsonc) 作为 Cloudflare Worker 配置。该配置声明了：

- `DB` D1 绑定，名称为 `drift-mail-db`
- `MAIL_KV` KV 绑定
- `migrations/` 目录下的 D1 migrations
- `public/` 静态资源绑定

在 Cloudflare Dashboard 连接 GitHub 仓库时，使用默认的 Worker 部署流程即可。部署命令会执行：

```bash
npm run build
npm run db:migrate
wrangler deploy --config wrangler.jsonc
```

其中 `npm run db:migrate` 会执行：

```bash
wrangler d1 migrations apply DB --remote --config wrangler.jsonc
```

因此首次部署时会：

- 自动 provision D1 与 KV 资源
- 自动绑定到 Worker
- 自动执行建表 migration

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

除了 migration 之外，Worker 在 `fetch`、`scheduled` 和 `email` 三个入口都会检查必需表结构是否存在；如果是空库或换绑了新的 D1，会自动补齐表和索引，而不再依赖 `MAIL_KV` 里的 `db_initialized` 标志。
