# 子 Agent 后台结果交付

## 产品规则与所有者

- 子 Agent 完成后，父 runtime 的现有命令队列是后台结果的唯一当前进程交付入口；`RuntimeTaskRegistry.notified` 只记录交付认领，不是另一条消息队列。
- 只有父 runtime 完成持久 admission 并接受通知命令后，子 Agent 才能设置 `notified=true`。父 runtime 正在关闭或通知属于旧分支时，入队接口返回拒绝，子 Agent 不得把丢弃误记为成功。既有任务终态、父事件和输出文件仍按原路径保存。
- 入队接口异步返回布尔结果，调用方必须等待该结果；相同 taskId 的并发完成回调共用进行中的 admission。

```text
子 Agent 终态 → 读取任务 notified → 父 runtime 持久 admission → 入队判断
                                     ├─ accepted → notified=true
                                     └─ dropped  → 保持 notified=false，记录原因
```

## 失败与验收

- 父 runtime 关闭、旧分支或入队抛错时，通知不被认领；正常入队后仅认领一次。
- 测试覆盖三种入队结果和重复回调，确认 `notified` 与真实入队事实一致。
- 进程崩溃后通过 admitted 账本重建当前分支待消费通知；任务认领与最终 assistant 回答的跨进程幂等仍需单独验收。

## 跨进程持久交付目标

- `session_input` 是通知待交付状态的唯一 durable owner；内存命令队列只是当前进程的投递视图，`RuntimeTaskRegistry.notified` 只是当前任务生命周期内的重复回调护栏。通知正文、来源、taskId、所属 `branchGeneration` 和稳定 requestId 必须在入队前写入同一条 `session_input` 记录。账本写入失败时不得返回 accepted，也不得置 `notified=true`。
- 带稳定 requestId 的子 Agent 通知只有在 Store 同时提供入账、按 ID 回读及原子批量 promotion 时才能返回 accepted；缺少任一能力不得先入账或入队。这避免把已写入通知交给无法原子结算的旧 Host。
- 持久化会话中的其它后台通知也遵守同一要求：只要 runtime 接有 Session Store，就不得因缺少原子批量 promotion 而走「先写消息、后补账本」旧路径。无 Store 的临时 runtime 仍按内存投递语义运行，不声称跨崩溃保证。
- 子 Agent 同一生命周期的完成回调共享一个 requestId；重臂后的新生命周期必须获得新 requestId。`session_input.id` 负责跨进程幂等，重复 admission 不得把已 promoted 的记录恢复为 admitted。旧 Host 没有 durable admission 能力时不得谎称持久交付。
- Core 的 `RuntimeTaskRegistry.register` 为每次新注册的本地子 Agent 生命周期分配 requestId，状态更新保留该 ID；失败后恢复旧 snapshot 也保留旧 ID。父 runtime 使用传入的 ID 建账本及命令，不能在每次重试时另生成一个。
- 同一 requestId 已处于 promoted、discarded 等终态时重试不得再次入队，也不得覆写终态账本载荷；已在当前内存队列时重试只返回已接受，不增加第二条命令。
- requestId 不能使用进程内递增序号；CLI 重启后新通知不得与尚在账本中的旧 ID 碰撞。所有 RuntimeCommandId 改用跨进程唯一 ID，恢复命令保留账本原 ID。
- 恢复时按 `admittedSequence` 重建同分支且载荷完整的后台通知命令，不重新生成 requestId、不再次写入账本。旧格式缺少分支代或载荷不完整、以及属于旧分支的通知应明确置 `discarded` 并记录原因。用户文字引导仍按原有 held 语义恢复。
- 同一进程重复触发恢复时，已在内存命令队列中的 requestId 不得再次入队；内存去重仅阻止重复投递，不代替账本状态。
- 消费一批通知时，合成的 user message、part 与该批所有 requestId 的 promoted 状态必须由 Session Store 在单个事务中提交。崩溃发生在事务前则重放整批，事务后则不重放；不能留下已经进入 transcript 但账本仍为 admitted 的半交付状态。批量输入可以共用一个 messageId，不能用单条代表任务冒充整批来源。
- `TaskOutput` 已同步消费结果时，必须按同一 requestId 将待交付通知收口，避免恢复后又主动发送模型消息；分支切换和关闭需沿既有 owner/lease 与 stale run 护栏执行。
- `TaskOutput` 完成投影并确认未取消后先将该 requestId 的 admitted 账本结算为 discarded，再将 registry 标为 notified。通知批次消费前逐条读取账本，仅允许仍为 admitted 的命令进入合成消息；已结算项从批次排除。若任务结果与批次并发竞争，SQLite 的单条结算和批量 promotion 事务决定赢家，不能用内存 `notified` 推断 durable 状态。
- `TaskOutput` 投影期间任务可能重臂；对旧生命周期的结果读取不得把新生命周期的 registry 条目标成 notified。更新时同时比对 requestId。
- 活动模型轮吸收 `next` 通知时，必须在从内存队列移除前读取 durable 账本。只有仍为 `admitted` 的通知可 promotion；`TaskOutput` 已结算的通知只移除，不产生模型输入。账本读取失败时保留该通知及后续命令，等待重试或重启恢复，不能因读失败丢失内存投递。

