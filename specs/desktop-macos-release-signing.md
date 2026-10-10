# macOS 发布签名与公证

Developer ID 发布包的签名所有者是 Desktop `afterPack` 与 electron-builder。`afterPack` 在主 App 签名前扫描 `Contents/Resources/code-workbench`、`glm`、`tools` 下的 Mach-O 文件，按文件 magic 而非扩展名识别，只对这些原生可执行文件逐个加 Developer ID、hardened runtime 和安全时间戳。普通 PNG、脚本和文本不签名。electron-builder 随后跳过这三个已经处理的目录，签主 App 与框架并封存资源。任一内层签名失败阻止出包；时间戳服务短暂不可用可有限重试，但不能关掉时间戳或公证门禁。

```text
afterPack 复制运行时 → 扫描三个资源目录 → 逐个签 Mach-O → electron-builder 签主 App
→ codesign deep/strict → Apple notarization → staple DMG → stapler/spctl 验证 → 发布
```

验收：扫描包含无扩展名 `OpenComputerUse`、bfs/rg/ugrep、工作台 Node 和 `.node`，排除伪装成可执行文件的 PNG；最终 `codesign --verify --deep --strict` 通过。公证若报告任何 `Invalid` 原生文件，则视为整包失败，修复后必须重新构建、重新提交，不复用被拒 DMG。发布目录和 GitHub 仅保留最新的已公证 DMG；未签名或已拒包不能作为下载入口。

下一版品牌修正发布时，源码 tag、根包版本、Windows/Linux 构建及安装验收工作流、安装包文件名必须一致。先完成跨平台构建与安装验收，再晋升公开资产；Mac DMG 公证及装订验证通过后才替换本地留存的上一版 DMG。发布失败时保留最后一份已公证 DMG，并且不把失败候选设为 Latest。
