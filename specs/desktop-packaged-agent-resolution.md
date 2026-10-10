# 已安装桌面应用的 Agent 入口解析

## 问题与产品规则

2026-10-10 已发布 Linux amd64 deb 的 SHA-256 为 `f92f2b1455be5c6d83975ee8123de7e52f36866745d0d06f3d11ec9f1eb08bd2`。从 deb 内容确认 `./opt/ZenCode/resources/glm/zcode.cjs` 已随包安装；同一包在隔离 Ubuntu runner 首次启动时，Host 的存储准备却返回 `unsupported_runtime`，欢迎页变成“Startup preparation failed”。Windows ARM64 安装后的首次启动也出现同一错误。解包应用在构建 checkout 内启动时能从 `bundled-agents` 找到 bundle，不能证明安装后的资源解析正确。

Main 是已安装应用 `process.resourcesPath` 的唯一可信来源。启动每个 window-scoped Host utility process 时，Main 把打包资源根目录作为明确环境字段传给 Host；Host 里的 `@zcode/services` Agent resolver 在解析 `zcode.cjs` 时先查这个路径，再查现有开发态/远端候选。仅 Electron Host 可用内置 Electron Node runtime 执行该 bundle；远端 SSH/WSL 仍使用既有原生二进制链路。Host 不复制会话业务状态，也不创建第二条 Agent 路径。资源根目录缺失或 bundle 不存在时明确失败，不把 checkout 中偶然存在的构建产物当作安装包成功。

```text
安装后的 Main（resourcesPath）
  → Host fork 环境（资源根目录）
  → services resolver 查 resources/glm/zcode.cjs
  → Host 存储准备 Worker 使用同一 bundle
  → Agent app-server 使用同一 bundle
```

## 验收

- resolver 单测以无 `process.resourcesPath`、无 checkout `bundled-agents` 的 utility-process 形态，注入已存在的临时 `resources/glm/zcode.cjs`，应返回该绝对路径；环境目录缺少入口时不得返回假成功。
- 桌面进程测试确认打包 Main 将资源路径传给 Host，开发态不注入打包资源路径。
- 从重建的 Linux deb 和 Windows 安装器完成安装后，首次启动应到达 ZenCode 欢迎页，默认电脑控制关闭且手动启用与插件页同步；测试必须使用实际安装目录。
- Mac 已公证包不能因未重新签名的代码改动被称为已更新；修复需重新打包、公证并替换最新 DMG 后才可声明全平台发布完成。
