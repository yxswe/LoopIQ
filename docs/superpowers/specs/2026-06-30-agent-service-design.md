# AI Agent Service 架构设计

日期：2026-06-30
状态：已确认，待实施
目标项目：LoopIQ（`backend/`，Hono + better-sqlite3）

## 1. 背景与目标

在 LoopIQ 现有后端（Hono + better-sqlite3 + cookie 鉴权）之上，新增 `agent` 模块，复用 Pi agent harness（`@earendil-works/pi-agent-core` / `@earendil-works/pi-ai`，作为依赖引入），通过 HTTP API 对外提供「发消息 → 流式回复 + 工具调用」能力。

用户最初提供了一份借鉴 .NET（Picasso）的架构草案，核心是在 Node 里从零重写 agent loop、turn 管理、session、持久化、断线重放等。本设计 review 了该草案，结论是：**草案方向对，但大量重复造轮子**——harness 已经实现了草案中 Turn 层和 Loop 层的全部能力。本设计将这两层「塌缩」为复用 harness 的 `Agent` 对象，service 只构建 harness 不提供的外围层。

**关键约束：本设计落在已有的 LoopIQ 后端里，不是独立新服务。** 因此复用 LoopIQ 既有基建：Hono app、`requireAuth` cookie 鉴权、`getDb()` 单例 + 版本化 migrations、`newId()`（ulid）、`src/modules/<feature>/` 模块约定。原草案里凡是与之冲突的部分（fastify、Bearer `verifyToken`、自建 db.ts）一律改为对接 LoopIQ 既有实现。

### 已锁定的需求决策

| 维度 | 决策 |
|---|---|
| 工作负载 | 轻量对话为主 + 少量编码/任务；重活外包；工具全是纯 I/O 外部 API（搜索 / 网页查询 / Google Drive / OneDrive 文件 CRUD） |
| 进程模型 | 单进程 in-process（在 LoopIQ 后端进程内直接 import `pi-agent-core`），预留多进程 + 哈希网关扩展 |
| 传输层 | HTTP + SSE（控制面 POST，事件流 SSE via Hono `streamSSE`，Last-Event-ID 重放） |
| 部署 | 单机起步；状态走 DB、会话不绑进程、事件可重放 |
| 存储 | 自实现 DB 版 `SessionStorage`，落在 LoopIQ 的 better-sqlite3（`getDb()`）+ 新 migration version；后期可迁 Postgres |
| 多租户 | 复用 LoopIQ 既有 cookie 鉴权（`requireAuth`），按 `user.id` 隔离会话 |
| CPU 活处置 | 推到 API / 微服务边界，主进程恒为纯 I/O，不上 worker_threads |

### 与 LoopIQ 既有基建的对接点

| LoopIQ 既有 | agent 模块如何用 |
|---|---|
| `requireAuth` 中间件（`middleware/auth.ts`，cookie `loopiq_sid` → `c.get('user')`） | agent 所有路由挂 `requireAuth`，userId 取 `c.get('user')!.id`，**不引入新的 Bearer token 体系** |
| `getDb()` 单例（`db/connection.ts`，better-sqlite3 + WAL + FK on） | `ConversationStorage` 直接 `getDb()`，不另开连接 |
| 版本化 migrations 数组（`db/migrations.ts`） | 新增 `version: 2`，建 agent 相关表 |
| `newId()` = ulid（`db/id.ts`） | 会话 id / entry id 用 ulid（替代草案里的 uuidv7；ulid 同样单调有序、可排序） |
| `src/modules/<feature>/<feature>.route.ts/.service.ts` 约定 | 新增 `src/modules/agent/`，`app.route('/api/agent', agentRoute)` |
| Hono `streamSSE`（`hono/streaming`） | SSE 事件面用它，替代草案里手写的 fastify SSE 写入器 |
| 既有 `sessions` 表（属于鉴权，存登录会话） | **命名冲突规避**：agent 的「对话会话」改名 **conversation**，不叫 session，避免与鉴权 sessions 混淆 |

