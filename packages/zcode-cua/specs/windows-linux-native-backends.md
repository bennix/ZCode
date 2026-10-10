# Windows 与 Linux 本机电脑控制

## 产品规则

- 官方 `computer-use` 插件随对应平台的 ZenCode 桌面包安装，初始关闭；只有用户显式启用后才注册工具。缺少对应架构原生资产时拒绝 seed，不能显示虚假的可用状态。
- Windows x64/arm64 使用固定版本的 MIT `open-computer-use` UIA/Win32 执行器；Linux x64/arm64 使用固定版本的 MIT `computer-use-linux` AT-SPI/portal 执行器。构建时取得并校验二进制，运行时禁止下载。
- 固定版本 Linux 二进制在 x64/arm64 均引用 `GLIBC_2.39`；当前 GNU/Linux 发行包以 glibc 2.39+ 为运行基线，不能宣称 Ubuntu 22.04/Debian 12 等旧 glibc 环境已受支持。
- Linux runtime 在启动原生进程前检查可读取的 Node glibc 运行版本；低于 2.39 时明确说明版本要求，不以 `EPIPE`/泛化退出代替。无法读取版本时仍尝试启动，并将失败作为调用错误返回。
- Linux 以已登录图形会话为前提；Wayland 能力由 `doctor` 返回的 portal、AT-SPI 与输入后端事实决定。Windows 以已登录的交互桌面为前提。两平台均不能把启动进程成功当作可以操作桌面。
- 设置页和插件列表在本机 Linux 桌面显示电脑控制启用开关，沿用 Windows 的无 macOS TCC 权限行布局。SSH、WSL、Docker、Web 仍显示不可用。启用后 Linux 的具体能力仍以 `doctor` 为准。
- 桌面设置导航必须露出「电脑控制」分区，由现有 `ComputerUseSection` 读取插件管理 store 的启用态并调用同一 `setPluginEnabled` 路径；插件列表和专用分区不能各自持有一份开关状态。普通 Web 不显示此分区。首次安装时专用分区可见、总开关关闭；用户打开后两处显示一致。
- 插件列表的英文描述必须覆盖 macOS、Windows 和 Linux，不得继续宣称只控制 macOS 应用。
- 允许只读列举和观察；点击、键入等动作必须引用同一 CLI 会话最近一次观察得到的 ZenCode snapshot id。动作消耗该 snapshot；异常或未知结果不自动重试。屏幕图像按 MCP image 内容块转发，不写入长期存储。

## 状态、接口与时序

- CLI 的既有 CommandInbox/owner/lease 负责工具准入和 stale run 防护；`@zcode/zcode-cua` runtime 唯一持有每个 CLI 会话的原生 MCP 子进程、最新 snapshot id 和 pending 调用。Renderer 不持有这些事实。
- Node REPL client 经既有 broker 调用 `platform.describe`、`platform.call`；runtime 只允许固定的本机电脑控制 MCP 工具清单，不透传上游可能新增的 shell 或安装工具。不同平台的参数保持上游 MCP schema，由 `platform.describe` 提供当前工具定义。
- Linux 上游还提供 `move_window`/`resize_window`，用于经已就绪的窗口后端把被遮挡或离屏窗口移回可见区域；它们属于需观察快照的一次性动作。安装/环境配置类工具继续不向 Agent 自动开放。
- 每个会话一个 MCP stdio 子进程。先 `initialize`/`notifications/initialized`，然后 `tools/list`；调用按 JSON-RPC id 匹配。关闭会话、取消或进程退出时拒绝 pending、杀掉进程、废弃 snapshot。下一调用可新建进程，但绝不重放已经发送的动作。
- runtime 收到的会话环境变量必须传给原生 MCP 子进程，尤其是 Linux 的 `WAYLAND_DISPLAY`、`XDG_RUNTIME_DIR`、`XDG_SESSION_TYPE` 与 D-Bus 地址；未传入的基础进程环境沿用父进程，不能让打包执行器丢失 PATH。`doctor` 必须反映运行时指定的图形会话，而非意外继承另一个父进程环境。
- 原生进程在写入期间退出时，stdin 的 `EPIPE` 和进程退出都归并为一次会话失败，返回有限的退出码/信号诊断，不触发 Node 未处理异常，不自动重试动作。Linux 发行包依赖的 glibc 基线必须由打包平台实测并在安装说明中明确。
- 同一会话的 `platform.describe` 与 `platform.call` 在 runtime 内按入队顺序执行，快照只由该串行链更新。观察与动作不能并发越过彼此；关闭会话后，队列内未执行请求失败，旧观察不得写回新会话。不同会话不互相阻塞。
- 首次请求也必须在检查执行器文件和启动 MCP 进程之前取得同会话顺序位置；异步 `access` 或启动完成次序不能重排两个并发的观察。`closeSession` 增加 generation，旧 generation 中尚未取得执行器的请求不得在关闭后创建新进程。
- identity key 仍由现有 Host/CLI 生成；runtime key 为 `workspaceKey + remoteSessionId + sessionId`。手机远控复用同一 Host attachment 和 CLI 会话，桌面与手机只在投递方式上不同。

