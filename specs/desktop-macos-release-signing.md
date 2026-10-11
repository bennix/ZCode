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