## 2. 核心定调：复用 vs 自建

整个架构的地基是分清「harness 已有」「LoopIQ 已有」和「agent 模块要自建」三者的边界。

### 直接复用 harness（草案打算自己写，但不该写）

| 草案模块 | 改为复用 | 理由 |
|---|---|---|
| `runAgentLoop` async generator | `pi-agent-core` 的 `Agent` 类 | 已含并行工具、失败回灌、tool_call_id 配对、abort |
| `TurnManager` + steer/stop | `Agent.prompt/steer/followUp/abort/waitForIdle` | 已含 steering/followUp 双队列 + `all`/`one-at-a-time` 两种排空模式 |
| `AsyncQueue`（手写 Channel） | `Agent` 内部队列 | 不需要自造 Channel 原语 |
| `streamLLM` | `pi-ai` 的 `streamSimple` | 多 provider、重试、OAuth、transport 抽象 |
| 历史 / 持久化数据结构 | `Session` + `SessionStorage` 接口 | 自带树状分支、fork、compaction |

**结论**：草案的分层骨架（Transport → Session → Turn → Loop → 持久化）方向正确，但 Turn 层和 Loop 层塌缩成 harness 的一个 `Agent` 对象。agent 模块只需在它外面包 Transport(Hono) + Registry + DB-Storage + Tools，鉴权/DB 基建直接借 LoopIQ。

### 真正需要自建（harness 没有、LoopIQ 也没有，这是 agent 模块的价值）

1. HTTP/SSE 传输层 —— harness 只有 stdin/stdout 的 RPC 模式，无网络服务层；用 Hono 路由 + `streamSSE` 实现
2. `ConversationRegistry` —— 内存 `Map<conversationId, LiveConversation>`，管 idle 淘汰、连接计数、userId 归属
3. `ReplayableBuffer` —— 事件重放缓冲，事件来自 `Agent.subscribe()`
4. DB 版 `ConversationStorage` —— 实现 harness 的 `SessionStorage` 11 个接口方法，落在 LoopIQ 的 `getDb()`
5. 工具集（搜索 / 网页 / Drive 的 `AgentTool` 薄包装）+ OAuth 凭证管理
6. 安全阀：迭代上限、并发活跃数限流、token 计数走廉价估算

> 多租户边界不再单列为「自建」——它落在复用 LoopIQ `requireAuth` + 每路由的 userId 归属校验上。

### 否决的替代方案

- **复用 `@earendil-works/pi-orchestrator`（进程隔离，process-per-agent）**：每会话一个 `pi --mode rpc` 子进程，崩溃不传染，但轻量场景每会话一个 Node 进程开销过大，上千会话不现实。否决。
- **完全从零写 loop（草案原方案）**：重复造轮子，且要自己维护并行工具/重试/compaction 的正确性。否决。
- **独立新建 fastify 服务 + Bearer 鉴权（早期草案隐含）**：与 LoopIQ 既有 Hono + cookie 栈割裂，多一套鉴权/部署。否决，改为内嵌 LoopIQ 后端模块。

## 3. 组件结构与请求生命周期

### 整体结构（LoopIQ 后端进程内）

```
LoopIQ Node 进程 (Hono, app.ts)
  app.route('/api/agent', agentRoute)
  [requireAuth 中间件]  cookie loopiq_sid → c.get('user')（既有，复用）
       │
  控制面（POST，秒回 202）
    POST /api/agent/conversations              建会话
    POST /api/agent/conversations/:id/prompt   发消息(streamingBehavior: steer|followUp)
    POST /api/agent/conversations/:id/steer    插话/打断
    POST /api/agent/conversations/:id/abort    中止当前 turn
    GET  /api/agent/conversations/:id/messages 冷恢复：拉全量历史
  事件面（长连接）
    GET  /api/agent/conversations/:id/events   SSE(streamSSE)，读 Last-Event-ID 重放
       │
  ConversationRegistry: Map<conversationId, LiveConversation>
       │  idle 淘汰 / 连接计数 / userId 归属校验
       ▼
  LiveConversation（一个会话一个，长活，不绑连接）
       • harness Agent       ← prompt/steer/abort/subscribe
       • harness Session      ← DB-backed 持久化 + 树/fork/compaction
       • ReplayableBuffer     ← 被 Agent.subscribe() 喂事件
       • bridge: agent 事件 → 落库 + append(seq) + 推订阅者
       • 安全阀：迭代上限 / 活跃数许可 / token 估算
       ▼
  ConversationStorage（实现 harness SessionStorage 11 方法）
       ▼
  getDb()  (LoopIQ better-sqlite3, WAL)  ← source of truth；进程重启从这恢复
  外部工具 API：搜索 / 网页抓取 / Drive（纯 I/O，AgentTool 薄包装，src/lib/tools/）
```

