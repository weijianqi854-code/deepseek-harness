# Spec Engine 架构

版本 v0.1.3。本文定义数据模型、阶段机、对齐协议与上游扩展点映射。凡本文未定义的字段，一律不进入 `state.json`。

---

## 0. 决策记录

| 编号 | 决策 | 理由 |
|---|---|---|
| D-01 | 阶段 2 对齐以 **round-trip 校验** 为主轴，假设清单作兜底 | 假设清单能捕获「我默认了什么」，但捕不到「我漏了什么」；漏项是返工的主因 |
| D-02 | 六阶段以 **声明式 preset + 插件** 实现，不改 `packages/core` 与 `agent-loop` | 上游规则 `Plugins, not loop changes`；保住「上游可同步」这个前提 |
| D-03 | 结构化状态（JSON）是唯一权威，Markdown 是渲染结果 | 门禁必须可机器判定，人读格式不能当真相 |
| D-04 | 反向还原阶段必须使用**独立上下文** | 同一上下文里做反推是同义反复，校验不成立 |
| D-05 | 本层包命名空间为 **`@spec-engine/*`**，不混用 `@deepseek-ai/*` | fork 内混用上游命名空间，会分不清哪行代码属于谁；独立命名空间也便于将来独立发布 |
| D-06 | 门禁纯函数只接**解析后的事实**，不读文件、不调模型 | 文件读取、解析与 `evidence_verified` / `user_confirmed` 的背书归 contract-tools；纯核零依赖、可穷举测试；G2 的 verdict/blocking 自检只有在纯函数里才可能成立 |
| D-07 | 阶段进度的展示形态为**生长树**：门禁通过即完成一段生长，从发芽到大树；数据源就是 `state.json` 的 append-only history（v1 原型：`spec-engine/viz/tree.html`） | 用户 Web UI 上手后的产品形态反馈；可视化不引入第二个真相源——history 本就逐行记录每次进出与回退，天然可回放成「生长」叙事；回退＝年轮保留，中止＝休眠可恢复，语义与状态机逐点对齐 |
| D-08 | G2/G4 的「用户显式确认」**复用上游审批打断**：审批通过即持久化为 `user_confirmed` 事件 | 用户已确认审批弹窗的打断方式可接受（Web UI 上手反馈）；不另造确认通道，交互成本最低；审批事件留痕，满足「持久化事件，不是模型自述」的检查要求 |

---

## 1. 目标与非目标

**目标**：把一句模糊需求，逐步固化为一份可验收的规格，再固化为一个可运行的产物；每一步的退出都由可检查的条件判定。

**非目标**：
- 不做通用编程助手（那是上游 standard preset 的职责）。
- 不做模型能力改进（提示词优化、权重训练不在本层）。
- 不做评测平台本身，只定义本层的验收指标。

---

## 2. 状态模型

### 2.1 会话工作区布局

```
<workspace>/.spec-engine/
  state.json            # 状态机当前状态，唯一权威
  slots.json            # 阶段1
  requirements.json     # 阶段2 原子需求（权威）
  assumptions.json      # 阶段2 假设清单
  spec.md               # 由上面两个渲染，供人读
  roundtrip.json        # 阶段2 校验结果
  plan.md               # 阶段3 方案
  prototype/            # 阶段4 原型（可抛弃）
  usage.md              # 阶段4 使用剧本 + 「不做」清单
  tests/ | rubric.json  # 阶段5
  checkpoints/          # 每阶段出口的结构化检查点，永不压缩
  debug-log.md          # 阶段6
```

### 2.2 `state.json`

```json
{
  "version": 1,
  "stage": "elicit",
  "history": [
    { "stage": "elicit", "entered_at": "ISO8601", "exited_at": "ISO8601", "gate_pass": true }
  ],
  "open_questions": ["待定项，跨阶段保留"],
  "checkpoint_seq": 0
}
```

`stage` 取值：`elicit | align | analyze | embody | test | build | done | aborted`。
该字段**只能由 stage-machine 服务写入**，模型无写权限。`gate_pass` 为 true 表示经门禁退出，false 表示经回退或中止退出，null 表示该行仍活跃。

