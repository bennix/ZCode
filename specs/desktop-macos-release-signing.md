# macOS 发布签名与公证

Developer ID 发布包的签名所有者是 Desktop `afterPack` 与 electron-builder。`afterPack` 在主 App 签名前扫描 `Contents/Resources/code-workbench`、`glm`、`tools` 下的 Mach-O 文件，按文件 magic 而非扩展名识别，只对这些原生可执行文件逐个加 Developer ID、hardened runtime 和安全时间戳。普通 PNG、脚本和文本不签名。electron-builder 随后跳过这三个已经处理的目录，签主 App 与框架并封存资源。任一内层签名失败阻止出包；时间戳服务短暂不可用可有限重试，但不能关掉时间戳或公证门禁。

```text
afterPack 复制运行时 → 扫描三个资源目录 → 逐个签 Mach-O → electron-builder 签主 App
→ codesign deep/strict → Apple notarization → staple DMG → stapler/spctl 验证 → 发布
```

验收：扫描包含无扩展名 `OpenComputerUse`、bfs/rg/ugrep、工作台 Node 和 `.node`，排除伪装成可执行文件的 PNG；最终 `codesign --verify --deep --strict` 通过。公证若报告任何 `Invalid` 原生文件，则视为整包失败，修复后必须重新构建、重新提交，不复用被拒 DMG。发布目录和 GitHub 仅保留最新的已公证 DMG；未签名或已拒包不能作为下载入口。

下一版品牌修正发布时，源码 tag、根包版本、Windows/Linux 构建及安装验收工作流、安装包文件名必须一致。Windows/Linux CI 候选包可先上传到同一源码提交指向的 Draft Release，以便从真实安装资产运行安装后验收；只有构建 run 的 `head_sha`、Release 的 target commit 与预期源码相同，且 Release 仍为 draft，才允许这个暂存步骤。先完成跨平台构建与安装验收，再晋升公开资产；Mac DMG 公证及装订验证通过后才替换本地留存的上一版 DMG。发布失败时保留最后一份已公证 DMG，并且不把失败候选设为 Latest。

安装后验收矩阵中的公开资产 SHA-256 必须在每版暂存资产的远端摘要核对后更新；候选构建 run 验收先完成，公开发布后再从正式 Release 下载同名资产复验。Draft Release 的 tag 下载入口不能代替正式下载验收。

## 3.14.28 候选

本版修复 macOS 设置页对随包原生执行器的权限查询和授权入口。版本号、安装资产名及安装后验收工作流统一为 3.14.28。签名、公证及两平台 CI 安装验收全部完成前，`v3.14.27` 保持公开 Latest，本地继续保留其唯一已公证 DMG。候选失败时不替换本地或 GitHub 的旧包。

## 3.14.30 候选

- 3.14.29 已公开；会话订阅错误的 ZenCode 品牌修正要进入正式安装包，必须使用递增版本 3.14.30。根包版本仍是桌面构建元数据的唯一所有者；Windows/Linux 构建、草稿暂存、候选安装验收与最终更新资产都读取或匹配同一版本。
- 发布前 README 与本地唯一已公证 DMG 保持 3.14.29。只有同一最终源码提交的 Mac 签名/公证/装订、Windows 两架构安装、Linux 两架构 DEB/RPM 安装与 About 检查都通过，才公开 3.14.30 并更新下载入口。失败候选不能替换当前 Latest 或本地已公证 DMG。
- GitHub Release 是公开资产状态所有者，CI run 只提供构建和安装证据。候选源码 SHA、草稿 target、跨平台 CI run 的 head SHA 必须一致；发布后复验从公开 Release 下载并逐件校验 SHA-256，再删除 3.14.29 的旧下载资产。

## 3.14.31 候选

- 当前公开 Latest 是 3.14.30。本候选包含对话上下文引导、进度/文件计划卡片、微信配对入口，以及确认文件集合后的工具写入限制。新版本源码、Windows x64/ARM64 与 Linux x64/ARM64 安装包必须来自同一提交；Mac arm64 包须通过 Developer ID 签名、公证、装订及 Gatekeeper 验收。
- 文件计划确认后，运行时只允许 Write/Edit 触及选中文件；无法证明写入范围的工具拒绝执行。路径比较须解析符号链接，并拒绝落到工作区外的路径。workspace hook 环境和仍有后台任务的会话不得激活该限制。
- 发布前公开下载入口继续指向 3.14.30，本地唯一已公证 DMG 也保持 3.14.30。所有平台的安装包构建与安装验收、Mac 公证及正式下载复验通过后，才更新中英 README、公开 3.14.31，并清理旧版本下载资产。
- 候选 Release 必须是 draft，target commit 与四个 CI 架构 run 的 head SHA 完全一致。GitHub Release API 的 SHA-256 是公开资产核验依据；失败候选不替换 Latest 和本地已公证 DMG。

