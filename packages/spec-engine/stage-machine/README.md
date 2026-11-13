# @spec-engine/stage-machine

Spec Engine 的阶段机纯核：有序阶段图、写时复制状态、G1–G6 门禁纯函数。

**零依赖**：不 import 上游任何包，不做 IO，不调模型，不依赖 Cordis。文件读取、解析、`evidence_verified` 与 `user_confirmed` 的背书、HarnessError 映射、Cordis 注册与 `agent/pre-step` 挂载，全部归 `@spec-engine/contract-tools`（M1 后半）。

## 契约

- 数据字段名与 `spec-engine/docs/architecture.md` §2 逐字一致；snake_case 是刻意保留，不改名。
- 门禁只吃解析后的事实（决策 D-06）：`evaluateGate` 不读文件。
- `advance` / `rollback` / `abortStage` 均为纯函数：时间戳由调用方注入，输入 state 永不被修改。
- G2 自检：`verdict` 与 `blocking` 字段和漂移清单不一致时直接判失败，生产端写坏无法藏住。
- 失败一律返回结构化 `reasons`，不抛异常；终态（`done` / `aborted`）不可 advance，回退只允许去更早的非终态阶段；中止后可通过回退恢复。

## 目录

```
src/
  types.ts     契约数据模型（Stage、slots、requirements、drift、GateInput、StageState）
  gates.ts     G1–G6 纯函数 + evaluateGate 分发
  machine.ts   转移表、advance / rollback / abortStage（写时复制）
  index.ts     公开出口
tests/         vitest 行为测试
```

## 未验证事项（诚实记录）

- 本包尚未在本机编译或运行过测试（M0 源码构建路径未完成：需 Node ≥ 24.9 + pnpm 11.28.5）。测试用例已逐条手工推演，但「推演通过」不等于「运行通过」。
- 上游 doc-sync / hygiene / 生成式包目录（`gen-plugin-packages`）等仓库闸门未跑过本包；README frontmatter、README.i18n.yaml、根 tsconfig paths 注册等适配项待环境就绪后处理，已列入 architecture.md §9。