### 2.3 `slots.json`

每个槽位是一个对象，不允许裸值：

```json
{
  "goal": { "value": "...", "source": "user", "rework_cost": "high", "filled": true },
  "audience": { "value": "...", "source": "default", "rework_cost": "low", "filled": true, "disclosed": true },
  "success_criteria": [ { "value": "...", "source": "user", "rework_cost": "high" } ],
  "boundaries": [ { "value": "不做 X", "source": "user", "rework_cost": "high" } ],
  "resources": [],
  "constraints": [ { "kind": "time", "value": "...", "rework_cost": "high" } ],
  "aesthetic": { "value": "...", "source": "default", "rework_cost": "low" }
}
```

`source` 取 `user | default | inferred`。`rework_cost` 取 `high | low`，决定该槽位是否阻塞门禁。`disclosed` 为 true 表示该默认值已一次性告知用户，G1 对所有 `default` 来源的槽位检查此位。

### 2.4 `requirements.json`

```json
{
  "id": "R-01",
  "statement": "规格化后的陈述",
  "source_quote": "用户原话逐字片段",
  "kind": "functional | constraint | quality | negative",
  "acceptance": "可判定的验收谓词",
  "status": "active | dropped",
  "dropped_reason": null
}
```

`source_quote` 必须是用户原话的逐字片段，不得改写、不得翻译、不得概括。
这是一条**不可协商的约束**：整条链路的失真里，改写造成的漂移最难自查。

### 2.5 `assumptions.json`

```json
{
  "id": "A-01",
  "claim": "我默认了 Web 端，不是小程序",
  "confidence": "high | medium | low",
  "falsifier": "哪一条证据会推翻它",
  "status": "open | verified | refuted"
}
```

无 `falsifier` 的假设不允许存在。没有反证条件的假设等于免责声明，不是工程契约。

---

## 3. 阶段机与门禁

### 3.1 转移表

| 当前 | 目标 | 门禁 |
|---|---|---|
| elicit | align | G1 |
| align | analyze | G2 |
| analyze | embody | G3 |
| embody | test | G4 |
| test | build | G5 |
| build | done | G6 |

任意阶段可回退到前序阶段；回退时写 `history`，不删旧检查点。任意阶段可由用户中止（`aborted`），中止后仍可回退恢复。终态（`done` / `aborted`）不可 advance。

### 3.2 门禁定义

| 门禁 | 判定（全部为机器可检查） |
|---|---|
| G1 | `slots` 中所有 `rework_cost=high` 的槽位 `filled=true`；每个 `default` 来源的槽位 `disclosed=true` |
| G2 | `roundtrip.verdict == pass` 且 `blocking == 0`；每条非阻塞漂移已有用户裁决；`verdict`/`blocking` 与漂移清单一致（自检）；用户显式确认事件存在 |
| G3 | `plan.md` 含 ≥2 个备选；每个备选有 `evidence` 字段，指向真实存在的文件路径或已记录的工具调用 |
| G4 | `prototype/` 非空；`usage.md` 的「不做」清单非空；用户显式确认事件存在 |
| G5 | 可判定任务：测试文件存在且最近一次运行全绿；需判断任务：`rubric.json` ≥3 条且引用金标准样例，`held_out=true` |
| G6 | 所有计划项关闭；回归无退化 |

「用户显式确认」是一个持久化事件，不是模型自述，所以仍属可检查范围；实现上复用上游审批打断，审批通过即持久化为 `user_confirmed`（D-08）。

### 3.3 执行机制

- gate 是**纯函数**：`evaluate(stage, artifacts) -> { pass, reasons[] }`，不调模型。
- 工具 `stage.advance` 在调用时先跑 gate；不通过则返回结构化拒绝，附缺失项清单。模型拿不到「假成功」。
- 额外挂 `agent/pre-step`：当 `stage` 未通过而模型试图执行下一阶段的动作时，注入阻断或纠正，而不是让它裸跑。
- 门禁只吃事实，不吃文件（D-06）：文件读取、解析、`evidence_verified` / `user_confirmed` 的背书全部由 contract-tools 完成，纯核因此零依赖、可穷举测试。

