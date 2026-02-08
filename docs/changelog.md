# Reclaim zkTLS 本地化 — 修改记录

## 概述

将 Reclaim zkTLS 系统从依赖远程服务 (`api.reclaimprotocol.org`, `logs.reclaimprotocol.org`, `attestor.reclaimprotocol.org`) 改为完全本地运行。所有组件均使用 `file:` 本地依赖，无需任何远程连接。

---

## 一、attestor-core (后端 Attestor 服务)

### 新增文件

| 文件 | 功能 |
|------|------|
| `src/server/provider-store.ts` | Provider 文件存储 — CRUD 操作，读写 `data/providers/*.json` |
| `src/server/provider-api.ts` | Provider REST API — `GET/POST /api/providers`, `GET/DELETE /api/providers/:id`, `GET /api/providers/:id/custom-injection` |
| `src/server/session-store.ts` | Session 内存存储 — 创建/查询/更新会话，存储证明 |
| `src/server/session-api.ts` | Session REST API — `POST /api/sdk/init/session/`, `POST /api/sdk/update/session/`, `GET /api/sdk/session/:id`, `POST /session/:id/proof` |
| `data/providers/*.json` | 4 个 Provider 配置文件 (Instagram、Binance KYC x3) |
| `docs/architecture.md` | 系统架构拓扑图与完整交互流程文档 |
| `docs/changelog.md` | 本文件 — 修改记录 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/server/create-server.ts` | 新增路由: `/api/sdk/*` → session-api, `/api/providers` → provider-api, `/api/logs` → 日志接收端点; CORS headers |
| `src/server/socket.ts` | 日志清理: 移除 `{ res }` 整体 dump（主要噪音源），RPC/tunnel 日志降级为 debug |
| `src/server/handlers/createTunnel.ts` | 日志清理: TCP 转发日志降级为 debug，简化隧道创建/关闭日志 |
| `src/server/tunnels/make-tcp-tunnel.ts` | 日志清理: 移除每包数据日志，只保留连接/断开摘要 |
| `src/server/utils/apm.ts` | APM 未配置警告改为只输出一次，降级为 debug |
| `src/server/utils/assert-valid-claim-request.ts` | 日志清理: 移除 `{ newData }` 对象 dump |
| `src/server/utils/tee-oprf-verification.ts` | 日志清理: OPRF 验证日志全部降级为 debug，移除明文内容输出 |
| `src/providers/http/index.ts` | 日志清理: 移除完整 base64 编码的 request/response 输出，改为只记录长度 |
| `package.json` | 新增依赖 `@reclaimprotocol/zk-symmetric-crypto: file:../zk-symmetric-crypto/js` |

---

## 二、reclaim-browser-extension-sdk (浏览器扩展 SDK)

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/utils/constants/constants.js` | `BACKEND_URL` 从 `https://api.reclaimprotocol.org` 改为 `http://localhost:8001` |
| `src/interceptor/injection-scripts.js` | `BACKEND_URL` 从 `https://api.reclaimprotocol.org` 改为 `http://localhost:8001` |
| `src/utils/logger/constants.js` | 日志端点从 `https://logs.reclaimprotocol.org/...` 改为 `http://localhost:8001/api/logs` |
| `src/utils/claim-creator/claim-creator.js` | WebSocket URL 从 `wss://attestor.reclaimprotocol.org/ws` 改为 `ws://localhost:8001/ws` |
| `src/utils/proof-generator/proof-formatter.js` | WebSocket URL 从 `wss://attestor.reclaimprotocol.org/ws` 改为 `ws://localhost:8001/ws` |
| `webpack.config.js` | RE2 mock: 从 `re2: false`（空模块）改为指向 `re2-mock.js` |
| `src/utils/mocks/re2-mock.js` | 重写 RE2 mock: 支持无 `new` 调用 `RE2(pattern, flags)`，修复 `Jx is not a function` 错误 |
| `src/offscreen/offscreen.js` | 增强错误处理: 捕获非标准 error 对象，添加 `console.error` 直接输出 |
| `package.json` | attestor-core 依赖从 npm `4.0.3` 改为 `file:../attestor-core` |

---

## 三、tls (TLS 协议库)

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/crypto/webcrypto.ts` | 浏览器兼容: 优先使用 `globalThis.crypto`，Node.js 环境回退到 `webcrypto` |
| `src/utils/parse-server-hello.ts` | 修复 CLOSE_NOTIFY: 正确处理 TLS alert 消息，避免连接异常中断 |

---

## 四、zk-symmetric-crypto (ZK 对称加密库)

### 修改文件

| 文件 | 改动 |
|------|------|
| `js/package.json` | `snarkjs` 从 GitHub 改为 `file:../../snarkjs`; `@reclaimprotocol/tls` 从 npm 改为 `file:../../tls` |
| `js/src/snarkjs/operator.ts` | TypeScript 修复: `@ts-expect-error` → `@ts-ignore`; snarkjs API 调用加 `as any` 类型断言 |

---

## 五、snarkjs (ZK 证明库)

无代码修改，仅克隆到本地并执行 `npm install` 安装依赖。

---

## 六、修复的 Bug 列表

| Bug | 根因 | 修复方式 |
|-----|------|----------|
| `Jx is not a function` | webpack `re2: false` 生成空模块，RE2 构造函数不存在 | 重写 re2-mock.js 支持函数调用方式 |
| 证明生成失败返回 `undefined` | offscreen catch 块未处理非标准 error 对象 | 多类型错误提取 + console.error |
| ENOENT `circuit_final.zkey` | npm 包不包含 `resources/` 目录（279MB ZK 电路文件） | 克隆完整仓库，使用 `file:` 依赖 |
| `Cannot find package 'ffjavascript'` | snarkjs 本地克隆未安装依赖 | `npm install` 安装 |
| CLOSE_NOTIFY 导致连接中断 | TLS alert 消息解析逻辑缺陷 | 修复 parse-server-hello.ts |
| 浏览器环境 crypto 不可用 | Node.js `webcrypto` 在浏览器环境不存在 | 优先使用 `globalThis.crypto` |
| TypeScript 编译错误 | 本地 snarkjs 类型定义与 `@ts-expect-error` 冲突 | 改用 `@ts-ignore` + `as any` |
| 日志输出大量 base64 数据 | 多处 logger.info/debug 输出完整 transcript | 降级为 debug，移除内容输出 |
| APM 警告重复刷屏 | `getApm()` 每次调用都输出未配置警告 | 加 flag 只输出一次 |

---

## 七、本地依赖拓扑

```
tls (v0.1.1)
 ├──► zk-symmetric-crypto/js (v5.0.5)
 │     └──► snarkjs (本地 clone)
 ├──► attestor-core (v5.0.0)
 │     └──► zk-symmetric-crypto/js
 └──► browser-extension-sdk
       └──► attestor-core

所有 → 均为 file: 本地引用，无远程依赖
```

## 八、构建与运行

```bash
# 0. 确保 Node 22
nvm use 22

# 1. 构建 TLS (如有改动)
cd tls && npm run build

# 2. 构建 ZK-Symmetric-Crypto (如有改动)
cd zk-symmetric-crypto/js && npm run build

# 3. 构建 Attestor-Core
cd attestor-core && npm run build

# 4. 启动 Attestor 服务
cd attestor-core && npm start  # 端口 8001

# 5. 构建 SDK
cd reclaim-browser-extension-sdk && npm run build

# 6. 构建 Chrome 扩展
cd reclaim-browser-extension-sdk/examples/basic-extension && npm run build

# 7. Chrome 加载扩展: 加载 examples/basic-extension/dist/

# 8. 启动 Web App
cd reclaim-browser-extension-sdk/examples/web-app && npm run dev
```
