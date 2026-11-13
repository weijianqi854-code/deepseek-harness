# Spec Engine

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）之上叠加的「意图 → 规格 → 产物」agent harness。

本仓库是 DSH 的公开 fork，上游为 `deepseek-ai/deepseek-harness`。

一句话定位：把一句模糊需求，编译成一份可验收的规格，再编译成一个能运行的产物。

---

## 1. 形态与边界

沿用上游「一切皆插件」的架构，本层以 **preset + plugin** 形态叠加，不改核心：

- 不改 `packages/core`，不改 `agent-loop`（上游规则：Plugins, not loop changes）。
- 新增包放 `packages/spec-engine/<pkg>`；工作区 glob 为 `packages/*/*`，无需修改 `pnpm-workspace.yaml`。
- 复用上游已解决的基建，不重复造：`packages/compaction`（压缩）、`packages/spill`（大输出旁路）、`packages/session`（append-only 日志 + 投影）、`packages/subagent`、`packages/plan`、`packages/skill`、`packages/todo`、`packages/preset`。
- 词表沿用上游的 capability seam 三分法：Service Definition / Service Provider / Consumer。

只增不改是硬约束。一旦开始改核心，「上游可同步」这个前提就消失了。

---

## 2. 六阶段与出口门禁

门禁由代码判定，模型只能提议。这是整套系统能否稳定的唯一决定因素。

| # | 阶段 | 产物 | 出口门禁 |
|---|---|---|---|
| 1 | 提问 | `slots.json` | 必填槽位填充率达阈值；每题只问一个问题；低返工成本项允许默认推进 |
| 2 | 对齐 | `spec.md` + `assumptions.md` | round-trip 反推比对通过；假设表非空且每条带反证条件；用户显式确认 |
| 3 | 分析 | `plan.md` | 至少 2 个备选方案；可行性有证据（读过码或跑过最小实验）；无未标注假设 |
| 4 | 体现 | `prototype/` + `usage.md` | 存在可看可跑的产物；「本次不做」清单非空；用户显式确认 |
| 5 | 测试 | `tests/` 或 `rubric.md` | 可判定任务：测试全绿；需判断任务：金样例通过；held-out 集存在 |
| 6 | 施工 | 产物 + `debug-log.md` | 计划项全部关闭；回归无退化 |

阶段边界即压缩点：每个阶段出口写一份 checkpoint（结构化状态 + 决策 + 未决问题 + 产物指针）。

---

## 3. 三条不可妥协的约束

1. **门禁由代码判定。** 模型永远会「觉得」自己对齐了，退出条件必须是可检查的硬条件。
2. **只压对话，不压结构化状态。** `slots.json` / `spec.md` / `assumptions.md` / `plan.md` 永远以原文进上下文；关键决策保留用户原话逐字，不做改写。
3. **自成长的奖励信号来自用户。** 返工、采纳、测试通过才算正反馈；模型自评会收敛到「模型爱听的标准」。

---

## 4. 待定事项

- 阶段 2 的主手段：round-trip 校验与假设清单，谁是主、谁是辅。
- 是否引入 DSPy 级 prompt 优化器（v2，前提是先有稳定评测集）。
- 复杂度路由阈值：什么规模的任务可以跳过阶段 1–3 走快通道。

---

## 5. 环境与上游事实

- Node ≥ 24.9，pnpm 11.28.5（上游 `AGENTS.md`）。
- 上游为 developer preview，明确声明会有破坏性变更，因此只增不改不是偏好，是生存条件。
- 许可证 MIT，保留 `LICENSE` 与上游署名。