这四条合起来才是「模型只能提议」。只靠提示词约束，阶段必然会漂。

---

## 4. Round-trip 对齐协议

### 4.1 三轮

```
T1 正向编译   原话 + slots  ──▶  requirements.json
T2 反向还原   requirements.json ──▶ restatement.md   （独立上下文，屏蔽原话与 slots）
T3 比对判定   restatement vs 原话 ──▶ roundtrip.json
```

T2 的隔离是协议的一部分，不是优化项。同一上下文里做反推只会复述自己刚写的东西。

### 4.2 漂移分类

| 类别 | 含义 | 是否阻塞 |
|---|---|---|
| `missing` | 原话中有可判定的主张，需求里没有 | 恒阻塞 |
| `hallucinated` | 需求里有原话没有的约束 | 恒阻塞 |
| `negation` | 否定词、范围词被吞（「不要」「只」「除……以外」） | 恒阻塞 |
| `quantified` | 量级漂移（「尽快」→「24 小时内」，「一些」→「5 个」） | 待用户裁决 |
| `term` | 术语替换（用户说「客户」，规格写「用户」） | 待用户裁决 |
| `implicit` | 隐含前提被外推（未说平台，规格假定 Web） | 待用户裁决 |

前三类恒阻塞，是这套协议真正的价值所在：它们恰好是模型最容易犯、人最不容易发现的错。

### 4.3 `roundtrip.json`

```json
{
  "attempt": 1,
  "verdict": "fail",
  "restatement_path": "...",
  "drift": [
    { "kind": "missing", "quote": "每周自动发一次", "detail": "需求未体现周期性" },
    { "kind": "quantified", "requirement": "R-03", "detail": "「尽快」被写成「24 小时内」", "adjudicated": null }
  ],
  "blocking": 1
}
```

G2 会对 `verdict` 与 `blocking` 做自检：与漂移清单不一致直接判失败，生产端写坏无法藏住。

### 4.4 人读的验收方式

校验通过后，**先给用户看 `restatement.md`，再给看 `spec.md`**。原因是人对「别人怎么理解我」的敏感度，远高于对「规格写得对不对」的判断力。这是最低成本的对齐验收。

---

## 5. 记忆与压缩

### 5.1 分层

| 层 | 内容 | 压缩策略 |
|---|---|---|
| L0 | 完整会话日志 | 上游 append-only log，永不删 |
| L1 | 阶段检查点 | 结构化 JSON，**永不压缩**，永远原文进上下文 |
| L2 | 跨会话 playbook | 检索式注入，按场景取 |

### 5.2 四条规则

1. 只压对话，不压状态。`state.json` / `slots.json` / `requirements.json` / `assumptions.json` 不参与摘要。
2. 阶段边界即压缩点。切阶段时对本阶段对话做一次压缩，替换节点携带检查点路径。
3. 大工具输出不进上下文。走上游 `spill`，上下文只留 locator + head/tail。
4. 压缩要自检：摘要必须严格小于原文，且保留数字、决策、否定词。

第 4 条对应上游的 shrink check 与保留尾部策略，本层不重写，只配置。

---

## 6. 上游扩展点映射

| 本层需求 | 上游扩展点 | 本层动作 |
|---|---|---|
| 状态机与门禁 | tool 定义 + `agent/pre-step` | 新增 `@spec-engine/stage-machine`（纯核，零依赖）+ `@spec-engine/contract-tools`（注册、IO、背书） |
| 上下文压缩 | `ctx.compaction` seam | 只配置阈值与保留策略 |
| 大输出旁路 | `ctx.spill` | 只配置 |
| 计划 | `packages/plan` | 直接复用 |
| 子代理 | `packages/subagent` | 直接复用 |
| 提问交互 | `packages/interaction` | 直接复用，约束为一次一问 |
| 阶段提示词 | `packages/skill` | 每阶段一个 skill |
| 组装 | `agent-preset` 声明式 YAML | `spec-engine` preset |
| 模型接入 | `packages/llm` provider 抽象 | 用既有 OpenAI 兼容端点配置 |
| 阶段进度可视化 | 独立产物（不依赖上游） | 生长树 v1：`spec-engine/viz/tree.html`，直接消费 `state.json` 的 history 渲染（D-07） |