### 关键决定：控制面与事件面分离（两个独立请求）

落实「连接 ≠ 任务」，与 harness RPC 模式天然同构（RPC 里 `prompt` 立即返回 `{success:true}`，事件单独在 stdout 流）：

- `POST /prompt` 不返回流。把消息塞给 `agent.prompt()`，秒回 202，turn 在后台 `LiveConversation` 里跑。
- `GET /events` 是一条长活 SSE（Hono `streamSSE`），订阅整个会话所有 turn 的事件，与 prompt 是两个独立请求。
- 断线只断 `/events`，turn 照跑；重连重新 `GET /events` 带 `Last-Event-ID` 续上。`steer`/`abort` 是普通 POST，不依赖任何流是否在线。

### SSE 订阅粒度

每会话一条 `/events`（客户端形态为「同时只开一个会话」，正好契合）。

### 一个 prompt 的完整生命周期

```
客户端                  Hono            LiveConversation    harness Agent      DB(getDb)
  GET /events(SSE) ────►│ subscribe ───►│ buffer.subscribe │                 │
  长连接保持            │               │                  │                 │
  POST /prompt ────────►│ getOrCreate ─►│ agent.prompt() ─►│ (后台跑,立即返回)│
  ◄── 202 Accepted ─────│               │                  │                 │
  ◄═ id:1 text_delta ═══════════════════╪═══ message_update│                 │
  ◄═ id:2 text_delta ═══════════════════╪═══               │                 │
   ✗ 断网               │ /events close │   (turn 照跑)      │                 │
                    buffer 继续 append seq3,4（无人收，先存着）                 │
                                            message_end ────┼─ 落库 ──────────►│
  GET /events
   Last-Event-ID:2 ────►│ replayFrom(2)►│ 补发 seq3,4 ─────►│                 │
  ◄═ id:3,4 (补齐) ══════│               │                  │                 │
  ◄═ id:5 text_delta ═══════════════════╪═══ ...续上        │                 │
  POST /steer ─────────►│ ─────────────►│ agent.steer(msg) (下一 turn 边界注入)│
  POST /abort ─────────►│ ─────────────►│ agent.abort()                       │
```

### 进程重启 / 冷恢复

- 进程崩溃：内存里的 `LiveConversation` 和 `ReplayableBuffer` 全没，但 DB 是 source of truth，靠 systemd/PM2 拉起（与 LoopIQ 主进程同生命周期）。
- 客户端冷恢复（离线太久 / 会话已被 idle 淘汰 / seq 超出 buffer）：`GET /events` 的 `replayFrom` 发现 cursor 太老 → 返回 `reset` 信号 → 客户端改为 `GET /messages` 拉全量历史重新对齐，再重新订阅。

### ReplayableBuffer 详解

解决「连接断了但 agent 还在服务端跑，断线期间事件不能丢」。

