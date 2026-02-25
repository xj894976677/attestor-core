# SDK 构建与运行时问题排查手册

> 本文档汇总了 `@joclaim/browser-extension-sdk` 在构建、发布和运行过程中遇到的所有问题，包括根因分析和解决方案。

---

## 目录

1. [crypto.randomBytes is not a function](#1-cryptorandombytes-is-not-a-function)
2. [Webpack 构建失败：@joclaim/tls ESM exports 解析错误](#2-webpack-构建失败joclaimtls-esm-exports-解析错误)
3. [Webpack 构建失败：fastfile 引入 Node.js fs 模块](#3-webpack-构建失败fastfile-引入-nodejs-fs-模块)
4. [运行时错误：Cannot read properties of undefined (reading 'CHECK_EXTENSION')](#4-运行时错误cannot-read-properties-of-undefined-reading-check_extension)
5. [验证弹窗不显示：资源路径前缀不匹配](#5-验证弹窗不显示资源路径前缀不匹配)
6. [Offscreen 文档初始化失败：ejs CSP 违规](#6-offscreen-文档初始化失败ejs-csp-违规)

---

## 1. crypto.randomBytes is not a function

### 现象
扩展运行时在 ZK 证明生成阶段报错：
```
TypeError: r.crypto.randomBytes is not a function
```

### 根因
`@joclaim/tls` 的 crypto 模块初始为空对象 `{}`，依赖外部调用 `setCryptoImplementation()` 设置实现。当 webpack 打包出多个 `@joclaim/tls` 实例时，`attestor-core` 内部引用的 crypto 单例与 `offscreen.js` 中初始化的不是同一个对象，导致 `randomBytes` 未定义。

### 解决方案

**`@joclaim/tls` (src/crypto/index.ts)**：添加浏览器环境自动检测，当未调用 `setCryptoImplementation` 时自动使用 `Web Crypto API` 作为默认实现。

**`@joclaim/browser-extension-sdk` (webpack.config.js)**：添加精确的 alias 配置，强制所有 `@joclaim/tls` 引用解析到同一模块实例：

```javascript
"@joclaim/tls$": path.resolve(__dirname, "node_modules/@joclaim/tls/lib/index.js"),
"@joclaim/tls/webcrypto": path.resolve(__dirname, "node_modules/@joclaim/tls/lib/crypto/webcrypto.js"),
"@joclaim/tls/purejs-crypto": path.resolve(__dirname, "node_modules/@joclaim/tls/lib/crypto/pure-js.js"),
```

### 涉及仓库
- `@joclaim/tls` — crypto 默认实现
- `@joclaim/attestor-core` — 升级 tls 依赖
- `@joclaim/browser-extension-sdk` — webpack alias 配置

---

## 2. Webpack 构建失败：@joclaim/tls ESM exports 解析错误

### 现象
使用目录级 alias 时，webpack 无法正确解析 `@joclaim/tls/webcrypto` 等子路径导入：
```
Module not found: Error: Can't resolve '@joclaim/tls/webcrypto'
```

### 根因
`@joclaim/tls` 的 `package.json` 使用了 ESM `exports` 字段定义子路径映射。但 webpack 的 `resolve.alias` 将 `@joclaim/tls` 指向目录时，会直接拼接路径 `node_modules/@joclaim/tls/webcrypto`，**而不会查询 `exports` 字段**。

### 解决方案
将目录级 alias 替换为精确的文件级 alias：

```javascript
// ❌ 错误：目录别名不兼容 ESM exports
"@joclaim/tls": path.resolve(__dirname, "node_modules/@joclaim/tls"),

// ✅ 正确：精确文件别名
"@joclaim/tls$": path.resolve(__dirname, "node_modules/@joclaim/tls/lib/index.js"),
"@joclaim/tls/webcrypto": path.resolve(__dirname, "node_modules/@joclaim/tls/lib/crypto/webcrypto.js"),
"@joclaim/tls/purejs-crypto": path.resolve(__dirname, "node_modules/@joclaim/tls/lib/crypto/pure-js.js"),
```

> **注意**：`@joclaim/tls$` 中的 `$` 表示精确匹配，防止影响子路径解析。

### 涉及仓库
- `@joclaim/browser-extension-sdk` — webpack.config.js

---

## 3. Webpack 构建失败：fastfile 引入 Node.js fs 模块

### 现象
构建时报错：
```
Module not found: Error: Can't resolve 'fs' in '.../fastfile/...'
```
或者 `import { O_TRUNC, O_CREAT, O_EXCL } from 'fs'` 失败。

### 根因
`snarkjs`（通过 `@joclaim/snarkjs`）依赖 `fastfile` 库，后者直接从 Node.js `fs` 模块导入具名常量。即使 webpack 的 `fallback` 配置了 `fs: false`，对 `import { O_TRUNC } from 'fs'` 这种具名导入依然会报错。

### 解决方案
在 webpack alias 中直接禁用 `fastfile`：

```javascript
fastfile: false,
```

`fastfile` 用于文件读写，在浏览器环境中不需要（ZK 电路通过 HTTP fetch 加载）。

### 涉及仓库
- `@joclaim/browser-extension-sdk` — webpack.config.js

---

## 4. 运行时错误：Cannot read properties of undefined (reading 'CHECK_EXTENSION')

### 现象
扩展加载后立即报错：
```
TypeError: Cannot read properties of undefined (reading 'CHECK_EXTENSION')
TypeError: Cannot read properties of undefined (reading 'EXTENSION_RESPONSE')
```

### 根因
品牌重命名时，常量对象从 `RECLAIM_SDK_ACTIONS` / `RECLAIM_SESSION_STATUS` 改名为 `JOCLAIM_SDK_ACTIONS` / `JOCLAIM_SESSION_STATUS`（在 `src/utils/constants/interfaces.js` 中），但代码库中大量文件（`ReclaimExtensionSDK.js`、`content.js`、`background.js` 等）仍引用旧名称。

此外，`SET_PARAMETERS` 常量在 `content.js` 中被引用但未在 `JOCLAIM_SDK_ACTIONS` 中定义。

### 解决方案

1. 在 `src/utils/constants/index.js` 中添加向后兼容的别名：
```javascript
export { JOCLAIM_SDK_ACTIONS as RECLAIM_SDK_ACTIONS } from "./interfaces";
export { JOCLAIM_SESSION_STATUS as RECLAIM_SESSION_STATUS } from "./interfaces";
```

2. 在 `interfaces.js` 中添加缺失的 `SET_PARAMETERS` 常量：
```javascript
SET_PARAMETERS: "JOCLAIM_SET_PARAMETERS",
```

### 涉及仓库
- `@joclaim/browser-extension-sdk` — constants/index.js, constants/interfaces.js

---

## 5. 验证弹窗不显示：资源路径前缀不匹配

### 现象
点击验证按钮后，页面右下角的验证弹窗不出现。控制台无明显报错，但 CSS/HTML fetch 返回 404。

### 根因
品牌重命名后，`install-assets.js` 将 SDK 资源复制到 `public/joclaim-browser-extension-sdk/` 目录下，但 SDK 源码中 5 处 `chrome.runtime.getURL()` 调用仍使用旧路径前缀 `reclaim-browser-extension-sdk/`：

| 文件 | 资源 |
|------|------|
| `reclaim-provider-verification-popup.js` | CSS 文件路径 |
| `reclaim-provider-verification-popup.js` | HTML 模板路径 |
| `offscreen-manager.js` | offscreen.html 路径 |
| `content.js` | network-interceptor.bundle.js 路径 |
| `content.js` | injection-scripts.bundle.js 路径 |

### 解决方案
将所有 5 处路径前缀从 `reclaim-browser-extension-sdk` 修改为 `joclaim-browser-extension-sdk`：

```javascript
// ❌ 旧路径
chrome.runtime.getURL("reclaim-browser-extension-sdk/content/components/...")

// ✅ 新路径
chrome.runtime.getURL("joclaim-browser-extension-sdk/content/components/...")
```

同时，扩展的 `manifest.json` 中 `web_accessible_resources` 需要同时声明 `joclaim-` 和 `reclaim-` 前缀的弹窗资源文件（因为两个版本的文件都存在于 build 产物中）。

### 涉及仓库
- `@joclaim/browser-extension-sdk` — popup 组件、content.js、offscreen-manager.js
- `test-extension` — manifest.json（web_accessible_resources）

---

## 6. Offscreen 文档初始化失败：ejs CSP 违规

### 现象
Offscreen 文档创建成功但永远不发送 `OFFSCREEN_DOCUMENT_READY` 信号，导致：
```
Error: Failed to initialize or confirm offscreen document readiness.
```

控制台显示：
```
ejs.js:109 Uncaught EvalError: Evaluating a string as JavaScript violates the
Content Security Policy directive because 'unsafe-eval' is not an allowed
source of script: script-src 'self' 'wasm-unsafe-eval'
```

### 根因
`snarkjs` 包的默认入口（`main.js`）通过传递依赖链引入了 `ejs` 模板引擎库。`ejs` 在模块初始化时调用 `new Function()`（即 `eval` 变种），违反了 Chrome Manifest V3 的 CSP 策略。

> **重要**：Manifest V3 **完全禁止** `unsafe-eval`，无法通过修改 CSP 来解决。

### 解决方案
将 `snarkjs` 的 webpack alias 指向**浏览器专用 ESM 构建**，该版本中 `ejs` 已被 stub 掉：

```javascript
// ❌ 旧配置：引入完整 snarkjs（包含 ejs）
snarkjs: path.resolve(__dirname, "node_modules/@joclaim/snarkjs"),

// ✅ 新配置：使用浏览器构建（ejs 已 stub）
snarkjs: path.resolve(__dirname, "node_modules/@joclaim/snarkjs/build/browser.esm.js"),
```

### 涉及仓库
- `@joclaim/browser-extension-sdk` — webpack.config.js

---

## 通用排查思路

### webpack alias 问题排查模式

当遇到浏览器环境中的模块解析或运行时错误时：

1. **确认是否为 Node.js-only 模块**：检查报错模块是否依赖 `fs`、`path`、`worker_threads` 等 Node.js API
2. **确认是否为 ESM exports 不兼容**：检查目标包的 `package.json` 是否使用 `exports` 字段
3. **确认是否为 CSP 违规**：检查依赖链中是否有使用 `eval`/`new Function` 的库
4. **合适的解决方式**：
   - Node.js-only 模块 → `alias: { module: false }` 或提供 mock
   - ESM exports 不兼容 → 使用精确文件路径 alias（带 `$` 后缀）
   - CSP 违规 → 使用库的浏览器构建版本或 stub 掉违规模块

### 版本发布顺序

发布新版本时**必须**按依赖顺序：

```
1. @joclaim/tls
2. @joclaim/attestor-core    （依赖 tls）
3. @joclaim/browser-extension-sdk （依赖 tls + attestor-core）
```

发布后更新下游项目（`test-extension`、`test-web-app`）时，先 `npm cache clean --force` 再 `npm install`，避免 registry 传播延迟导致安装旧版本。
