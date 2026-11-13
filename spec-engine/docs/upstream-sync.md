# 上游同步

## 分支模型

| 分支 | 用途 | 规则 |
|---|---|---|
| `master` | 上游镜像 | 禁止直接提交，只接受 `upstream/master` 快进 |
| `dev` | 本层开发主分支 | 日常提交都在这里 |
| `feat/*` | 单点改动 | 从 `dev` 切出，合回 `dev` |

## 首次初始化

```sh
git clone https://github.com/weijianqi854-code/deepseek-harness.git
cd deepseek-harness
git remote add upstream https://github.com/deepseek-ai/deepseek-harness.git
git fetch upstream
git checkout dev
pnpm install   # 需要 Node >= 24.9
```

## 定期同步

```sh
git fetch upstream
git checkout dev
git merge upstream/master
```

## 冲突预期

- 允许冲突：`spec-engine/`、工作区配置类文件。
- 不允许冲突：`packages/core/**`、`packages/*/src/**`、`agent-loop` 相关。若这些地方出现冲突，说明改动越界了，应回退而不是合并。

## 提交信息

`<type>(spec-engine): <subject>`，type 取 `docs` / `feat` / `fix` / `test` / `refactor`。
