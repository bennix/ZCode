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

### 2026-10-17 同版四平台再次重建

- 从已推送提交 `1a33f25374925a720bc83953ed65f7bb6ef6d847` 再次重建四个下载平台：macOS Apple Silicon、Windows x64/ARM64、Linux x64、Linux ARM64。该提交相对公开 Release target `d29d32f1ab05171e5a70b4127dbf77a7e7ee795e` 只记录上一轮安装包摘要。工作区中未提交的创作设计、代理和模型探测改动没有进入这些安装包。
- 新 DMG 公证 `bce777b2-be8e-48ec-b96c-2ac7208d84ef` 与 ZIP 公证 `3af9a194-a2f5-4659-9af4-7f0a12e09b35` 均为 Accepted。DMG 已装订，挂载后的 App 通过 Gatekeeper `Notarized Developer ID`，`codesign --verify --deep --strict` 通过。装订改变了 DMG 字节，`latest-mac.yml` 与 DMG blockmap 已按装订后的文件重写。本地 `release-artifacts` 只保留 `ZenCode-3.14.35-mac-arm64.dmg`，SHA-256 `4c20c457aaa4a5ef12cc10c12eb0ad4d3083c6db0b68b77cc91ae31c02d504fb`。
- Windows package run `39021035176` 与 Linux packages run `39021038005` 成功。安装验收 run `39022600450` 覆盖 Windows x64/ARM64、Linux amd64/arm64 deb 和 x86_64/aarch64 rpm，全部通过。公开资产摘要与本地文件一致后，替换了 `v3.14.35` 的安装包、blockmap 和更新清单，并保持该版本为 GitHub Latest。
- Windows x64 SHA-256 `1b4f05b065dea6d096a31b7d311a6c586411f5f9a062c50888f54001d7b45a55`，ARM64 `05d778a9c0cccc7bf4879469808667a79fe3bf75c1e9a8d4b657c3a653dceafa`。Linux amd64 deb `866c29ec7f753f9a737f92f73a45a87a242837de90d2e2255cdf903f40e3755b`，arm64 deb `dc2356bdd3403c6d41362acb52ea900548fdd1c013d1cdaf6b0dd39f8c3c6e33`，x86_64 rpm `0753e7848783e781365a5de82715002416938e95d8cef5b6b41f4052581bbc25`，aarch64 rpm `f8e1d6acbaafec434082dec68d4691fa77d45047be9d1f438328fb1f32145952`。

### 2026-10-17 带网络代理的同版四平台重建

- 从提交 `f6b608dcea882acddbe96c7a4250a4652f140958` 重建四个下载平台，使正式安装包包含网络代理：自动、手动、直连。macOS DMG 与 Windows、Linux 安装包来自同一提交。未提交的创作设计和模型探测改动没有进入这些安装包。
- 新 DMG 公证 `5af7b88f-87b2-48b6-82b7-6da0ee4ca6f7` 与 ZIP 公证 `f2e8a19c-5a9e-43b9-941c-fef1c4db58a4` 均为 Accepted。DMG 已装订，挂载后的 App 通过 Gatekeeper `Notarized Developer ID`，`codesign --verify --deep --strict` 通过，安装包内含 `httpProxyMode`。本地 `release-artifacts` 只保留 `ZenCode-3.14.35-mac-arm64.dmg`，SHA-256 `e4ece75b69ffab5516fafe281f01bac970d748df8b77ebef3c0591016d72f1ee`。
- Windows package run `39025041169` 与 Linux packages run `39025043859` 成功。安装验收 run `39027015535` 全部通过。公开资产摘要与本地文件一致后，替换了 `v3.14.35` 的安装包、blockmap 和更新清单，并保持该版本为 GitHub Latest。
- Windows x64 SHA-256 `31835b937e575147201b94f0a35d22f66c34eed08443c8b9b607994a4ca49201`，ARM64 `7aa49dcd1db3876b5af1f76aba76576bac5cbdf4ebb06f0165d3450af06eeabe`。Linux amd64 deb `5c7c4f89a8a01190e4cbb3e1062eedb5c5e89b9b5a7cb948e9e5a6496dc9fd3f`，arm64 deb `d3386ea9e500ded0938666a7b9b531a14b2d224eda36190471b1b2721d07a14b`，x86_64 rpm `eb667ac2f44d071e90e8f90a603e20f1a95096f49ec325c90ee2e0e2fc667a78`，aarch64 rpm `0a7f0a54c907b01cd8b98770f702ae0e5e0e433865cc5e92b6e16c4773ac8192`。

### 2026-10-17 恢复姿态、参考脸与服饰的同版四平台重建

