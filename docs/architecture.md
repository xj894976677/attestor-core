# Reclaim zkTLS 系统架构 — 完整拓扑图与交互流程

## 一、系统拓扑图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              用户浏览器 (Chrome)                                 │
│                                                                                 │
│  ┌──────────────┐    window.postMessage     ┌────────────────────────────────┐  │
│  │   Web App    │◄────────────────────────► │     Chrome Extension           │  │
│  │  (React页面)  │                           │                                │  │
│  │              │                           │  ┌────────────┐                │  │
│  │  ReclaimSDK  │                           │  │Content Script│ ◄──inject──┐ │  │
│  │  (SDK入口)    │                           │  │  (桥接层)    │            │ │  │
│  └──────────────┘                           │  └──────┬─────┘            │ │  │
│                                             │         │chrome.runtime    │ │  │
│                                             │         │.sendMessage      │ │  │
│  ┌──────────────┐                           │  ┌──────▼──────┐           │ │  │
│  │  目标网站页面  │──拦截HTTP请求──────────────│─►│Background.js │───────────┘ │  │
│  │ (Instagram等) │                           │  │  (调度中心)   │            │  │
│  │              │◄──注入脚本(MSWJS/Custom)───│──┤              │            │  │
│  └──────────────┘                           │  └──────┬───────┘            │  │
│                                             │         │chrome.runtime      │  │
│                                             │         │.sendMessage        │  │
│                                             │  ┌──────▼──────┐             │  │
│                                             │  │Offscreen Doc │             │  │
│                                             │  │(ZK证明生成)   │             │  │
│                                             │  │ WASM运行环境  │             │  │
│                                             │  └──────┬───────┘             │  │
│                                             └─────────┼─────────────────────┘  │
└───────────────────────────────────────────────────────┼─────────────────────────┘
                                                        │
                                            WebSocket + HTTP
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Attestor Core (localhost:8001)                            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                       HTTP Server                                   │        │
│  │                                                                     │        │
│  │  POST /api/sdk/init/session/     ──► session-api.ts (创建会话)       │        │
│  │  POST /api/sdk/update/session/   ──► session-api.ts (更新状态)       │        │
│  │  GET  /api/sdk/session/:id       ──► session-api.ts (查询会话)       │        │
│  │  POST /session/:id/proof         ──► session-api.ts (提交证明)       │        │
│  │  GET  /api/providers/:id         ──► provider-api.ts (获取provider)  │        │
│  │  GET  /api/providers/:id/custom-injection ──► provider-api.ts       │        │
│  │  POST /api/logs                  ──► create-server.ts (SDK日志)      │        │
│  └─────────────────────────────────────────────────────────────────────┘        │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐        │
│  │                    WebSocket Server (/ws)                           │        │
│  │                                                                     │        │
│  │  RPC: init           ──► handlers/init.ts         (初始化连接)       │        │
│  │  RPC: createTunnel   ──► handlers/createTunnel.ts (创建TCP隧道)     │        │
│  │  MSG: tunnelMessage  ──► socket.ts                (双向数据转发)     │        │
│  │  RPC: claimTunnel    ──► handlers/claimTunnel.ts  (验证+签名证明)    │        │
│  └──────────────┬──────────────────────────────────────────────────────┘        │
│                 │                                                                │
│                 │ TCP Socket                                                     │
│                 ▼                                                                │
│  ┌──────────────────────┐    ┌────────────────────┐   ┌──────────────────┐      │
│  │   TCP Tunnel         │    │  ZK Verification   │   │  Provider Store  │      │
│  │  (make-tcp-tunnel.ts)│    │  (snarkjs/gnark)   │   │  (data/providers)│      │
│  │  记录完整transcript   │    │  验证ZK证明         │   │   JSON文件       │      │
│  └──────────┬───────────┘    └────────────────────┘   └──────────────────┘      │
│             │                                                                    │
└─────────────┼────────────────────────────────────────────────────────────────────┘
              │
              │ TLS over TCP
              ▼
