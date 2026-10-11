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

已安装包的资源根目录由 Main 明确提供时，Agent resolver 必须优先使用该目录的 `glm/zcode.cjs`，即使当前工作目录碰巧位于带 `apps/zcode-cli/.../src/main.ts` 和 `tsx` 的 checkout。若指定的包内 bundle 缺失，则明确失败，不回退到 checkout 的开发入口；开发态无资源根时继续使用原有 dist/source 搜索顺序。显式 `ZCODE_AGENT_SERVER_COMMAND` 仍保持用户覆盖优先级。

Windows 安装器崩溃诊断还应输出 NSIS 自身的阶段日志（若存在），以判断 `System.dll` 异常发生在初始化、清理、解包还是快捷方式阶段；日志缺失本身也是定位证据。不得因日志不存在而覆盖安装器原始失败。

Windows x64 CI 曾在静默安装启动后约 4 秒，以 `0xC0000005` 崩溃；Application Error 明确指向 NSIS 临时目录中的 `System.dll`。现有阶段日志在 `customInit` 就通过 `System::Call GetCurrentProcessId` 加载该插件，这是已确认的早期调用点；崩溃具体指令与阶段仍待 NSIS 日志验证。阶段日志改用已存在的安装进程角色标记，卸载日志用固定的 `uninstaller` 标记，避免仅为获取 PID 就在安装早期加载 `System.dll`。UI 调整和快捷方式逻辑中的其他 `System::Call` 本次不扩大修改范围。验收要求 Windows x64/ARM64 静默安装、首次启动通过，失败仍输出原始退出码和阶段日志。

3.14.28 候选的首次 x64 崩溃记录只有 `installer-process-started role=outer`，没有 `customInit` 的 `installer-initialized`；Windows Application Error 指向 `System.dll` 偏移 `0x1581`。因此失败发生在 electron-builder `.onInit` 的 `preInit` 与 `customInit` 之间。该区间包含单实例互斥的 `System::Call CreateMutex`、UAC 判断及安装模式初始化，单凭模块名和阶段日志仍不能断定具体指令。后续公开安装验收应在隔离 runner 的安装器进程上预设 Windows Error Reporting 小型崩溃转储；失败时上传转储及阶段日志，成功时不保留转储。转储只用于定位异常，不改变退出码或把失败转成通过。若转储不可用，记录这一事实并继续保留原始系统事件。

3.14.28 公开 ARM64 安装复验 `38093690258` 再次在同一区间崩溃。WER 转储确认 x86 安装器运行于 Windows ARM64，`System.dll+0x1581` 读取 `0x0b212000` 触发访问违规；它尚不能区分系统架构检查、单实例互斥或安装模式初始化的具体调用。下一候选包在 electron-builder `.onInit` 的架构检查前后、单实例互斥前后、安装模式初始化后记录阶段，保留上游执行顺序、互斥和提权语义；这些标记只写已存在的文件日志，不调用 `System.dll`。模板补丁必须有精确锚点、重复应用幂等和构建退出恢复，模板结构变化应使构建失败而不是静默漏掉诊断。验收先用对应架构的候选安装器从零安装并运行首次设置及 About 检查，再根据最后一个到达的阶段和转储决定修复；单次通过仍不证明偶发故障消失。发布资产只有经过候选验证才能替换。

候选构建 `38094521592` 两架构成功；独立安装验收 `38095733925` 的 x64 安装、首次设置和 About 检查通过，ARM64 再次以 `0xC0000005` 失败。其阶段日志已确认架构检查和单实例检查完成，进入 `initMultiUser` 后崩溃。下一次诊断只在 `initMultiUser` 的管理员/注册表/模式选择边界，以及普通用户默认目录的 `System::Store`、`SHGetKnownFolderPath`、指针读取和释放边界写阶段；不改变默认目录或权限语义。以最后一个完整阶段缩小原生调用，再提出修复并重建验证。

细分诊断候选构建 `38096288223` 两架构成功；独立安装验收 `38097633311` 的 x64 再次复现崩溃。最后完整阶段是 `user-folder-query-completed`，未到 `user-folder-pointer-read-completed`：故障已定位为 electron-builder 的 `setInstallModePerUser` 在 `SHGetKnownFolderPath` 成功后，通过 `System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'` 读取返回指针。修复应只替换首次普通用户安装目录的该已确认故障路径：直接使用上游本来提供的 `$LocalAppData\Programs\${APP_FILENAME}`，不再通过 `System.dll` 查询和解引用已知文件夹指针。已有用户安装从 HKCU 读取 `InstallLocation` 的路径和显式 `/D` 覆盖保持原顺序；机器范围安装和卸载逻辑不变。首次安装若系统把 `FOLDERID_UserProgramFiles` 指向非默认位置，将使用 `$LocalAppData\Programs`，这是为消除崩溃而接受的明确行为变化。需用安装器两架构从零安装、首次设置、About 检查及重复安装验证；只成功一次不证明间歇性崩溃消失。

候选验收允许只提供一个平台的成功构建 run ID 与完整源码 SHA，用于单独验证 Windows 安装器或 Linux 包；未提供的平台 job 全部跳过，不能偷偷改从已发布 Release 下载。提供两个 run ID 时执行全平台检查。发布版模式仍要求三个候选输入都为空，并校验固定的公开资产哈希。