```text
用户启用插件 → CLI 工具注册 → CommandInbox/owner/lease → node_repl → broker
                                                        → CUA runtime (每会话 MCP 进程)
                                                        → Windows UIA 或 Linux AT-SPI/portal
观察 → runtime 生成 snapshot id → 动作携带 id → runtime 消耗 id → MCP tools/call
取消/会话结束/子进程退出 → 拒绝 pending → 废弃 snapshot → 结束进程
```

## 验收

1. Win x64/arm64 和 Linux x64/arm64 安装包包含匹配执行器；首次插件关闭，启用后可读取工具定义和能力状态。
   1a. 官方插件定义仍参与 bundle seed，且不在 `DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS` 中；回归测试阻止“安装即启用”的意外变更。此静态检查不代替首次安装后的设置页 E2E。
   1b. 桌面首次启动在设置导航可找到「电脑控制」，该分区总开关与插件列表中的同一官方插件开关一致；普通 Web 不展示桌面分区。
2. Windows 登录桌面可列举应用、观察 UIA 元素、点击和输入；锁屏或服务会话明确失败。
3. Linux GNOME Wayland 图形会话 `doctor` 显示真实能力，可观察 AT-SPI 元素并通过 portal 或已就绪后备输入完成动作；X11 和其他 compositor 按能力显示降级。
4. 无观察、旧 snapshot、跨会话 snapshot、重复动作均被拒绝；取消/进程退出不重试动作，不能继续使用旧 snapshot。
   4a. 同会话并发观察请求按提交顺序返回并更新快照；后提交的观察完成后，前一个 snapshot 不可执行动作。关闭会话时，未执行的队列请求失败且不能启动新的动作。
   4b. 若关闭发生在 MCP 初始化握手中，旧 generation 的观察与动作都不得触达原生工具；关闭完成后同一 session identity 的新请求可以启动新执行器并获得新 snapshot。
5. desktop continuous 与 mobile replayable 两条投递链路均不创建第二个电脑控制会话。
6. Linux 桌面 E2E：首次打开设置，电脑控制插件可见且关闭；手动开启后设置页与输入框显示入口；进入会话读取 `doctor`，观察一个应用后完成一次元素动作；切到远端 workspace 时入口消失，设置页提示不可用。
7. Windows/Linux x64 与 arm64 的打包流水线分别在对应架构 runner 上生成安装包，随后用该架构预置原生二进制完成真实 MCP `initialize` 与 `tools/list` 握手；必须出现 `get_app_state`、`click`、`list_apps`，不得暴露上游 `run_shell`。Linux 还调用 `doctor` 并检查其返回的能力诊断。各架构产物分别上传，不能让 x64 成功掩盖 arm64 缺包。此无头检查只证明启动、协议及诊断接通，不能替代登录桌面的观察和动作验收。
8. 子进程在初始化前退出（含动态库不兼容）时，调用返回错误而不崩溃；无图形桌面时 `doctor` 如实报告缺少 portal/AT-SPI/输入/截图能力。
9. Linux x64 与 arm64 的打包流水线在隔离的 Xvfb 图形会话启动 xcalc，经同一 ZenCode runtime 完成 `doctor`、观察、携快照 ID 点击数字 7、再次观察，并确认截图发生变化。此检查验证 X11/XTEST 坐标动作，不代表 GNOME Wayland 的 portal 或 AT-SPI 元素动作已通过。
   9a. Linux x64 与 arm64 的打包流水线在独立 D-Bus 会话中启动 Weston headless 和 Zenity，启用 AT-SPI，使用预置二进制经 ZenCode runtime 观察明确命名的按钮，再携该次 snapshot id 执行元素 `Click`，并验证对话框进程成功退出。此检查证明 Wayland AT-SPI 元素动作，不证明 GNOME portal 截图或坐标输入。
