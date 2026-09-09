# 六彩 Liucai

[简体中文](README.md) · [English](README.en.md)

六彩是一款 Chrome 网页高亮与批注扩展。它以本地数据为核心：不登录也能完整使用；登录 Supabase 后，可将数据备份到云端并在多台电脑之间同步。

> 当前处于开发预览阶段，仅支持通过“加载已解压的扩展程序”安装。

![网页高亮与批注](images/pic1.png)

## 功能

- 三种高亮颜色：暖黄、薄荷、珊瑚
- 为高亮添加批注和标签
- 悬停查看批注与标签
- 页面刷新或重新打开后自动恢复高亮
- 右侧划线列表支持定位、编辑、复制和删除
- 导出适合 Obsidian 的 Markdown
- 按域名禁用或恢复划线功能
- 可选的 Supabase 云备份与跨设备同步

![高亮工具条](images/pic2.png)

![划线列表](images/pic3.png)

## 本地优先与云同步

高亮、批注和标签始终先写入扩展自己的 IndexedDB，不等待网络请求。未登录、断网或 Supabase 暂时不可用时，本地功能仍然正常。

登录后，同步会在以下时机自动运行：

- 登录、扩展后台启动或打开普通网页时
- 新增、修改或删除高亮后
- 每 5 分钟进行一次兜底检查

也可以在 Popup 中点击“立即同步”。新电脑登录同一账号后，会从 Supabase 下载云端数据并恢复到本地。尚未上传成功的本地数据如果被删除，则无法从云端恢复。

首版中，一个本地数据库只绑定一个 Supabase 账号，避免退出后误将同一份本地数据上传到其他账号。

## 安装

### 从 GitHub Release 安装

1. 在 Releases 页面下载 `liucai-extension-v<version>.zip`。
2. 解压 ZIP。
3. 打开 `chrome://extensions/`。
4. 开启“开发者模式”。
5. 点击“加载已解压的扩展程序”，选择解压后的目录。

升级版本时，重新解压并在扩展管理页点击刷新；已保存的数据不会因普通升级而删除。

### 从源码安装

```bash
npm install
cp .env.example .env.local
npm run build
```

在 `.env.local` 中填写 Supabase Project URL 和 publishable key，然后在 Chrome 中加载 `dist/`。客户端不得使用 secret 或 service role key。

## 开发

```bash
npm test
npm run typecheck
npm run build
npm run package
```

- `npm run build`：生成 `dist/`
- `npm run package`：生成 `artifacts/liucai-extension-v<version>.zip`
- ZIP 根目录直接包含 `manifest.json`，不包含 source map

## GitHub CI 与发布

[CI workflow](.github/workflows/ci-release.yml) 会在 `main`、`dev`、Pull Request 和手动运行时执行测试、类型检查、构建与打包，并保存 14 天的 Actions Artifact。

推送与 `package.json` 版本一致的标签，例如 `v1.0.0` 或 `1.0.0`，CI 会自动创建或更新 GitHub Release，并上传插件 ZIP。ZIP 位于 Release 的 **Assets**，不会显示在 GitHub **Packages** 区域。

发布带云同步的版本前，在仓库 **Settings → Secrets and variables → Actions → Variables** 中添加：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## 当前限制

- 仅支持桌面版 Chrome 和普通网页正文。
- 暂不保证支持 PDF、iframe、Shadow DOM、Google Docs、飞书文档、Notion 等复杂页面。
- 页面内容大幅变化后，保存的文本位置可能无法恢复。
- 跨设备变化不是实时推送；空闲设备最多约 5 分钟后拉取。
- 尚未实现多账号本地隔离和 Obsidian 自动同步。

## 数据与安全

- 本地数据保存在扩展 origin 的 IndexedDB 中。
- Supabase 会话保存在 `chrome.storage.local`，不会暴露给网页脚本。
- 客户端只包含 Supabase publishable key。
- 云端写入通过认证 RPC 完成，用户数据由 Row Level Security 隔离。
