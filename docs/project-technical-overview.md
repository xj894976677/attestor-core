# Joclaim 项目技术文档与开发流程

> 本文档对当前项目的技术架构、仓库关系、开发/构建/发布流程进行全面说明。

---

## 目录

1. [项目概述](#1-项目概述)
2. [仓库结构与依赖关系](#2-仓库结构与依赖关系)
3. [各仓库技术栈](#3-各仓库技术栈)
4. [核心架构](#4-核心架构)
5. [构建流程](#5-构建流程)
6. [发布流程](#6-发布流程)
7. [本地开发与测试](#7-本地开发与测试)
8. [扩展 Manifest 配置说明](#8-扩展-manifest-配置说明)
9. [Webpack 特殊配置说明](#9-webpack-特殊配置说明)
10. [分支管理策略](#10-分支管理策略)

---

## 1. 项目概述

Joclaim（基于 Reclaim Protocol）是一个零知识证明（ZK-TLS）浏览器扩展系统，允许用户在不暴露敏感数据的前提下，从第三方网站（如 Binance、Instagram 等）提取可验证的数据声明。

系统由以下核心组件组成：
- **TLS 客户端**（`@joclaim/tls`）：在浏览器中实现 TLS 1.2/1.3 握手和加密通信
- **Attestor 核心**（`@joclaim/attestor-core`）：负责 TLS 代理、ZK 证明验证、数据声明管理
- **浏览器扩展 SDK**（`@joclaim/browser-extension-sdk`）：Chrome 扩展的完整实现，包含 content script、background service worker、offscreen document
- **测试项目**：`test-extension`（扩展测试）和 `test-web-app`（网页端测试）

---

## 2. 仓库结构与依赖关系

```
joclaim/
├── tls/                          # @joclaim/tls - TLS 协议实现
├── attestor-core/                # @joclaim/attestor-core - 核心证明逻辑
├── reclaim-browser-extension-sdk/# @joclaim/browser-extension-sdk - 扩展 SDK
├── test-extension/               # 测试用 Chrome 扩展
└── test-web-app/                 # 测试用 Web 应用
```

### 依赖链

```
@joclaim/tls
    ↓
@joclaim/attestor-core  ←  依赖 @joclaim/tls
    ↓
@joclaim/browser-extension-sdk  ←  依赖 @joclaim/tls + @joclaim/attestor-core
    ↓
test-extension / test-web-app  ←  依赖 @joclaim/browser-extension-sdk
```

> **关键约束**：发布新版本必须按上述依赖顺序进行。

---

## 3. 各仓库技术栈

### @joclaim/tls

| 项目 | 技术 |
|------|------|
| 语言 | TypeScript |
| 构建 | tsc (tsconfig.json) |
| 加密 | Web Crypto API / Pure JS fallback |
| 导出 | ESM (exports field in package.json) |

### @joclaim/attestor-core

| 项目 | 技术 |
|------|------|
| 语言 | JavaScript (Node.js + 浏览器双环境) |
| 运行时 | Node.js（作为 attestor 服务端） |
| ZK 证明 | snarkjs (Groth16) |
| TLS | @joclaim/tls |
| 数据提供者 | JSON 配置文件 (data/providers/) |

### @joclaim/browser-extension-sdk

| 项目 | 技术 |
|------|------|
| 语言 | JavaScript (ES Modules) |
| 构建 | Webpack 5 (多入口打包) |
| 目标环境 | Chrome Extension (Manifest V3) |
| 主要入口 | JoclaimExtensionSDK, background, content, offscreen, interceptor |
| Polyfills | stream-browserify, buffer, process, crypto-browserify 等 |

### test-extension

| 项目 | 技术 |
|------|------|
| 构建 | Vite |
| 功能 | 最小化的 Chrome 扩展，用于集成测试 SDK |

### test-web-app

| 项目 | 技术 |
|------|------|
| 框架 | React 19 |
| 构建 | Vite |
| 功能 | 网页端发起验证请求的测试应用 |

---

## 4. 核心架构

### Chrome 扩展组件模型

```
┌──────────────────────────────────────────────────────┐
│                    Web Page                           │
│  ┌──────────────────────────────────────────────────┐ │
│  │  test-web-app (React)                            │ │
│  │  └── JoclaimExtensionSDK.bundle.js               │ │
│  │      (通过 window.postMessage 与 content 通信)    │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
        ↕ window.postMessage
┌──────────────────────────────────────────────────────┐
│              Content Script (content.bundle.js)       │
│  ├── 注入 network-interceptor.bundle.js (页面级)      │
│  ├── 注入 injection-scripts.bundle.js (页面级)        │
│  ├── 显示 verification popup (Shadow DOM)             │
│  └── chrome.runtime.sendMessage ↕ Background          │
└──────────────────────────────────────────────────────┘
        ↕ chrome.runtime.sendMessage
┌──────────────────────────────────────────────────────┐
│         Background Service Worker (background.js)     │
│  ├── 管理验证会话                                      │
│  ├── 拦截和过滤网络请求                                │
│  ├── 管理 cookies 和登录状态                           │
│  └── 创建和管理 Offscreen Document                     │
└──────────────────────────────────────────────────────┘
        ↕ chrome.runtime.sendMessage
┌──────────────────────────────────────────────────────┐
│         Offscreen Document (offscreen.html)            │
│  ├── offscreen.bundle.js                              │
│  ├── 执行 TLS 握手 (通过 @joclaim/tls)                │
│  ├── 生成 ZK 证明 (通过 snarkjs)                      │
│  └── 与 Attestor 服务器通信                            │
└──────────────────────────────────────────────────────┘
```

### 数据流

1. **Web App** 调用 `JoclaimExtensionSDK.verifyProof()` 发起验证
2. **Content Script** 接收请求，转发给 **Background**
3. **Background** 初始化会话，导航到目标网站，拦截网络请求
4. 当匹配到目标请求时，**Background** 创建 **Offscreen Document**
5. **Offscreen** 通过 `@joclaim/tls` 建立安全 TLS 连接到 Attestor
6. **Offscreen** 使用 `snarkjs` 生成 ZK 证明
7. 证明结果通过消息链路返回给 **Web App**

---

## 5. 构建流程

### SDK 构建 (@joclaim/browser-extension-sdk)

```bash
cd reclaim-browser-extension-sdk
npm run build
```

Webpack 生成以下产物（输出到 `build/` 目录）：

| 产物 | 说明 |
|------|------|
| `JoclaimExtensionSDK.bundle.js` | 网页端 SDK（供 test-web-app 使用） |
| `JoclaimExtensionSDK-mv2.bundle.js` | Manifest V2 兼容版本 |
| `background/background.bundle.js` | Background Service Worker |
| `content/content.bundle.js` | Content Script |
| `offscreen/offscreen.bundle.js` | Offscreen Document 脚本 |
| `offscreen/offscreen.html` | Offscreen Document HTML |
| `interceptor/network-interceptor.bundle.js` | 网络拦截器（注入页面） |
| `interceptor/injection-scripts.bundle.js` | 脚本注入器（注入页面） |
| `content/components/*.css, *.html` | 验证弹窗的样式和模板 |
| `scripts/install-assets.js` | 资源安装脚本 |
| `scripts/download-circuits.js` | ZK 电路下载脚本 |

### 测试扩展构建 (test-extension)

```bash
cd test-extension
npm run build    # 等同于 npm run setup && vite build
```

`npm run setup` 执行 `install-assets.js`，该脚本：
1. 下载 ZK 电路文件到 `public/browser-rpc/resources/snarkjs/`
2. 复制 SDK 资源到 `public/joclaim-browser-extension-sdk/`

### 测试 Web App 构建 (test-web-app)

```bash
cd test-web-app
npm run build    # vite build
```

---

## 6. 发布流程

### 发布顺序（必须严格遵循）

```bash
# 1. 发布 TLS
cd tls
npm version patch    # 或 minor/major
npm publish

# 2. 更新 attestor-core 的 tls 依赖，然后发布
cd attestor-core
# 更新 package.json 中的 @joclaim/tls 版本
npm install
npm version patch
npm publish

# 3. 更新 SDK 的依赖，然后发布
cd reclaim-browser-extension-sdk
# 更新 package.json 中的 @joclaim/tls 和 @joclaim/attestor-core 版本
npm install
npm run build
npm publish

# 4. 更新测试项目
cd test-extension && cd test-web-app
# 更新 @joclaim/browser-extension-sdk 版本
npm cache clean --force
npm install
npm run build
```

### npm 发布注意事项

- 发布后可能有 1-3 分钟的 registry 传播延迟
- 下游项目安装前建议先 `npm cache clean --force`
- 使用 `npm view @joclaim/xxx versions --json` 确认版本是否已上线

---

## 7. 本地开发与测试

### 启动 Attestor 服务

```bash
cd attestor-core
npm start
# 默认运行在 http://localhost:8001
```

### 启动测试 Web App

```bash
cd test-web-app
npm run dev
# 默认运行在 http://localhost:5173
```

### 加载测试扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `test-extension/dist/` 目录
5. 修改代码后重新 `npm run build`，然后在扩展页面点击刷新按钮

### 调试技巧

- **Background Service Worker**：在 `chrome://extensions/` 点击 "Service Worker" 链接打开 DevTools
- **Content Script**：在目标网页的 DevTools Console 中查看，需选择正确的执行环境
- **Offscreen Document**：在 Background DevTools 的 Console 中查看（offscreen 的错误会冒泡到 background）
- **Network Interceptor**：在目标网页的 DevTools Network 标签中查看

---

## 8. 扩展 Manifest 配置说明

### content_scripts
```json
{
  "js": [
    "joclaim-browser-extension-sdk/content/content.bundle.js",
    "content.js"
  ],
  "run_at": "document_start",
  "matches": ["<all_urls>"]
}
```

### web_accessible_resources

必须声明以下资源，否则 content script 无法通过 `chrome.runtime.getURL()` 访问：

- `offscreen/offscreen.html` + `offscreen.bundle.js`
- `interceptor/network-interceptor.bundle.js`
- `interceptor/injection-scripts.bundle.js`
- `content/components/*.css` + `*.html`（弹窗资源，包含 joclaim- 和 reclaim- 两种前缀变体）

### Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';"
}
```

> **注意**：Manifest V3 **禁止** `unsafe-eval`。所有依赖必须避免使用 `eval()`/`new Function()`。
> 当前通过 webpack alias 将 snarkjs 指向浏览器构建来避免 ejs 的 CSP 违规。

### 必需权限
- `offscreen` — 创建 Offscreen Document
- `cookies` — 读取目标网站的登录 cookies
- `scripting` — 动态注入脚本
- `storage` — 存储日志配置等

---

## 9. Webpack 特殊配置说明

SDK 的 webpack 配置 (`webpack.config.js`) 包含大量浏览器环境适配：

### alias（模块别名）

| 别名 | 目标 | 原因 |
|------|------|------|
| `@joclaim/tls$` | `lib/index.js` | ESM exports 兼容 |
| `@joclaim/tls/webcrypto` | `lib/crypto/webcrypto.js` | ESM exports 兼容 |
| `@joclaim/tls/purejs-crypto` | `lib/crypto/pure-js.js` | ESM exports 兼容 |
| `snarkjs` | `@joclaim/snarkjs/build/browser.esm.js` | 使用浏览器版本避免 ejs CSP 违规 |
| `fastfile` | `false` | Node.js FS 工具，浏览器不需要 |
| `koffi` | `false` | Native FFI，浏览器不可用 |
| `re2` | `false` | Native 正则引擎，浏览器不需要 |
| `canvas` | `false` | Node.js canvas，浏览器有原生 Canvas |
| `react-native-tcp-socket` | `false` | React Native 专用 |
| `ws` | websocket-polyfill.js | 浏览器端 WebSocket 适配 |
| `jsdom` | jsdom-mock.js | DOM 模拟（浏览器已有原生 DOM） |
| `worker_threads` | worker-threads-mock.js | Node.js worker 模拟 |

### fallback（Node.js 核心模块 polyfill）

| 模块 | Polyfill |
|------|----------|
| `stream` | stream-browserify |
| `buffer` | buffer |
| `crypto` | crypto-browserify |
| `util` | util |
| `url` | url |
| `http` / `https` | stream-http / https-browserify |
| `zlib` | browserify-zlib |
| `vm` | vm-browserify |
| `assert` | assert |
| `os` | os-browserify |
| `path` | path-browserify |
| `process` | process/browser |
| `fs` | `false` |
| `net` | `false` |
| `tls` | `false` |
| `child_process` | `false` |

---

## 10. 分支管理策略

### 主要分支

| 分支 | 用途 |
|------|------|
| `joremote` | 主开发分支 |
| `no-csp` | CSP 修复 + 资源路径修复专用分支（基于 joremote） |
| `dev` | 上游 Reclaim Protocol 开发分支（参考用） |

### 版本历史

| 版本 | 主要变更 |
|------|----------|
| 0.3.2 | crypto.randomBytes 修复、webpack alias 初始修复 |
| 0.3.3 | 构建错误修复（fastfile alias） |
| 0.3.4 | 常量命名兼容、SET_PARAMETERS 补充 |
| 0.3.5 | 资源路径前缀修复（reclaim → joclaim） |
| 0.3.7 | snarkjs browser ESM alias 修复 CSP 违规 |