## 3.14.32 候选

- 本版移除插件市场列表卡片及详情标题上的付费套餐徽标；目录 `requiresPaidPlan` 元数据、插件权限和安装逻辑保持不变。
- 新源码、Windows x64/ARM64 与 Linux x64/ARM64 构建必须来自同一提交；macOS arm64 包须通过 Developer ID 签名、公证、装订及 Gatekeeper 验收。
- 发布前公开下载入口继续指向 3.14.31，本地唯一已公证 DMG 也保持 3.14.31。所有平台构建与安装验收、Mac 公证及正式下载复验通过后，才公开 3.14.32 并更新中英 README。
- 候选 Release 必须是 draft，target commit 与 CI run 的 head SHA 完全一致。GitHub Release API 的 SHA-256 是公开资产核验依据；失败候选不替换 Latest 和本地已公证 DMG。

## 3.14.32 macOS 公证包替换

- 版本号保持 3.14.32。Windows 与 Linux 安装包、CI 版本钉扎和对应下载入口不改。
- 当前源码重新打 macOS arm64 包：Developer ID 签名、Apple 公证、DMG 装订、`stapler validate`、挂载后 App 的 `codesign --verify --deep --strict` 与 Gatekeeper `Notarized Developer ID` 全部通过后，才替换 `v3.14.32` 上的 Mac DMG、ZIP、blockmap 和 `latest-mac.yml`。装订会改写 DMG，摘要必须在装订后重算。
- 任一环节失败时，公开 Mac 资产和本地上一份已公证 DMG 保持不变。
- 成功后本地 `release-artifacts` 只保留 `ZenCode-3.14.32-mac-arm64.dmg`。Landing Page 的 macOS 下载入口继续指向这个 GitHub 文件，不改 Windows/Linux 链接。
- 2026-10-14 正式版 `ZenCode.app`（`dev.zcode.app`）已用 Developer ID 签名。Office CLI `1.0.152` 的 `officecli-mac-arm64` 在装订后的 DMG 内通过严格签名，Team ID 为 `5N66S29EK2`。DMG 公证 `3c24e4f9-5411-4e8c-b100-0021ef6b55df` 与 ZIP 公证 `3f9b26be-4537-4077-ba8d-0330050157f1` 均为 Accepted；装订后 DMG SHA-256 为 `da9394411d0cb59ff337f6f70bb6d062281044d30e5f97620e8813226216d405`。挂载 App 的 Gatekeeper 结果为 `Notarized Developer ID`。

## 3.14.33 图片分批修复候选

- 从发布仓库 `main` 的当前提交制作独立候选，仅带入图片分析每批上限由十张降为三张的 spec、实现和回归测试；当前工作区的 PDF 编辑改动不进入候选。Core runtime 是分批和进度文案的唯一所有者，批次顺序、已完成批次的内容指纹恢复与失败停止规则保持一致。
- 根包版本、tag、安装包文件名、Windows/Linux 构建与候选验收工作流统一为 3.14.33。Windows x64/ARM64、Linux x64/ARM64 与 macOS arm64 使用同一最终源码提交。GitHub Release 草稿与构建 run 的提交 SHA 必须相同。
- Mac 包按 Developer ID 签名、公证、装订并验证 Gatekeeper；Windows/Linux 安装包通过各自真实安装验收，随后核对远端资产摘要。全部完成后公开新版并更新 README 下载入口；任一失败时保留 3.14.32 为 Latest。
- Windows 的 `latest.yml` 从同一成功构建 run 的 x64/ARM64 安装器计算 SHA-512 与大小；上传草稿后核对 GitHub 摘要，避免使用上一版更新清单。

## 3.14.33 发布验收