- 从提交 `c81936749df57dd74ba612d5fd6fb026a00cb2c1` 重建四个下载平台。正式安装包恢复 Studio 姿态人偶、人物外貌参考和服饰参考，并保留上一轮网络代理。macOS DMG 与 Windows、Linux 安装包来自同一提交。未提交的模型探测改动没有进入这些安装包。
- 新 DMG 公证 `81f9988f-66ce-4bc2-9a1c-ad1eb2911d8b` 与 ZIP 公证 `52c07a69-3dab-4b69-8dd8-346b025b5310` 均为 Accepted。DMG 已装订，挂载后的 App 通过 Gatekeeper `Notarized Developer ID`，`codesign --verify --deep --strict` 通过，安装包内含姿态、人物外貌和服饰入口。本地 `release-artifacts` 只保留 `ZenCode-3.14.35-mac-arm64.dmg`，SHA-256 `02de43419cab4c31e15826e00647c875638244bdad438ecd69e68b40fbedc561`。
- Windows package run `39028684177` 与 Linux packages run `39028687151` 成功。安装验收 run `39030385398` 全部通过。公开资产摘要与本地文件一致后，替换了 `v3.14.35` 的安装包、blockmap 和更新清单，并保持该版本为 GitHub Latest。
- Windows x64 SHA-256 `15fb72f899bb04f33f16c9b346e8afec7edeb9afa09da253811837f8fd733fb8`，ARM64 `eba33330219ce1122dbbc529d96e44a437fc9ef682d3728669ff1862d091afb5`。Linux amd64 deb `bd53978d4b9b9245c4ba2d0cb0fc91e9e772a5e9fbaea3a68dece9c190044630`，arm64 deb `79e0c87deba392f7c9157e3b502df08925d4abc2f1c87906bad2a03e19a7a349`，x86_64 rpm `7091095c23fc788857d8264fdd7b2bb61fa3acae0c97cc5bce72a2c64ced22af`，aarch64 rpm `19c1907da6f1370fc7bd897cded37eec8bb3bae918efd4891d8ca009e0039982`。

### 2026-10-18 生图幅面、拷贝与下载的同版四平台重建

- 从提交 `1d147f53293aee3be8dc7edf1e2bd82b4bb032e0` 重建四个下载平台。正式安装包按各生图模型使用自己的幅面，生成结果可以查看、缩放、平移、拷贝和下载，写提示词时带上场景图。其后的评估模型提交 `49d3924e` 没有进入这些安装包。
- 新 DMG 公证 `bdeaa1e7-794d-4602-a4e5-9e31493e88f5` 与 ZIP 公证 `d4ce2168-fb8c-4b84-95b1-0cde83f337f0` 均为 Accepted。DMG 已装订，挂载后的 App 通过 Gatekeeper `Notarized Developer ID`，`codesign --verify --deep --strict` 通过。本地 `release-artifacts` 只保留 `ZenCode-3.14.35-mac-arm64.dmg`，SHA-256 `6a7a1ca1453cda165bd228ef8c11b14954e9743fa56cb9d4ddce37c02eeb157f`。
- Windows package run `39036069339` 与 Linux packages run `39036072380` 成功。安装验收 run `39074008610` 全部通过。公开资产摘要与本地文件一致后，替换了 `v3.14.35` 的安装包、blockmap 和更新清单，并保持该版本为 GitHub Latest。
- Windows x64 SHA-256 `38524e0e10c7d2d7b8fe4e2fd258336e5ffc385ebf69feed17a5f6013d557c38`，ARM64 `1dc03df153ce5cd72affa29af143584ae93fca3084f62bbd1521de5f7869d0d5`。Linux amd64 deb `d71dbc3e108e42d54a99fb6aa5312aed686ac37c6ca1e2cc0ee11c603d13a249`，arm64 deb `349447cdc218570f104596a41e87fc04672d4b56861331ab23b7a08f59f22981`，x86_64 rpm `5586520fd7722c3b86134668af0a33f521a7649143c30a61d1c665a324317381`，aarch64 rpm `1f0dc47cca6574c63853c84e542b350d299b7164a3fe5b814e2e08e284ee4fd9`。


### 2026-10-23 媒体、提示词与 Computer Use 同版四平台重建

本轮以同一源码提交重建 macOS arm64、Windows x64/ARM64、Linux x64/ARM64 的 3.14.35。纳入可恢复的工具输出压缩、可见提示词复制、Windows/Linux 观察租约、20 个实测视频模型与各自时长、结构化错误提示和 Sora 专用安全规则。构建前重跑针对性测试、类型与架构检查；已有 lint 超限不得写成通过。Windows/Linux 候选包由 GitHub Actions 构建并执行原生 CUA 与安装验收；Mac 必须完成 Developer ID 签名、DMG/ZIP 公证、装订及 Gatekeeper 校验后才能刷新公开资产。所有产物核对 SHA-256，更新清单使用最终文件摘要；发布标签和 Release target 统一到此次构建提交。用户无关的本地未跟踪文件不进入源码提交。

