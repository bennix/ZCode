# 已打包桌面端 Computer Use 验收

发布流水线用真实打包程序验证首次启动：设置中的电脑控制开关默认关闭，插件页开关与其共享同一持久状态。测试只拥有临时用户目录、Electron 子进程及 CDP 会话；应用运行时拥有插件工作目录和其子进程。测试先关闭 CDP、终止 Electron，随后清理临时目录。Windows 在进程退出后短暂保留文件句柄时，清理允许有限重试；重试用尽仍报告错误。

Linux CI 的 Xvfb 环境没有正确配置 Electron SUID sandbox helper，因此该**测试进程**显式使用 `--no-sandbox`；发布程序默认启动方式不改变。测试必须等待 CDP 和首个窗口出现，失败时保留近期子进程输出以便判断是启动失败还是 UI 断言失败。

验收场景：macOS、Windows x64/arm64、Linux x64/arm64 的打包程序均可完成上述首次启动场景；Linux CI 不因 sandbox helper 权限误报产品失败，Windows CI 不因临时测试目录的短暂句柄占用误报产品失败。

## 已发布安装器的安装后验收

发布资产的安装后验收由独立、手动触发的 GitHub Actions workflow 执行，直接下载 `v3.14.26` 的规范文件名，并在安装前核对固定 SHA-256。GitHub Release 是资产所有者；测试 job 只在一次性 runner 中安装和运行，不修改 Release，也不将测试机的用户状态带回产物。Windows x64/arm64 在匹配架构 runner 静默安装 NSIS 到 job 专用目录，从安装目录启动 `ZenCode.exe`，执行同一首次电脑控制设置 E2E。Linux x64/arm64 在匹配架构 Ubuntu runner 安装 deb，使用系统安装入口运行相同 E2E；两架构 rpm 在匹配架构 Fedora 容器中完成依赖解析与安装，并检查包身份与可执行入口。RPM 容器检查不冒充完整 GUI E2E。

事件顺序：读取发布资产 → 校验每个资产哈希 → 安装至隔离 runner/容器 → 从安装入口启动 → 首次设置 E2E 或 RPM 安装检查 → 记录各架构结果。任何哈希不符、安装失败、入口缺失或 E2E 失败均使对应 job 失败；不得降级成仅检查下载成功。Windows/Linux 检查仍不能替代真实用户 GNOME/KDE portal 授权、锁屏/RDP 场景或人工视觉复核。

安装后 E2E 若没有出现欢迎页，应记录当前 URL、截断的页面正文与近期进程输出，并在 CI 保留失败截图；页面内容和日志只来自隔离首次启动目录。Windows 静默安装先使用安装器默认安装目录，再从该 runner 的用户 Programs 目录定位安装后的 `ZenCode.exe`，避免把 `/D` 自定义路径参数问题误判成包损坏。安装器仍异常退出时必须保留原始退出码，不把该 job 标为通过。

安装后检查还提供候选模式：输入成功的 Windows/Linux 打包 run ID 与完整预期源码提交 SHA，先从 GitHub API 校验 run 名称、成功结论、仓库和 `head_sha`，再按架构下载该 run 的构建 artifact 并安装。候选模式的文件摘要由 job 打印并用于后续晋升核对；不能拿发布版固定哈希去判断尚未发布的新构建。只有候选安装后检查全部通过，才可用晋升工作流替换 `v3.14.26` 的公开资产。发布版模式继续从 Release 下载并核对固定哈希，两个模式不得混用来源。

## 安装后 Agent 资源根目录

安装后的 Main 是 `resourcesPath` 的唯一所有者。Main 在 `InitLocal` 消息中把绝对资源根目录交给 window-scoped Host；Host 在开始数据库准备前设置该进程的资源路径供 Agent resolver 使用。该顺序不依赖 Electron utility process 对自定义 fork 环境变量的继承行为，也不从 checkout 搜索回退。开发态不传此字段，仍沿用开发解析链。验收以安装器中的应用为准：deb x64/ARM64 的首次启动不能出现 `unsupported_runtime`；Windows 安装成功后执行同样断言。缺少 `resources/glm/zcode.cjs` 时保持显式失败，不从源码树补齐。

Windows 安装器若在执行安装命令前后发生进程级崩溃，验收 job 在失败时记录最近的 Application Error / Windows Error Reporting 事件，保留故障模块和异常码；这些系统事件只用于定位失败，不作为安装成功的替代条件。

若安装后仍报 `unsupported_runtime`，Host 在 `InitLocal` 后、数据库准备前记录一次不含路径值的诊断：是否收到资源根、该根下 Agent JS bundle 是否存在、是否有显式 Agent 命令覆盖、是否为 Electron runtime。此记录用于把资源缺失与 resolver 优先级问题分开，不能将诊断记录当成可用性通过。

安装后 E2E 的应用进程工作目录必须是隔离的临时目录，不能是仓库 checkout；否则 `findUpward` 能从源码树找到 Agent，掩盖包内资源缺失。开发态测试仍可从仓库根启动。

Linux 构建流水线在上传候选 deb/rpm 后，必须安装该架构的 deb 并从系统入口运行首次启动 E2E。这样每次改动可直接看到已安装包的 Host 诊断和真实启动结果；构建 job 若因此失败，artifact 可供取证但不能晋升。独立候选验收仍负责跨平台正式发布门禁。
