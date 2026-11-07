# CAIS · AI 搜索适配诊断

> **你的网站，AI 搜得到吗？**

输入一个网址，30 秒内诊断：
- **AI 爬虫能不能读到你的网站**（robots.txt 屏蔽、Schema 缺失、结构化数据报错……）
- **网站是否具备被 Agent 自主交易的条件**（MTO 机器信任诊断）

输出总分 + 问题清单 + 一键修复代码。单文件、零构建、零外部依赖。

---

## 快速开始

```bash
node caiserver.js
# 打开 http://localhost:3000
```

或直接把 `cais.html` 上传到任何静态托管（GitHub Pages / 腾讯云 COS / 你自己的服务器），双击也能打开用。

---

## 它做什么

传统 SEO 工具查排名、查外链。CAIS 只查一件事：**AI 能不能从你的页面里抽出可引用的信息**。

AI 爬虫进站第一件事是读 HTML。Schema 没渲染、JSON-LD 报错、实体没铺满——内容写得再好也抽不走。CAIS 模拟 AI 爬虫的视角，逐页扫描代码层，输出 5 个维度 39 项检查。

同时首创 **MTO（Machine Trust Optimization）机器信任诊断**：探测你的网站是否部署了 MCP 端点、A2A Agent Card、接口文档等 Agent 协议，判断 AI Agent 能否与你的后台自主通信。

## 输出什么

| 维度 | 内容 |
|---|---|
| **GEO 五步评分** | 总分 /100，按代码层 → Schema → 内容结构 → 实体问答 → 信源一致性五个维度 |
| **问题清单** | 每条含严重度、影响说明、修复动作 |
| **Codex 提示词** | 5 条可直接粘贴到 AI 编程工具的修复指令 |
| **Schema 修复代码** | 静态 JSON-LD 和 Shopify Liquid 两个版本 |
| **MTO 四层评分** | 独立 /100 分：证据链 → 机器可读 → 信任量化 → 协议执行 |

---

## MTO 机器信任诊断

**MTO 是什么？**

GEO 解决「被 AI 看见」——让 AI 爬虫能读到你的内容并引用你。这是入场资格。

MTO 解决「被机器信任」——让 AI Agent 敢直接与你的系统通信、核验、甚至下单。这是自主交易的终点。

```
GEO：AI 愿意推荐你（入场资格）
MTO：机器敢直接买你（自主交易）
```

四层检测：

| 层 | 检查什么 |
|---|---|
| **L1 证据链** | 认证编号、签发方与有效期、标准依据、溯源链接 |
| **L2 机器可读** | llms.txt / ai.txt、图片 alt、字段口径标准化 |
| **L3 信任量化** | 一致性、数据时效性、审计留痕（实验性） |
| **L4 协议执行** | A2A Agent Card、MCP 端点、OpenAPI 文档、AI 插件清单 |

> MTO 目前处于理论推演阶段。本工具只输出诊断与建议，不生成任何修复代码。

**MTO 概念最早由 duckwolf.cn 提出并系统化。** 完整技术框架与演进路线详见：

👉 **[duckwolf.cn/mto.html](https://duckwolf.cn/mto.html)**

---

## 部署

| 方式 | 条件 | 操作 |
|---|---|---|
| **Node 服务** | 有 Node 18+ | `node caiserver.js` |
| **Cloudflare Pages** | 有 CF 账号 | `npm run deploy` |
| **任意静态托管** | 只有静态空间 | 只上传 `cais.html` |
| **GitHub Pages** | GitHub 账号 | Settings → Pages → 选 main → root |

详细部署指南见下方章节。

---

## 文件结构

```
cais-site/
├── cais.html                                 诊断页本体（零依赖，可单独打开）
├── caiserver.js                              Node 服务（静态页 + /api/fetch 代理）
├── caifunctions/api/fetch.js                 Cloudflare Pages 代理函数
├── caiworker/caistandalone-worker.js         独立 Cloudflare Worker 代理
├── caipackage.json                           命令入口
└── caiREADME.md                              本文件
```

## 诊断内容

### GEO 五步 39 项

| 步骤 | 满分 | 检查什么 |
|---|---|---|
| 1 · 代码层漏洞 | 32 | 60+ AI 爬虫 UA 可达性、JSON-LD 语法、必填字段 |
| 2 · Schema 完整度 | 22 | 七层覆盖：Organization / Product / FAQ / Offer 等 |
| 3 · 内容结构 | 18 | 答案密度、分段、语义标签 |
| 4 · 实体与问答页 | 16 | 实体覆盖、内链密度、llms.txt |
| 5 · 信源一致性 | 12 | 规格冲突、认证输出、跨平台口径 |

### MTO 四层

| 层 | 满分 | 检查什么 |
|---|---|---|
| L1 证据链层 | 25 | 认证编号、签发方与有效期、标准依据 |
| L2 机器可读层 | 25 | llms.txt 系列、图片 alt、字段口径 |
| L3 信任量化层 | 15 | 一致性、时效性、审计留痕 |
| L4 协议执行层 | 35 | MCP 端点、A2A Agent Card、接口文档 |

## 四种使用模式

1. **输入网址**：输域名，自动抓取并诊断（需要部署同源代理或公共代理可用）
2. **上传 HTML**：拖入整站 HTML 文件，最稳
3. **粘贴源码**：粘贴单页源码，适合快速验证
4. **内置示例**：三个虚构示例站，销售演示用

## 评分等级

| GEO 总分 | 等级 |
|---|---|
| 80–100 | AI 就绪 |
| 60–79 | 基本可用，需补关键项 |
| 40–59 | 有引用风险 |
| 20–39 | AI 基本抽不走 |
| 0–19 | AI 不可见 |

| MTO 总分 | 等级 |
|---|---|
| 75–100 | 机器可核验 |
| 50–74 | 部分可核验 |
| 25–49 | 机器难以核验 |
| 0–24 | 机器不可见 |

## 更新记录

| 版本 | 内容 |
|---|---|
| v1.0 | 五步诊断引擎、39 项检测、七层 Schema、Codex 提示词、Markdown 导出 |
| v1.1 | 新增 `nosnippet`、`noindex`、`llms.txt` 检测。公共代理增至 7 个 |
| v1.2 | 新增 Node 单端口服务。DNS 二次校验与逐跳重定向校验 |
| v1.3 | 新增 MTO 机器信任诊断：四层评分、16 个约定端点探测 |
| v1.4 | 参照 GEOInflow v1.2 扩充 AI 爬虫 UA 至 60+ 身份（用途分类）。增强 llms.txt 质量评估。文件名加 `cai` 前缀 |

## 许可

MIT。

## 联系

MTO 概念与技术方案由 **[duckwolf.cn](https://duckwolf.cn/mto.html)** 提出并系统化。如需定制诊断、企业部署或合作，请联系。