- 一个带序号的环形缓冲区。`Agent` 每产生一个事件，打一个自增 `seq` 存进去，同时推给在线订阅者。
- 环形：只保留最近 N 条（如 10000），超出丢最老，防内存无限涨。
- 客户端记住最后 seq；重连带上来，`replayFrom(cursor)` 补发 seq 更大的事件。不丢、不重。
- **与 SSE 的关系**：SSE 协议原生提供这套机制——事件写 `id: <seq>`（Hono `streamSSE` 的 `await stream.writeSSE({ id, event, data })`），浏览器 `EventSource` 自动记住并在重连请求头带 `Last-Event-ID`，服务端读该头从其后续发。客户端侧三件事（记游标 / 重连 / 带游标）由浏览器全自动完成；agent 模块只需服务端这一半。
- **两条恢复路径**：热重连（seq 在 buffer 里）→ 增量补发；冷恢复（seq 太老 / 会话已淘汰）→ 降级到 `GET /messages` 拉全量历史。

## 4. 持久化与多租户

harness 的 `SessionStorage` 不是「一张消息表」，而是一棵 append-only 的会话树（支持 fork/branch/compaction）。落在 LoopIQ 的 `getDb()` 上，作为新 migration `version: 2`。

### 数据模型（两张表起步，名字避开既有 sessions）

```
conversations                         conversation_entries (append-only)
  id          PK   (ulid)               conversation_id FK ─┐ 复合主键
  user_id     IDX  ← 多租户隔离          id          ───────┘ (conversation_id, id)
                   REFERENCES users(id)  seq         ← 每会话自增, 排序/锚点
  name                                  parent_id   ← 树指针, getPathToRoot 靠它
  leaf_id     ← 当前活跃叶子(可空)        type        IDX(conversation_id,type)←findEntries
  model_json  ← 当前模型/thinking         created_at
  created_at  (INTEGER ms, 同 LoopIQ)    payload_json ← 整条 entry 序列化
  updated_at                            INDEX(conversation_id, parent_id)
```

- 与 LoopIQ 既有表风格一致：TEXT PK（ulid）、`user_id` 外键 `REFERENCES users(id) ON DELETE CASCADE`、时间戳用 `INTEGER`（毫秒，`Date.now()`）。
- entry 用 JSON blob 存：entry 是多态的（message / tool_result / compaction / model_change / label / branch_summary…），列无法穷举。append-only + JSON 最自然，也避免 schema 随 harness 演进而改。
- 写极简：只有「append 一条 entry」和「更新 leaf_id 指针」两种写，无行更新，并发友好。

### harness 11 个接口方法 → SQL 映射

| 方法 | 实现 |
|---|---|
| `appendEntry` | INSERT 一行（同时进内存缓存） |
| `getPathToRoot(leafId)` | 从 leafId 沿 parent_id 上溯到根 |
| `getEntries` | SELECT * WHERE conversation_id ORDER BY seq |
| `findEntries(type)` | SELECT WHERE conversation_id AND type=? |
| `getEntry(id)` | 主键查 |
| `getLeafId` / `setLeafId` | 读写 conversations.leaf_id |
| `createEntryId` | `newId()`（LoopIQ ulid） |
| `getLabel(id)` | 查最新 type='label' 且 targetId=id 的 entry |
| `getMetadata` | 读 conversations 行 |

### 热缓存合并进 Storage 实例生命周期

`ConversationStorage` 实例绑定单个会话，内部持有该会话的 entries 内存数组（草案里单独的 `historyCache` 因此消失）：

- 会话首次打开（冷）：从 DB 一次性 load 全部 entries 进内存数组。
- `appendEntry`：同时写 DB + push 内存数组。
- 所有读（`getPathToRoot`/`getEntries`/`findEntries`）：直接走内存数组，零 DB 往返。配一个 `Map<id, entry>` 索引加速上溯。
- 会话被 `ConversationRegistry` idle 淘汰：连同 storage 实例和内存数组一起释放；下次访问重新冷 load。

「DB 是 source of truth + 内存热缓存」这条性质不用额外写缓存逻辑，它就是 storage 实例的生命周期。

### 持久化 vs 重放（两个层次，勿混淆）

