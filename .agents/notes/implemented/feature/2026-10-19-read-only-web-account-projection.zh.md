# Agent Note: 普通浏览器中的只读账号投影

Status: implemented

[English](2026-10-19-read-only-web-account-projection.md) | 中文

## 问题

账号侧边栏菜单与账号设置分区只在 Desktop preload 桥接存在时注册。因此，由同一 Host 服务的浏览器无法显示 Host 已经持有的账号，菜单中的余额摘要也因为这个 gate 而只存在于 Desktop，而不是源于一项关于钱包展示的产品决定。

## 决策

账号客户端在两个渲染环境中都启用。桥接现在只决定需要 Desktop 的操作：登录、退出、模型登录引导、账号欠费提示、原生 Platform 页面与 Desktop 引导。桥接缺失时，注入面携带 `readOnly`。

只读入口在 Host 报告 `credential-stored` 或模型 API Key 报告有钱包时注册，同时移除“登录”与“退出登录”菜单项及两个会话对话框。已登录投影保留资料、钱包行、赠金提示卡与账号设置分区。用量与充值链接在新标签页打开，因为该环境没有原生 Platform 页面。

没有保存授权时，Host 的 `getBalance` 读取推理来源上模型 API Key 的 `GET /user/balance`，将 `topped_up_balance` 投影为充值钱包、`granted_balance` 投影为赠金钱包。该请求拒绝重定向；没有 key 时没有余额，读取被拒或格式错误时返回失败结果。

登录仍实现在被隐藏的操作之后，并上报 `login_source: web`；只读界面从不调用它。

## 考虑过的替代方案

**保留仅 Desktop 的 gate。** 即使 Host 持有有效授权，余额摘要也不会出现在浏览器中，而这正是被报告的问题；已否决。

**在浏览器中提供完整账号操作。** 浏览器登录需要产品决定，且远程部署无法接收提供方接受的 loopback 回调；本轮否决，并把条件记录在此，供后续变更使用。

**用插件配置开关控制该投影。** 没有部署需要旧隔离，且只读界面只读取 Host 状态；再加一个行为开关只会增加没有消费方的配置。

**为 API Key 钱包新增独立的 Remote 方法。** 复用 `getBalance` 在无授权时的结果可以保持单一钱包界面，也避免为只有该界面消费的读取新增 Typert 方法；已否决。

## 后果

只要 Host 保存了凭据或模型 API Key 报告有钱包，浏览器侧边栏就会用账号入口替换设置入口，且每个此类浏览器标签页都会订阅 `account/watch` 以及资料、余额与未通知赠金读取。API Key 来源没有资料、赠金提示或 Platform 链接，因此这些界面仍需要账号授权。账号欠费提示与模型登录引导仍仅限 Desktop，因此浏览器中的欠费失败继续使用通用 Chat 提示。

若将来开放浏览器登录，必须使用 `login_source: web` 与 loopback origin；非 loopback 部署无法完成回调。`apply.client.spec.ts` 固定了未登录边界与只读投影，`account.client.spec.tsx` 固定了不含会话操作的菜单。