上游 preset 的声明形态（节选自 `agent-preset` 文档）：

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    plugins: []
```

本层即新增一条 `id: spec-engine` 的 preset，`plugins` 列表里挂本层两个插件，其余引用上游包。本层包命名空间为 `@spec-engine/*`（D-05）。

---

## 7. 失败与降级

| 情形 | 处理 |
|---|---|
| 门禁不通过 | 返回缺失项，停留在当前阶段，不静默跳过 |
| 用户中止 | 写 `aborted`，保留全部检查点，可回退恢复 |
| 上下文溢出 | 走上游 overflow 恢复：剪枝 → 压缩 → 重试 |
| 反向还原连续失败 3 次 | 判定为「需求本身不可规格化」，转人工介入，不再重试 |
| 用户推翻已确认规格 | 回退到 `align`，旧检查点保留为历史 |

---

## 8. 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 环境验证 | **部分完成**：发布包 `@deepseek-ai/dsh@0.2.2-rc.2` 在 Node v22.23.2 上可启动，Web UI 验证 HTTP 200（npm 仅警告 engines，未阻塞）。**源码构建路径未验证**：仍需 Node ≥ 24.9 + pnpm 11.28.5，待装环境后跑通 `pnpm install && pnpm run build` |
| M1 | `stage-machine` + `contract-tools` | **进行中**：`@spec-engine/stage-machine` 纯核与 vitest 测试已落库（**尚未编译运行**）；生长树可视化原型（体现层）已产出，commit `6ac9fd3`；contract-tools 的设计输入已齐——D-08 锁定用户确认通道（复用上游审批打断），OpenAI 兼容端点可配性尚未回报，待编码 |
| M2 | round-trip：独立上下文反推 + 六类漂移判定 | 未开始 |
| M3 | preset 组装，端到端跑通一个真实小任务 | 未开始 |
| M4 | 评测：10 个案例，量化漂移率与返工率 | 未开始 |

### 8.1 评测指标

| 指标 | 定义 | 期望方向 |
|---|---|---|
| 漂移率 | 每份规格的阻塞级漂移数 | 下降 |
| 返工率 | 进入阶段 3 之后发生方向性修改的会话占比 | 下降 |
| 提问效率 | 达到 G1 所需的问题数 | 下降 |
| 单任务成本 | token 消耗 / 任务 | 可控 |

没有这四个数，阶段 3 的「自成长」就没有优化对象。

---

## 9. 未决

- 阶段 5 的「金标准样例」由谁提供：用户提供，还是从历史产物中抽取后经用户确认。
- 快通道的判据：什么规模的任务允许跳过阶段 1–3。
- 是否引入 DSPy 级优化器（v2，前提是 M4 的评测集稳定）。
- M0 收尾：Node 24 + pnpm 安装后，验证源码构建路径（`pnpm install && pnpm run build`）与 headless 任务（需 API key，key 只进环境变量，不进仓库与对话）。
- `plan.md` 的结构化解析约定：M1 纯核只接解析结果（`PlanAlternative[]`），解析器规格 v0.2 定。
- 上游仓库闸门对本包的适配项：README frontmatter、`README.i18n.yaml`、根 tsconfig paths 注册、包目录（`gen-plugin-packages`）登记；doc-sync / hygiene 未跑过，环境就绪后处理。
- Web UI 上手三问的回收情况：② 展示形态→生长树（D-07 已落地）；③ 审批打断复用→已确认（D-08）；**① OpenAI 兼容端点能否配入上游「设置→模型」——尚未回报**。①不阻塞 contract-tools 编码（模型配置属 preset/运行时配置），但 M3 端到端前必须有答案。
- 生长树 v1 是独立 HTML（消费 `state.json`）；接入上游 Web UI 的方式（面板/独立页）v0.2 再议。