| | 存什么 | 存哪 | 用途 |
|---|---|---|---|
| ConversationStorage | 最终态 entry（完整 message、tool 结果） | DB(getDb) + storage 内存数组 | source of truth、冷恢复、历史查询 |
| ReplayableBuffer | 流式细粒度事件（每个 text_delta、tool_update） | 仅 LiveConversation 内存（环形） | 秒级热重连补发 |

落库时机：订阅 `Agent` 的 `message_end`（一条消息完成）才 `appendEntry` 落库；`message_update`（token 级）只进 ReplayableBuffer，不落库。

### 多租户边界（复用 LoopIQ 鉴权）

- 鉴权中间件：直接复用 `requireAuth`（cookie `loopiq_sid` → `c.get('user')`），agent 模块**不造任何用户/登录体系**。
- userId 取值：`const userId = c.get('user')!.id`。
- 归属校验：所有 `/conversations/:id/*` 端点先查 `conversations.user_id == userId`，否则返回 404（不是 403，避免泄露会话存在性）。
- `ConversationRegistry.getOrCreate(conversationId, userId)`：内存命中也要再校验 userId 归属，防止越权命中别人挂在内存里的活会话。

### 性能特征（JSON blob 方案）

- 热路径（稳态推理）：不碰 DB，全走 storage 内存数组，微秒级。JSON blob 不参与（entry 早已是对象）。
- 写路径（`appendEntry`）：只在 `message_end` 落库，非每 token。append-only 无锁；SQLite WAL（LoopIQ 已开 `journal_mode=WAL`）下瓶颈在 fsync（1–5ms/次，SSD）。稳态几百写/秒量级。
- 冷加载：`SELECT ... ORDER BY seq`（索引命中，ms 级）+ N 次 `JSON.parse`。长会话（N=上千、每条几 KB）总 parse 可能几十 ms，是同步阻塞事件循环的点，需关注（见 backlog）。
- 大附件是真实 CPU 风险：附件内容不进 entry JSON blob，单独存（DB blob 列或对象存储），entry 只存引用 + 元数据，保证 entry blob 恒小。
- JSON blob vs 拆列：访问模式是「按会话加载整棵树」，非「跨会话查字段」，拆列的内容查询优势用不上。全局搜消息内容应挂独立搜索索引，不让主存储扛。

## 5. 错误处理、并发安全阀、生命周期

### A. 安全阀（harness 没有，必须 agent 模块补）

| 阀门 | 问题 | 对策 |
|---|---|---|
| 迭代上限 | harness loop 是 `while(true)`，无内建硬上限，工具反复调用可能无限循环烧钱 | `Agent` 的 `shouldStopAfterTurn` 钩子里数 turn，超 `MAX_TURNS`（默认 50，可配）→ 优雅停 + 推 `limit_reached` 事件 |
| 并发活跃数 | 单进程同时活跃生成 >~200–500 会拖慢所有流 | `Semaphore(maxActive)`（默认 200，可配），`agent.prompt()` 前 acquire，turn 结束 release；满了新 prompt 排队或返回 429 |
| token 计数成本 | `calculateContextTokens` 真分词是 CPU 活 | 自动 compaction 触发判断走 `estimateTokens`（字符估算）；真分词只在必要时且限频 |
| 单会话串行 | 同会话并发两个 prompt 会撞 harness 的 `activeRun` | Registry 层每会话一把逻辑锁：活跃时再来 prompt → 按 `streamingBehavior` 转成 steer/followUp，而非并发调用 |

### B. 错误分层处理

harness 约定「错误不抛、编码进流」（assistant message 带 `stopReason: "error"/"aborted"` + `errorMessage`）。利用这点分三层：

1. Provider/模型错误（限流、超时、5xx）：harness 内部已重试；最终失败 → 落一条 error message + 推 `turn_error` 事件，会话存活，用户可重试。
2. 工具错误（搜索 API 挂、Drive 401）：单个工具失败不中断整批（harness 已保证），错误结果回灌模型让它应对；OAuth 过期 → 工具层捕获 → 推 `tool_auth_required` 事件提示重新授权。
3. 进程级：`process.on('unhandledRejection')` / `uncaughtException` 兜底（注意 LoopIQ 是单进程同时承载鉴权等其它路由，兜底处理不能因 agent 的单个 reject 杀掉整进程）；每个 turn 已在 harness `runWithLifecycle` 的 try/catch 里，agent 模块再加一道进程级网。