10. Windows x64 与 arm64 的打包流水线在登录的交互桌面启动独立 WinForms 测试窗口，经预置二进制 `list_apps` 找到窗口、`get_app_state` 读到明确命名的 UIA 文本框与按钮。先携快照执行 `set_value`，重新观察后携新快照执行元素 `click`；按钮事件把文本框内容写入一次性哨兵文件并退出，断言写入值等于预期。若 CI runner 没有交互桌面，应明确失败，不能把 MCP 握手当成 GUI 动作通过。该测试不代替锁屏与真实应用的手工验收。
11. Windows/Linux 每个架构打包后还要从该架构的 unpacked 应用启动隔离首次使用 E2E：`HOME`、桌面 userData/sessionData 与 ZenCode 数据目录各自隔离，首次设置页与插件列表中的电脑控制开关均为关闭；手动开启后两处显示一致。该检查验证包内 renderer、Host 与插件管理链，不等于通过 NSIS/deb/rpm 安装器的安装后验收。流水线必须使用各架构对应的 unpacked 目录，不能以开发态 Electron 替代。

## 本机验证记录

2026-10-10：预置 Linux ARM64 二进制在 Colima 虚拟机实际执行 `doctor`，报告无图形会话且能力不可用；Node 24 的 Linux ARM64 与模拟 x64 容器均通过 ZenCode runtime 的 `initialize`、`tools/list`、`doctor` 调用。glibc 2.36 容器按预期返回最低版本错误，glibc 2.41 容器通过。此证据不覆盖 Windows 实机或 Linux 已登录图形会话的元素动作。

2026-10-10：Ubuntu 24.04 ARM64 容器内启动 Xvfb 与 xcalc，执行器 `doctor` 报告 X11、xdotool 输入与截图可用。ZenCode runtime 取得观察快照、以该快照点击 xcalc 的 7，原生结果为 `Action sent through xdotool (X11 XTEST)`，再次截图显示计算器由 0 变为 7。AT-SPI 在这个隔离 X11 会话中不可用；此证据仍不覆盖 Linux GNOME Wayland 或 Windows 登录桌面。

2026-10-10：Debian Trixie ARM64 容器内运行 Weston headless Wayland、会话 D-Bus 和 Zenity，执行器 `doctor` 报告 `can_build_accessibility_tree=true`，`get_app_state` 返回 Zenity 的 Yes 按钮语义节点。ZenCode runtime 用当前 snapshot id 调用 `click(element_index=3)`，原生结果为 `Invoked the primary AT-SPI action (Click) without pointer-coordinate conversion`，Zenity 进程随后退出。该环境无 Screenshot/RemoteDesktop portal、窗口 introspection 或键盘输入，因此只证明 AT-SPI 元素动作；GNOME Wayland portal 和 Windows 登录桌面仍未验收。

2026-10-10：在 Apple Silicon 主机的 Colima x86_64/QEMU Debian Trixie 容器中，使用 `packages/desktop/bundled-agents/linux-x64/glm/packages/zcode-cua-plugin` 内的 Linux x64 打包二进制，`packaged-native-smoke.mjs` 的 MCP 握手通过；`linux-x11-native-action.mjs` 在 Xvfb 中观察并点击 xcalc，通过再次观察确认动作；`linux-wayland-native-action.mjs` 在 Weston headless 与独立 D-Bus 会话中通过 AT-SPI 观察并点击 Zenity，确认对话框退出。该验证覆盖打包 x64 二进制在隔离图形会话中的实际动作；它不代替 GitHub Actions 的 Ubuntu x64 打包流水线，也不证明 GNOME portal 或 Windows UIA。

2026-10-10：新增 Windows 打包流水线的 WinForms UIA `set_value` + `click` 验收脚本。macOS 本机只能完成 Node 语法、Lint、架构与包协议测试；该脚本尚未在 Windows 登录桌面执行，不能据此宣布 Windows GUI 控制已通过。

2026-10-10：隔离数据目录启动当前 macOS Preview 包，插件列表实际显示内置「电脑控制」，启用开关初始为 unchecked；手动点击后为 checked，MCP 数从 1 变为 2。检查同时发现专用设置分区被 `HIDDEN_SETTINGS_SECTIONS` 显式隐藏；当前源码已恢复桌面导航，并以真实 Electron 首次启动 E2E 验证设置页与插件列表共用同一开关。普通 Web 不显示该分区的配置测试通过。此证据不覆盖 Windows/Linux 安装包或实机动作。

2026-10-10：Windows/Linux x64、arm64 打包 workflow 现增加各自 unpacked 产物的首次启用 E2E；测试在 macOS arm64 Preview 包以默认语言和 `--lang=en-US` 两次隔离启动均通过。工作流 YAML 解析及矩阵目录字段本地验证通过。GitHub 默认分支尚无这两个 workflow 的运行记录，因此 Windows/Linux 对应步骤仍待 runner 执行，且 unpacked 启动不代替安装器安装后验收。