┌──────────────────────┐
│    目标API服务器       │
│  (Instagram/Binance等)│
│                      │
│  HTTPS端口443        │
└──────────────────────┘
```

## 二、全局接口一览

### A. HTTP REST 接口 (attestor-core → localhost:8001)

| 接口 | 方法 | 调用方 | 功能 | 请求体 | 响应体 |
|------|------|--------|------|--------|--------|
| `/api/sdk/init/session/` | POST | SDK | 创建验证会话 | `{appId, providerId, timestamp, signature}` | `{sessionId, resolvedProviderVersion}` |
| `/api/sdk/update/session/` | POST | SDK/Background | 更新会话状态 | `{sessionId, status}` | `{success: true}` |
| `/api/sdk/session/:id` | GET | SDK | 查询会话状态 | - | `{sessionId, status, ...}` |
| `/session/:id/proof` | POST | Background | 提交最终证明 | `{proofs: [...]}` | `{success: true}` |
| `/api/providers/:id` | GET | Background | 获取Provider配置 | - | `{providers: {...}}` |
| `/api/providers/:id/custom-injection` | GET | Content Script | 获取自定义注入脚本 | - | `text/plain (JS代码)` |
| `/api/providers` | GET | 管理 | 列出所有Provider | - | `{providers: [...]}` |
| `/api/providers` | POST | 管理 | 创建Provider | Provider JSON | `{success, provider}` |
| `/api/logs` | POST | SDK Logger | 接收SDK诊断日志 | 任意JSON | `{success: true}` |

### B. WebSocket RPC 接口 (attestor-core → ws://localhost:8001/ws)

| RPC方法 | 方向 | 功能 | 请求数据 | 响应数据 |
|---------|------|------|----------|----------|
| `init` | Client→Server | 初始化WS连接、交换密钥 | `{clientVersion, signatureType}` | `{toprfPublicKey}` |
| `createTunnel` | Client→Server | 建立到目标服务器的TCP隧道 | `{id, host, port, geoLocation}` | `{}` |
| `tunnelMessage` | 双向 | 转发TLS加密数据 | `{tunnelId, message: Uint8Array}` | (无响应，单向消息) |
| `tunnelDisconnectEvent` | Server→Client | 通知隧道断开 | `{tunnelId, error?}` | (无响应，事件通知) |
| `claimTunnel` | Client→Server | 提交transcript、验证并签名 | `{request, transcript, data, signatures, zkEngine}` | `{claim, signatures, error?}` |
| `disconnectTunnel` | Client→Server | 主动断开隧道 | `{id}` | `{}` |

### C. Chrome Extension 内部消息

| 消息Action | 发送方 → 接收方 | 功能 |
|-----------|----------------|------|
| `START_VERIFICATION` | SDK/ContentScript → Background | 启动验证流程 |
| `CONTENT_SCRIPT_LOADED` | ContentScript → Background | 内容脚本就绪 |
| `CHECK_IF_MANAGED_TAB` | ContentScript → Background | 检查是否托管标签 |
| `FILTERED_REQUEST_FOUND` | ContentScript → Background | 发现匹配的HTTP请求 |
| `CLAIM_CREATION_REQUESTED` | Background → ContentScript | 开始创建Claim |
| `GENERATE_PROOF` | Background → Offscreen | 请求生成ZK证明 |
| `GENERATE_PROOF_RESPONSE` | Offscreen → Background | 返回证明结果 |
| `GET_PRIVATE_KEY` | Background → Offscreen | 获取随机私钥 |
| `PROOF_GENERATION_SUCCESS` | Background → ContentScript | 证明生成成功 |
| `PROOF_SUBMITTED` | Background → ContentScript/SDK | 证明已提交 |

### D. Window PostMessage (网页 ↔ 插件)

| 消息Action | 发送方 → 接收方 | 功能 |
|-----------|----------------|------|
| `RECLAIM_START_VERIFICATION` | WebApp → ContentScript | 从网页启动验证 |
| `RECLAIM_VERIFICATION_COMPLETED` | ContentScript → WebApp | 返回证明给网页 |
| `RECLAIM_VERIFICATION_FAILED` | ContentScript → WebApp | 通知验证失败 |
| `RECLAIM_CHECK_EXTENSION` | WebApp → ContentScript | 检查插件是否安装 |
| `INTERCEPTED_REQUEST_AND_RESPONSE` | NetworkInterceptor → ContentScript | 拦截到的HTTP请求 |

---

## 三、完整交互时序图

```
WebApp          ContentScript      Background        Offscreen        Attestor         目标服务器
  │                  │                │                  │               │                │
  │ ① SDK.init()     │                │                  │               │                │
  │──────────────────────────────────────────────────────────────────────►│                │
  │                  │                │                  │  POST /api/   │                │
  │                  │                │                  │  sdk/init/    │                │
  │                  │                │                  │  session/     │                │
  │◄─────────────────────────────────────────────────────────────────────│                │
  │  {sessionId}     │                │                  │               │                │
  │                  │                │                  │               │                │
  │ ② startVerification()            │                  │               │                │
  │─ postMessage ──►│                │                  │               │                │
  │ RECLAIM_START_   │                │                  │               │                │
  │ VERIFICATION     │                │                  │               │                │
  │                  │─ sendMessage ─►│                  │               │                │
  │                  │ START_         │                  │               │                │
  │                  │ VERIFICATION   │                  │               │                │
  │                  │                │                  │               │                │
  │                  │                │ ③ 获取Provider配置                │                │
  │                  │                │─────────────────────────────────►│                │
  │                  │                │  GET /api/providers/:id          │                │
  │                  │                │◄─────────────────────────────────│                │
  │                  │                │  {providers: {...}}              │                │
  │                  │                │                  │               │                │
  │                  │                │ ④ 打开新标签页 (目标网站)          │                │
  │                  │                │──chrome.tabs.create──►          │                │
  │                  │                │                  │               │                │
  │                  │                │ ⑤ 更新会话状态                    │                │
  │                  │                │─────────────────────────────────►│                │
  │                  │                │ POST /api/sdk/update/session/    │                │
  │                  │                │ status: USER_STARTED_VERIFICATION│                │
  │                  │                │                  │               │                │
  │          ┌───────────────────────────────────────────┐               │                │
  │          │   目标网站标签页 (如 Instagram)              │               │                │
  │          │                                           │               │                │
  │          │   ContentScript注入:                       │               │                │
  │          │   • network-interceptor.bundle.js          │               │                │
  │          │   • injection-scripts.bundle.js            │               │                │
  │          │                                           │               │                │
  │          │ ⑥ 用户在目标网站操作 (登录/浏览)             │               │                │
  │          │    ↓                                       │               │                │
  │          │ ⑦ 拦截器捕获HTTP请求                        │               │                │
  │          │   NetworkInterceptor ──postMessage──►     │               │                │
  │          │   ContentScript (INTERCEPTED_REQUEST)     │               │                │
  │          │    ↓                                       │               │                │
  │          │ ⑧ 匹配Provider模板                         │               │                │
  │          │   filterRequest() → 找到匹配!              │               │                │
  │          │    ↓                                       │               │                │
  │          │ ⑨ 通知Background                          │               │                │
  │          │   ──sendMessage──►Background              │               │                │
  │          │   FILTERED_REQUEST_FOUND                  │               │                │
  │          └───────────────────────────────────────────┘               │                │
  │                  │                │                  │               │                │
  │                  │                │ ⑩ 构建Claim对象                  │                │
  │                  │                │──sendMessage────►│               │                │
  │                  │                │ GET_PRIVATE_KEY   │               │                │
  │                  │                │◄────────────────│               │                │
  │                  │                │ {privateKey}      │               │                │
  │                  │                │                  │               │                │
  │                  │                │ createClaimObject()               │                │
  │                  │                │ 构建请求参数、分离公开/隐私数据     │                │
  │                  │                │                  │               │                │
  │                  │                │ ⑪ 发送到Offscreen生成证明         │                │
  │                  │                │──sendMessage────►│               │                │
  │                  │                │ GENERATE_PROOF    │               │                │
  │                  │                │                  │               │                │
  │                  │                │                  │ ⑫ WebSocket连接│                │
  │                  │                │                  │──────────────►│                │
  │                  │                │                  │ ws://localhost │                │
  │                  │                │                  │ :8001/ws      │                │
  │                  │                │                  │               │                │
  │                  │                │                  │ ⑬ RPC: init   │                │
  │                  │                │                  │──────────────►│                │
  │                  │                │                  │ {clientVersion │                │
  │                  │                │                  │  signatureType}│                │
  │                  │                │                  │◄──────────────│                │
  │                  │                │                  │{toprfPublicKey}│                │
  │                  │                │                  │               │                │
  │                  │                │                  │ ⑭ RPC:        │                │
  │                  │                │                  │ createTunnel  │                │
  │                  │                │                  │──────────────►│                │
  │                  │                │                  │{id,host,port} │   TCP连接       │
  │                  │                │                  │               │───────────────►│
  │                  │                │                  │◄──────────────│               │
  │                  │                │                  │ {}            │                │
  │                  │                │                  │               │                │
  │                  │                │                  │ ⑮ TLS握手 (通过隧道)            │
  │                  │                │                  │──tunnelMsg───►│──TCP转发──────►│
  │                  │                │                  │◄──tunnelMsg──│◄──TCP转发──────│
  │                  │                │                  │ (ClientHello) │ (ServerHello)  │
  │                  │                │                  │──tunnelMsg───►│──TCP转发──────►│
  │                  │                │                  │◄──tunnelMsg──│◄──TCP转发──────│
  │                  │                │                  │ (多轮TLS握手)  │                │
  │                  │                │                  │               │                │
  │                  │                │                  │ ⑯ HTTP请求 (TLS加密,通过隧道)    │
  │                  │                │                  │──tunnelMsg───►│──TCP转发──────►│
  │                  │                │                  │  (加密的GET/POST请求)            │
  │                  │                │                  │◄──tunnelMsg──│◄──TCP转发──────│
  │                  │                │                  │  (加密的HTTP响应)                │
  │                  │                │                  │               │                │
  │                  │                │                  │   *** Attestor记录完整transcript │
  │                  │                │                  │               │                │
  │                  │                │                  │ ⑰ RPC:        │                │
  │                  │                │                  │ claimTunnel   │                │
  │                  │                │                  │──────────────►│                │
  │                  │                │                  │ {transcript,  │                │
  │                  │                │                  │  data,        │                │
  │                  │                │                  │  signatures,  │   关闭TCP       │
  │                  │                │                  │  zkEngine}    │───────────────►│
  │                  │                │                  │               │                │
  │                  │                │                  │               │ Attestor验证:   │
  │                  │                │                  │               │ 1.对比transcript│
  │                  │                │                  │               │ 2.解密TLS流量   │
  │                  │                │                  │               │ 3.验证ZK证明    │
  │                  │                │                  │               │ 4.匹配响应规则  │
  │                  │                │                  │               │ 5.签名claim    │
  │                  │                │                  │               │                │
  │                  │                │                  │◄──────────────│                │
  │                  │                │                  │ {claim,       │                │
  │                  │                │                  │  signatures:{ │                │
  │                  │                │                  │   attestorAddr│                │
  │                  │                │                  │   claimSig,   │                │
  │                  │                │                  │   resultSig}} │                │
  │                  │                │                  │               │                │
  │                  │                │ ⑱ 返回证明结果    │               │                │
  │                  │                │◄──sendMessage────│               │                │
  │                  │                │GENERATE_PROOF_   │               │                │
  │                  │                │RESPONSE          │               │                │
  │                  │                │                  │               │                │
  │                  │                │ ⑲ 格式化证明                     │                │
  │                  │                │ formatProof()     │               │                │
  │                  │                │                  │               │                │
  │                  │                │ ⑳ 提交证明                       │                │
  │                  │                │─────────────────────────────────►│                │
  │                  │                │ POST /session/:id/proof          │                │
  │                  │                │ POST /api/sdk/update/session/    │                │
  │                  │                │ status: PROOF_SUBMITTED          │                │
  │                  │                │                  │               │                │
  │                  │ ㉑ 通知证明完成 │                  │               │                │
  │                  │◄──sendMessage──│                  │               │                │
  │                  │ PROOF_SUBMITTED│                  │               │                │
  │                  │                │                  │               │                │
  │ ㉒ 返回证明给网页 │                │                  │               │                │
  │◄──postMessage───│                │                  │               │                │
  │ RECLAIM_         │                │                  │               │                │
  │ VERIFICATION_    │                │                  │               │                │
  │ COMPLETED        │                │                  │               │                │
  │                  │                │                  │               │                │
  │ ㉓ 显示证明结果   │                │                  │               │                │
  │ ProofCard渲染    │                │                  │               │                │
  ▼                  ▼                ▼                  ▼               ▼                ▼