### C. SSE 连接的背压与清理

| 风险 | 对策 |
|---|---|
| 慢客户端导致事件堆积 | SSE 写入检测 backpressure（Hono `streamSSE` 的 write 返回 Promise，await 它形成天然背压）；缓冲超阈值 → 丢最老 delta 或断开该订阅（turn 不受影响） |
| ReplayableBuffer 内存涨 | 环形上限（如 10000 事件/会话），超出靠冷恢复兜底 |
| 死连接不清理 | SSE 心跳（定期 `:ping` 注释行 / `stream.writeSSE` keepalive）；检测断开（`stream.onAbort`）→ `disconnect()` 减连接计数（不碰 turn） |

### D. 生命周期：idle 淘汰与优雅停机

idle 淘汰：
```
每分钟扫描：activeConnections==0 && now-lastActivity>IDLE_MS && !agent.isStreaming
→ 淘汰：释放 LiveConversation + storage 内存数组 + ReplayableBuffer
```
关键修正：淘汰条件必须加 `!agent.isStreaming`——绝不淘汰正在跑 turn 的会话（哪怕没连接）。「没连接 ≠ 可回收，正在跑就得留着」。

优雅停机（SIGTERM，与 LoopIQ 主进程一致）：
```
1. 停止 accept 新 HTTP 连接
2. 停止 ConversationRegistry 接受新会话
3. 等所有活跃 turn 跑完：Promise.allSettled(每个 agent.waitForIdle())，带超时（如 30s）
4. 超时未完成的 → agent.abort() 强停，错误态已落库可恢复
5. （DB 由 LoopIQ 主进程统一 closeDb()，agent 模块只需确保落库完成）
```

### E. 明确的非目标（YAGNI）

- 不做 worker_threads：工具全是外部 I/O API，无本地 CPU 密集活。唯一 CPU 隐患（大附件序列化、文档解析）用「外置到 API/微服务边界」解决。worker_threads 留作最后手段，不进 MVP。
- 不做跨进程 / Redis 亲和路由：单机 in-process，YAGNI。
- 不另造鉴权/用户体系：复用 LoopIQ `requireAuth`。

### F. 文档/网页解析的 CPU 处置

工具的 CPU 风险真实存在，且就在「解析下载回来的文档/网页」这一步（PDF/DOCX/XLSX 解析、HTML→正文提取、大 JSON 序列化）。正确解法不是 worker，而是把解析也推到 API/微服务边界，让主进程恒为纯 I/O：

1. 主进程的工具一律是 I/O 薄包装，禁止在工具里同步解析大文档（写成约束）。
2. 网页查询优先用返回结构化结果（正文/markdown）的检索/抽取 API，而非自己抓 HTML 再本地 readability。
3. Drive 文件读取优先用云端原生导出（如 Google Drive 导出纯文本），让云端解析，service 只接收文本。
4. 设输入体量阈值：工具返回内容超过 N（如 1MB）→ 不在事件循环里 `JSON.parse`/转换，走外置处理或截断。
5. 预留外部文档抽取服务接口（`POST /extract`）；MVP 先只支持云端原生导出 + 大小限制，真本地解析以后接微服务。

## 6. 容量评估

瓶颈不是「连接数」也不是「用户数」，而是「同一瞬间正在流式生成的 turn 数」。注意 agent 与 LoopIQ 其它路由（鉴权等）共享同一进程的事件循环，但那些是短平快请求，稳态压力仍由 agent 活跃流主导。

- 连接层：单进程挂几千上万条空闲 SSE 连接无压力，轻松上万。
- 并发活跃生成数（真瓶颈）：每条活跃流约每秒 50–100 chunk，每 chunk 一次小 JSON 解析。安全水位约 200–500 条并发活跃生成，超过后 token 间延迟被事件循环排队拖慢。
- 内存：内存只由活跃会话决定（idle 会话淘汰回 DB）。4–8GB 进程，活跃会话挂几百到一两千没问题。