```text
子 Agent 终态 + 生命周期 requestId
  → 父 Core 校验 shutdown / branchGeneration
  → Session Store 持久 admission
  → 当前进程命令队列入队 → registry.notified=true
  → 消费时 Session Store 原子提交 message + parts + 全批 promoted

重启 → 读 admitted 账本 → 同分支重建内存命令队列 → 同一消费事务
```

验收必须覆盖：admission 写入失败、写入后入队前崩溃、事务前崩溃、事务后崩溃、同一 requestId 重试、重臂新生命周期、旧分支通知与 `TaskOutput` 已消费结果。当前实现尚未达到这些条件，不能把 `notified=true` 当作跨进程交付证明。

阶段进展：本地 SQLite Store 已支持把一批通知的合成 message、part 和全部 `session_input` promoted 状态放在一个事务提交；运行时在该能力可用时使用它，并在事务成功后才更新内存 `messageHistory`。入队前等待持久 admission，恢复路径按分支重建 admitted 后台通知。`TaskOutput` 在异步 admission 期间或通知排队后认领结果时，将该通知结算为 discarded；批次出队检查账本状态，避免再次启动模型轮。子 Agent 生命周期现在持有稳定 requestId，重臂生成新 ID；终态账本拒绝重试覆写。跨进程恢复覆盖了数据库重开，但最终 assistant 回答幂等仍待完成，**不能**声称已实现跨崩溃恰好一次报告。

## 最终回复的跨崩溃边界（待实现）

当前 `promoted` 仅证明后台结果已原子写入合成 user message，不证明相应 assistant 回复完成。模型请求前会先创建未完成的 assistant message；崩溃可能发生在 promotion 之后、创建 assistant 之前、流式输出途中，或最终回复落盘之后。恢复逻辑只扫描 `admitted`，因此前三个窗口可能永远没有最终回复。不能通过把 `promoted` 重新改为 `admitted` 修复，这会重复合成输入并可能重复工具副作用。

目标状态需要以合成 message ID 为因果锚点区分「已提交输入、回复待完成」与「回复已完成」。恢复时先读取同一会话和当前分支的合成消息、子 assistant 及完成状态；已完成的回复绝不再次启动模型，未完成的回复须有明确的继续或中断后重试策略，并处理此前持久化的流式 part 与工具副作用。最终答复的完成标记和会话投影必须在持久边界一致；仅靠内存 `notified`、`TurnCompleted` 事件或启动时扫描 `admitted` 不足以证明恰好一次。

验收需分别在以下四个持久断点杀进程并重启同一 SQLite 会话：promotion 前、promotion 后但 assistant 未创建、assistant 部分输出后、最终 assistant 持久完成后。逐点检查 transcript 中仅有一份后台输入、可见最终答复至多一份且不会遗漏；若已有工具调用，还须验证副作用不会因恢复重复执行。

第一阶段恢复只处理可严格证明尚未启动模型的窗口：当前分支的 `promoted` 后台通知有合成 user message，且该消息没有任何子 assistant。恢复命令复用既有合成消息 ID 与正文，跳过重复输入持久化，走同一 Core 执行队列；重复 resume 不再入队第二条，分支改变则丢弃。若已有子 assistant（包含未完成消息），不能据此断言工具尚未执行，暂不自动重跑，等待后续幂等恢复方案。
2026-10-10 边界审查：子 assistant 已创建但尚无 part，也**不能**据此自动重跑。本地流式工具会先持久化 pending tool part，但模型适配层另有 `providerExecuted` 工具调用，可在提供商侧执行而不经过本地 tool part。恢复路径无法仅凭空 assistant 证明没有外部副作用。后续必须在模型请求前持久记录该请求的工具执行能力，并对提供商侧执行取得可回查的幂等结果或明确禁止此类请求自动重试；完成此证据链前继续保持“有任何子 assistant 就不自动重跑”的护栏。
多条通知在同一批 promotion 中共用一条合成消息时，恢复按 `promotedMessageID` 分组，只续这一条完整合成正文的模型轮；不得按每个 requestId 各启动一个回复。
持久化验收要关闭并重开同一 SQLite 文件，确认 `promoted` 账本、合成 user 正文及缺失的子 assistant 可从磁盘重新读取；仅在内存伪造这些记录不能证明崩溃断点可恢复。
2026-10-10 在本机用独立 Node 子进程提交两条通知的原子 promotion 后立即 `SIGKILL`，父进程重开 SQLite 文件，确认两条账本均为 promoted、只有一条合成 user 消息且没有 assistant。该断点证明 promotion 提交后可从磁盘恢复；不覆盖模型已产生部分 assistant 或工具副作用的窗口。
2026-10-10 另用独立 Node 子进程将合成 user、promoted 账本及已完成 assistant 回复持久化后立即 `SIGKILL`；重开 SQLite 确认三者仍在且各只有一份。Core 现有恢复测试在发现任何子 assistant 时不会重复入队。两项证据覆盖持久最终回复的存活和内存恢复判定，尚未构成同一打包 Host 的完整重启端到端证明，也不覆盖流式中断与工具副作用幂等。

```text
SQLite session_input(promoted) + 合成 user message
  → Core 恢复：校验当前分支、按 promotedMessageID 分组
  → 查询该 user 的子 assistant
      ├─ 无子 assistant → 同一 window-scoped Host 的 Core 命令队列续模型轮
      │                  → 复用 user message ID，跳过重复输入持久化
      └─ 已有子 assistant → 不自动重跑，保留待后续幂等恢复处理
  → 出队前再次校验 branchGeneration；旧分支命令丢弃
```