- 产品源码 `ad2d967e2aca9cd93944569fe87c451714fc4785`；Windows 构建 run `38702148262`、Linux 构建 run `38702147805` 均成功。候选安装验收 run `38705457263` 的 Windows x64/ARM64 与 Linux x64/ARM64 DEB/RPM 六项成功。
- Mac DMG 公证 `60908e3d-99a1-41ff-b4ed-9d194dd2ef06`、ZIP 公证 `df8a1a77-8daf-4d0d-8eee-70feecd8bdff` 均 Accepted。DMG 已装订并验证；挂载 App 的严格签名与 Gatekeeper `Notarized Developer ID` 检查通过。最终 DMG SHA-256 为 `d2c7b81ceb11aff3ff83d658c5ab0b1b030958d12b80b5f3475c4e2d0b367c1a`。
- 草稿中的六个 Windows/Linux 安装包由成功构建 run 暂存；Mac DMG/ZIP、两个 blockmap 与 `latest-mac.yml` 本地 SHA-256 均与 GitHub 资产摘要一致。Windows `latest.yml` 由同一 Windows 构建 run 生成并核对远端摘要。

## 3.14.34 双图分批与截断恢复候选

- 从 3.14.33 已验收源码创建新候选，普通批次最多两张；两张截断时按顺序逐张分析。Core runtime 拥有调度，既有 session batch memory 按精确内容指纹保存成功摘要；截断内容不得缓存为成功。单张仍截断、取消或其他错误停止本轮。
- 根包版本、tag、安装包文件名与安装验收工作流统一为 3.14.34；Mac、Windows x64/ARM64、Linux x64/ARM64 必须来自同一源码提交。草稿和构建 run 的 SHA 一致，安装验收、公证、装订、公开资产摘要复验完成后再发布；此前 3.14.33 保持 Latest 且本地唯一 DMG。

## 3.14.35 账户菜单精简候选

- 账户头像菜单移除独立的套餐升级/续费行，保留使用统计、账户操作、套餐卡片和上下文配额提示中的套餐入口。
- 根包版本、tag、安装包名称和安装验收工作流统一为 3.14.35。Windows x64/ARM64、Linux x64/ARM64 与 macOS arm64 安装包必须来自同一源码提交；Windows/Linux 安装验收和 macOS Developer ID 签名、公证、DMG 装订及 Gatekeeper 验收全部通过后才能发布。
- 候选构建 run 的 `head_sha`、草稿 Release target 和 Mac 包源码必须一致。任一构建或公证验收失败时，v3.14.34 继续作为 Latest，本地唯一已公证 DMG 保持不变。
- 账户菜单 E2E 验收要求能打开使用统计菜单项，且没有升级或续费菜单项；其他套餐与配额入口仍可用。英文可见文案是 `Usage stats`，中文是 `使用统计`。

### 2026-10-17 公证构建尝试记录