换算成在线用户（取决于占空比 = 用户平均多大比例时间在真生成）：

| 场景 | 占空比 | 单进程并发用户 |
|---|---|---|
| 轻量对话 | ~10% | 200 活跃 ÷ 0.1 ≈ 2000+ 在线 |
| 编码/任务 | ~50–80% | 200 活跃 ÷ 0.7 ≈ 300–500 在线 |

必须盯住的主进程 CPU 隐患：① token 计数走廉价估算，真分词/大上下文 compaction 限频或外包；② 大消息/附件序列化外置。盯住这两点，上述数字才成立。

扩展路径：编码会话多到单进程活跃数顶到 ~300，兑现「预留扩展」——同一份代码起 N 个进程，前面摆按 conversationId 哈希的网关。因状态走 DB、会话不绑进程、事件可重放，加进程几乎零改动。

## 7. 测试策略

核心 agent loop 不归 agent 模块测（harness 自带测试）。只测自建的边界层。沿用 LoopIQ 的 Vitest。

| 层 | 怎么测 | 要点 |
|---|---|---|
| `ConversationStorage` | 单元测试，对照 harness `InMemorySessionStorage` 做等价测试 | 同样的 append/fork/getPathToRoot 序列，两实现结果必须一致——正确性硬保证 |
| `ReplayableBuffer` | 单元测试 | append→seq 递增、环形淘汰、replayFrom 边界（cursor=0 / 中间 / 超出触发 reset） |
| `ConversationRegistry` | 单元测试 | idle 淘汰必须 `!isStreaming`、userId 归属校验、并发 getOrCreate 不重复建 |
| 安全阀 | 单元测试 | MAX_TURNS 触发停止、Semaphore 满返回 429、单会话串行转 steer |
| `Agent` 集成 | fake streamFn（不烧 token） | prompt→事件→落库全链路；steer/abort 时序 |
| HTTP/SSE 端到端 | 起 Hono app（`app.fetch`）+ fake provider | 断线重连带 Last-Event-ID 补发、冷恢复 reset、`requireAuth` 401/归属 404 |

原则：MVP 每写一个自建组件就配单元测试（TDD），HTTP 层用 fake provider 做集成，绝不接真 LLM 进 CI。

## 8. 目录结构（落在 LoopIQ `backend/src/`）

```
backend/src/
  app.ts                         # 既有：加一行 app.route('/api/agent', agentRoute)
  db/
    migrations.ts                # 既有：追加 version:2（conversations + conversation_entries）
  modules/
    agent/
      agent.route.ts             # Hono 路由：控制面 POST + 事件面 SSE，挂 requireAuth
      agent.service.ts           # 装配 registry / 跑 harness 的服务层入口
      agent.schema.ts            # zod：prompt/steer body 校验（zValidator）
      conversation.ts            # LiveConversation：包 harness Agent + Session + bridge + 安全阀
      conversation.registry.ts   # Map<id,LiveConversation> + idle 淘汰 + 归属校验
      conversation.storage.ts    # ConversationStorage：实现 harness SessionStorage 11 方法（用 getDb）
      conversation.repo.ts       # conversations/conversation_entries 的 SQL（仿 session.repo.ts 风格）
      replayable-buffer.ts       # 环形事件缓冲 + replayFrom
      sse.ts                     # streamSSE 封装 + 背压 + 心跳
      safety/
        semaphore.ts             # 并发活跃数许可
        limits.ts                # MAX_TURNS via shouldStopAfterTurn
      config.ts                  # MAX_TURNS / maxActive / IDLE_MS 等（或并入 env.ts）
  lib/
    tools/
      registry.ts                # AgentTool 集合装配
      search.ts / web.ts / drive.ts / onedrive.ts   # I/O 薄包装
      oauth.ts                   # 工具的第三方 OAuth 凭证管理
      extract.ts                 # 预留：外部文档抽取服务接口
```