```

## 四、会话状态流转

```
                    POST /api/sdk/init/session/
                              │
                              ▼
                    ┌──────────────────┐
                    │   SESSION_CREATED │
                    └────────┬─────────┘
                             │  POST /api/sdk/update/session/
                             ▼
                    ┌──────────────────────────┐
                    │ USER_STARTED_VERIFICATION │
                    └────────┬─────────────────┘
                             │  (用户在目标网站操作，拦截到匹配请求)
                             ▼
                    ┌──────────────────────────┐
                    │ PROOF_GENERATION_STARTED  │
                    └────────┬─────────────────┘
                             │  (WebSocket → Attestor验证 → ZK证明)
                             │
                    ┌────────┴─────────┐
                    ▼                  ▼
         ┌─────────────────┐  ┌────────────────────┐
         │ PROOF_GENERATION │  │ PROOF_GENERATION   │
         │ _SUCCESS         │  │ _FAILED            │
         └────────┬────────┘  └────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ PROOF_SUBMITTED │
         └────────────────┘
```

## 五、核心安全机制

```
┌────────────────────────────────────────────────────────────┐
│                    信任模型                                  │
│                                                            │
│  客户端(SDK)          Attestor             目标服务器        │
│  ┌────────┐         ┌────────┐          ┌────────┐        │
│  │ 持有    │         │ 持有    │          │ 持有    │        │
│  │ 用户私钥 │         │ 见证者  │          │ 真实数据 │        │
│  │         │         │ 私钥    │          │         │        │
│  └────┬───┘         └────┬───┘          └────┬───┘        │
│       │                  │                   │             │
│       │  TLS加密数据通过   │   TCP明文连接      │             │
│       │  WebSocket传输    │   (但TLS加密)      │             │
│       │─────────────────►│──────────────────►│             │
│       │                  │                   │             │
│       │  关键: Attestor   │                   │             │
│       │  看到的是TLS加密   │                   │             │
│       │  数据,不知道内容   │                   │             │
│       │                  │                   │             │
│       │  但Attestor记录   │                   │             │
│       │  了完整transcript │                   │             │
│       │  可以验证客户端    │                   │             │
│       │  提交的transcript │                   │             │
│       │  没有被篡改       │                   │             │
│       │                  │                   │             │
│       │  ZK证明:          │                   │             │
│       │  客户端证明解密后  │                   │             │
│       │  的数据满足条件,   │                   │             │
│       │  无需暴露完整内容  │                   │             │
└───────┴──────────────────┴───────────────────┴─────────────┘
```

## 六、数据流中的关键数据结构

### Provider 配置 (存储在 data/providers/*.json)
```json
{
  "providerId": "uuid",
  "name": "Instagram Account",
  "loginUrl": "https://www.instagram.com/accounts/login/",
  "geoLocation": "",
  "injectionType": "NONE | MSWJS",
  "requestData": [
    {
      "url": "https://i.instagram.com/api/v1/...",
      "method": "GET",
      "responseMatches": [
        { "type": "contains", "value": "\"status\":\"ok\"" }
      ],
      "responseRedactions": [
        { "jsonPath": "$.user.username", "xPath": "" }
      ]
    }
  ],
  "customInjection": "/* 自定义JS脚本，在目标页面执行 */",
  "writeRedactionMode": "zk | key-update | null"
}
```

### Claim 对象 (SDK → Offscreen → Attestor)
```json
{
  "name": "http",
  "params": {
    "url": "https://api.target.com/endpoint",
    "method": "GET",
    "responseMatches": [...],
    "responseRedactions": [...]
  },
  "secretParams": {
    "headers": { "Cookie": "...", "Authorization": "..." }
  },
  "ownerPrivateKey": "0x...",
  "client": { "url": "ws://localhost:8001/ws" }
}
```

### 最终证明 (返回给 WebApp)
```json
{
  "identifier": "0x1234...abcd",
  "claimData": {
    "provider": "providerId",
    "owner": "0xUserAddress",
    "timestampS": 1234567890,
    "context": "{\"extractedParameters\":{\"username\":\"john\"}}",
    "epoch": 1
  },
  "signatures": ["0xAttestorSignature..."],
  "witnesses": [{
    "id": "0xAttestorAddress",
    "url": "ws://localhost:8001/ws"
  }]
}
```

## 七、依赖拓扑

```
┌──────────────────┐
│       tls        │  TLS协议实现 (本地 v0.1.1)
│  npm run build   │
└────────┬─────────┘
         │ file:../tls
         ▼
┌──────────────────┐     ┌──────────────┐
│ zk-symmetric-    │────►│   snarkjs     │  ZK证明库 (本地clone)
│ crypto/js        │     │  (本地clone)   │
│ npm run build    │     └──────────────┘
└────────┬─────────┘
         │ file:../zk-symmetric-crypto/js
         ▼
┌──────────────────┐
│  attestor-core   │  后端服务 (port 8001)
│  npm run build   │
│  npm start       │
└────────┬─────────┘
         │ file:../attestor-core
         ▼
┌──────────────────┐
│ browser-extension│  浏览器扩展SDK
│ -sdk             │
│ npm run build    │
└────────┬─────────┘
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│basic-  │ │web-app │
│extension│ │(Vite)  │
│npm build│ │npm dev │
└────────┘ └────────┘
```