本轮发布已完成：构建源码 `c2a34399798b8227c20be9edcf9abddc3de41914`；Windows 构建 `39865489201`、Linux 构建 `39865493718`（x64 因软件源慢下载重跑后通过），Windows 安装验收 `39868190326`、Linux 安装验收 `39870835996` 均成功。DMG 公证 `ac05de30-9704-458d-aeef-1ae5ea1527fc`、ZIP 公证 `f0a0d305-157f-4007-aeeb-d2aec7d5afcd` 均为 Accepted；DMG 已装订，挂载 App 通过深度签名、Gatekeeper 与 About E2E。全部 12 个公开资产的 SHA-256/大小与本地一致，两个更新清单下载后逐字节一致；Release tag 与 target 同步到构建源码并保持 Latest。安装验收的六个公开摘要常量同步刷新；审计/常量提交晚于构建，不改变软件来源。

本地只在 `release-artifacts` 保留最新已公证 `ZenCode-3.14.35-mac-arm64.dmg`，SHA-256 `38a002b8c7f1f4100f0e7c89e7bbacdc8e2d823ccbfacbfd0139254846e5d606`。根目录和 CLI 类型检查、针对性测试及架构检查通过；全量 lint 仍有既有超限错误，未写成通过。完整摘要与 CI 证据见 [发布审计](desktop-release-audit-2026-10-23.json)。

## 3.14.36 协同设计四平台发布（2026-10-26）

- 发布源为本轮协同设计工作区实现；Windows x64/ARM64 和 Linux x64/ARM64 由目标仓库 Actions 在同一源码 SHA 构建并安装验收，macOS arm64 本机 Developer ID 构建、公证、装订、Gatekeeper 验收。所有候选通过后更新正式 Release 与 Windows/macOS 更新清单，最后同步 Landing Page 中英文入口至公开版本。
- 仅在全验收通过后替换 `release-artifacts` 中上一份已公证 DMG；未成功的候选不得覆盖。
- Node 升级验收范围：桌面构建、CLI、Windows/Linux CI 均使用 Node 24.14.0；应用远程执行器也必须从 Node 22.16.0 升到 24.14.0（Linux/macOS x64/arm64）。4 种远程运行时需校验官方归档完整、Node 自报版本、node-pty 子进程与基本 Agent 启动，避免只更新构建机而让已部署远程 Host 继续运行旧 Node。增量构建遇到目标目录中版本不符的 node 时应替换后重建 manifest/hash。
- Node 24.14.0 兼容性验收：官方 Node 归档下载响应成功，macOS arm64 二进制 `--version` 返回 v24.14.0；本次暂存的 arm64 `pty.node` 在该 Node 下成功 spawn 并收到 `NODE24_PTY_OK`。x64 与 Linux arm64 归档来自对应 Node 官方版本路径；其安装/原生 CUA 检查由目标 CI 架构执行。构建中止过的 22.16.0 文件由版本检查识别并替换；四平台 manifest 将 node-runtime 指向 v24.14.0，并更新归档摘要。

- 发布边界补充：正式桌面应用通过 Electron 自报 Node v24.14.0；本地远程资源 manifest 也已升级，但生产 CDN 的 3.14.36 清单检查返回 404。没有部署成功证据前，Release/Landing Page 仅说明桌面 Node 版本，不宣称远程 Host 已自动升级。远程 CDN 发布入口待确认。

- 验收发现 OfficeCLI 1.0.152 的后台自动更新把可写 App 中的二进制替换为 1.0.158，造成 sealed resource 错误。此前公证候选不得发布。修复 launcher 和兼容导出统一强制 OFFICECLI_SKIP_UPDATE=1 后，各平台须重新构建；对新包实际执行 OfficeCLI 再复验完整 App 签名。
- 用户确认没有自有 CDN，采用自身 GitHub Release 发布远程组件（见 remote-release-distribution.md）。公开清单及组件完整性通过后才宣称远程运行时已可下载。

本轮 3.14.36 已正式发布为 Latest，源码 fa4b39c582c3c64920380db535c27dff1871afd5。全部 40 个资产摘要核验、六个 Windows/Linux 安装验收及七个公开安装包下载通过。最终 DMG/ZIP 公证均 Accepted，DMG 已装订，挂载 App 的签名、Gatekeeper、OfficeCLI 实际创建和验证 DOCX 后签名保持完整。公开 GitHub 远程清单及组件下载、哈希验证和 Node 24.14.0 / CLI 0.16.9 启动通过；实际 SSH/WSL 会话未测试。Landing Page 已部署，390/1440 宽度中英文切换、七个下载入口和无横向溢出检查通过。本地仅保留最新公证 DMG；类型与架构检查通过，全量 lint 仍有既有 max-lines 错误。完整证据见 [发布审计](desktop-release-audit-2026-10-26.json)。