> 进程级兜底（unhandledRejection/uncaughtException）加在 LoopIQ 既有 `index.ts`，不新开入口文件。

## 9. 实施路径（每步可独立验证，TDD）

注：Phase 顺序按用户偏好将「多租户 + 真 LLM」提到「韧性」之前——先有价值，再求健壮。steer/abort 因不依赖 ReplayableBuffer，随真 LLM 一起进 Phase 1，便于测「长 turn 中途打断」。多租户在 LoopIQ 是「挂上既有 `requireAuth`」而非从零建，成本低。

### Phase 0 — 骨架贯通
1. 装依赖 `@earendil-works/pi-agent-core` / `pi-ai`；migrations 加 version:2 + `conversation.repo.ts`
2. `ConversationStorage` + 对照 InMemory 的等价测试
3. `LiveConversation` 最小版：包 `Agent` + `Session`，`prompt()` 跑通，订阅事件落库
4. `agent.route.ts` + `POST /prompt` + `GET /events`(streamSSE)，挂进 `app.route('/api/agent', …)`，fake provider 跑通「发消息→流式回」

里程碑：curl（带登录 cookie）发 prompt，SSE 看到流式 token，DB 看到落库。不接真工具、不接真 LLM。

### Phase 1 — 多租户 + 真 LLM
5. 路由挂 `requireAuth` + `conversations.user_id` 归属校验（命中内存也校验）
6. 接真 provider（`streamSimple` 配真 key）+ 安全阀（MAX_TURNS / Semaphore / token 估算）
7. `steer`/`abort` 端点 + 单会话串行锁

里程碑：多用户隔离（复用 LoopIQ 登录），真模型流式，限流生效，长 turn 中途可 steer/abort。

### Phase 2 — 韧性（断线/排队）
8. `ReplayableBuffer` + Last-Event-ID 重放 + 冷恢复 reset
9. `ConversationRegistry` idle 淘汰（`!isStreaming`）+ 重连命中活会话

里程碑：跑到一半断 SSE，重连无缝续上。

### Phase 3 — 工具
10. `lib/tools/` 薄包装：先搜索 + 网页查询，再 Drive/OneDrive + OAuth
11. 工具错误处理 + `tool_auth_required` 事件 + 附件外置 + 大小阈值

里程碑：agent 真能查搜索 / 读 Drive 文件。

### Phase 4 — 上线硬化
12. 优雅停机 drain + process-guard（加进既有 index.ts）+ SSE 心跳/背压
13. 部署（systemd/PM2）、可观测（活跃数 / turn 时长 / 落库延迟指标，复用 LoopIQ pino logger）

## 10. 已识别但暂不实现（backlog）

这些是规模拐点风险，当前不实现，但记录在案，触达对应信号时再落地：

| 拐点信号 | 现象 | 动作 |
|---|---|---|
| 稳态写 QPS 持续上千 | SQLite 单写者串行化成瓶颈 | 迁移 Postgres（即「MVP SQLite → PG」触发信号） |
| 单会话 entry 数上万 | 冷加载 `JSON.parse` 阻塞事件循环明显 | 冷加载只 `getPathToRoot` 取当前分支路径而非全量 entries（全量只在导出/树视图用）；必要时分批 parse 让出事件循环 |
| 大附件频繁 | 序列化阻塞 | 附件外置到对象存储，entry 只存引用 |
| 单进程活跃数顶到 ~300（编码场景） | token 流变卡 | 多进程 + 按 conversationId 哈希网关水平扩展（状态已走 DB、会话不绑进程、事件可重放，近零改动） |
| 确有「必须本地、又重」的解析且不愿起微服务 | 解析阻塞事件循环 | 开 worker_threads 通道（最后手段） |
| agent 活跃流挤占同进程其它路由（鉴权等）的事件循环 | 登录等短请求延迟上升 | 把 agent 拆成独立进程/服务（状态已走 DB，与上面的水平扩展同机制） |