- 3.14.35 Mac ARM64 使用 Developer ID 身份构建；内层 31 个原生文件预签名成功。electron-builder 主 App 签名三次都因 Apple TSA 返回 `The timestamp service is not available` 失败，尚未提交新的 Apple 公证。禁止关闭安全时间戳、跳过签名或将失败候选设为下载资产。
- TLS 证据：`timestamp.apple.com:80` TCP 可连，443 建连后在 ClientHello 阶段被对端断开（curl `SSL_ERROR_SYSCALL`、OpenSSL `unexpected eof while reading`）。NTP 查询估计本机时钟偏差约 49 毫秒；未执行系统时钟调整。
- 本地保留 `release-artifacts/ZenCode-3.14.34-mac-arm64.dmg`，SHA-256 `84da6aacfa48aba96abe02a003622ab7193f3d2c888a15be6ac82b19918fac1e`。其 `stapler validate`、挂载后 App 的深度签名验证和 Gatekeeper `Notarized Developer ID` 验收均通过。
- 2026-10-17 重试后，正式版 `ZenCode.app`（`dev.zcode.app`）签名成功。Office CLI `1.0.152` 的 `officecli-mac-arm64` Team ID 为 `5N66S29EK2`。DMG 公证 `e5a16250-83b5-4348-96fd-a2b6cccb2669` 与 ZIP 公证 `61637c34-aeeb-48c6-942a-eda2a70cad14` 均为 Accepted，DMG 已装订。通过 Gatekeeper 后，本地 `release-artifacts` 只保留 `ZenCode-3.14.35-mac-arm64.dmg`，SHA-256 `df7e63710637a784fdcbe23e7af0322554c71d057579c2007312bd51b9f29a99`。`v3.14.35` 已发布这份 macOS 资产，但在 Windows/Linux 安装验收通过前，`v3.14.34` 继续作为 GitHub Latest。
- Windows package run `38979330423` 与 Linux packages run `38979330760` 在同一源码 `6c7ba6509943d0e84146ee84a4ebe02bb293a7f9` 上失败。四个作业都已产出安装包，随后在账户菜单验收超时：打包应用的英文菜单项是 `Usage stats`，测试却等待 `Usage statistics`。后续只修正该定位和本说明；产品界面与已公证 Mac 包一致。
- 修正提交 `b89b506216747ba186f9961c5966ef1b49d549fd` 上，Windows package run `38985537850` 与 Linux packages run `38985541111` 成功。安装验收 run `38987641826` 覆盖 Windows x64/ARM64 安装器、Linux amd64/arm64 deb 和 x86_64/aarch64 rpm，全部通过。公开资产摘要与本地文件一致后，`v3.14.35` 成为 GitHub Latest。本地 `release-artifacts` 仍只保留已公证的 `ZenCode-3.14.35-mac-arm64.dmg`。
- Windows x64 SHA-256 `fc7bfc98ba0bcd2a67e6416c5ff354b64115423dd48e583c7942fb3cf7926873`，ARM64 `c1a9a489508aa9161d026fc40c4d387697ddc5e7d89ed83b25f5074b3a8a5f40`。Linux amd64 deb `03ec83f3f8380c3a02873c8cc1117324362bbf0ccdd7ad19a6837f6ffc87b096`，arm64 deb `0f457e7ac2a3b54e8c17178dca0796edf5937da87cd25987600615184c1a7dc9`，x86_64 rpm `4cea5de7d1445bd12b96241f134636c51f17e7dd3822bc4ac48cbd199066f9c9`，aarch64 rpm `ee6f89953e96897e8256cfba05833f3fd72a1df924e35d0fc199bf11c70b12d3`。

### 2026-10-17 同版四平台重建

- 从已推送提交 `d29d32f1ab05171e5a70b4127dbf77a7e7ee795e` 重建四个下载平台：macOS Apple Silicon、Windows x64/ARM64、Linux x64、Linux ARM64。工作区中未提交的创作设计改动没有进入这些安装包。
- 新 DMG 公证 `c412c7ea-bc0c-4619-8ece-3a5e6ac623da` 与 ZIP 公证 `483129b9-9926-4bb4-adfc-060749c9bf2f` 均为 Accepted。DMG 已装订，挂载后的 App 通过 Gatekeeper `Notarized Developer ID`。装订改变了 DMG 字节，`latest-mac.yml` 已按装订后的文件重写。本地 `release-artifacts` 只保留 `ZenCode-3.14.35-mac-arm64.dmg`，SHA-256 `c903dabfbf67d1a6dcd32fed404cde9b0f7386a0394c8a0f0c19be9807a87815`。
- Windows package run `38997664559` 与 Linux packages run `38997668721` 成功。安装验收 run `39000167446` 覆盖 Windows x64/ARM64、Linux amd64/arm64 deb 和 x86_64/aarch64 rpm，全部通过。公开资产摘要与本地文件一致后，替换了 `v3.14.35` 的安装包、blockmap 和更新清单，并保持该版本为 GitHub Latest。
- Windows x64 SHA-256 `f1607bfcf71bd52696e3248a72eea4283807a65945aea7a3438fe95003303da9`，ARM64 `9f434e8987d0bc080dc498df7bc18a2fa4ebf83d8e1e00a791b24d2f66723ab3`。Linux amd64 deb `0564cfaf6a45b8a01a304d8b8f3fd6b83c03eb0147394d266e5e917ebd5aa3c8`，arm64 deb `96e576d23a45693b723721652089f27721267cb35ba71e9cde1d1b7b1f5a4efd`，x86_64 rpm `bf9445c0117a28fb2e1174ca873da4fcb89f9a1890fe6e3de9361bee3a6c7ff8`，aarch64 rpm `25f7fdcce7e90acb18528ac5643215f84e0ff49dd11a89a468d7152971ad45f8`。
