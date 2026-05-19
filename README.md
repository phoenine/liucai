# 六彩 liucai

六彩是一个个人自用、Chrome-only 的本地网页高亮与批注插件。

当前阶段只实现 Chrome 插件 + IndexedDB：

- 网页选中文本后显示六色高亮工具条
- 支持给高亮添加/编辑批注
- 高亮和批注保存到 Chrome IndexedDB
- 重新打开页面后从 IndexedDB 读取并重新渲染

后续阶段再讨论 Obsidian 同步，不在当前 MVP 内实现。

## 开发

```bash
npm install
npm run build
```

然后在 Chrome 中打开：

```text
chrome://extensions/
```

开启开发者模式，选择 `dist/` 作为 unpacked extension 加载。

## 当前限制

- 只支持普通网页正文，不保证支持 PDF、iframe、Shadow DOM、Google Docs、飞书文档、Notion 等复杂动态页面。
- 高亮定位采用 text position + exact/prefix/suffix 的简化恢复策略，页面内容大幅变化时可能无法恢复。
- 暂不支持 Obsidian 同步。
