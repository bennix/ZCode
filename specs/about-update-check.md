# About 检查更新

About 打开后复用 Main 的既有 updater 检查，显示当前安装版本以及检查状态、最新可用
版本或失败原因。按钮可再次检查；开发/禁用更新环境必须明确提示，不谎称最新版。
已下载的更新在 About 自动检查时只展示，不自动重启。安装仍要求点击重启更新。

Main updater 是唯一状态所有者；About 是订阅者，关闭即解除订阅。沿用平台/渠道、
签名、下载及安装机制，不建立第二个更新器。自定义 ZenCode 发布源由用户指定为 bennix/ZCode，
不得把原版仓库当作定制版本的默认发布源。About 的沙箱页只允许固定操作消息，
不接受网页提供的更新 URL 或可执行代码。

验收：当前版本显示、检查中禁用重复操作、新版本显示版本号、失败可重试、开发模式
有明确提示、下载进度/已下载展示、打开 About 不触发重启。UI 使用中英文文案。

## GitHub Releases 源

发布源唯一配置为 packages/desktop/update-source.json 的 repository（owner/repo）。
构建时写入 build-meta.json，运行时只读构建元数据，环境变量不允许改道正式包。
当前配置为 bennix/ZCode。未指定仓库时显示“未配置发布仓库”，不回退原版更新服务。使用 electron-updater 的
GitHub provider：版本比较、平台/架构资产选择、SHA512 和现有签名/安装检查均复用。
Release 需同时上传构建出的 latest\*.yml、zip/dmg 或 exe/AppImage 及 blockmap；
仅上传源码 zip 或 CI 临时 artifact 不构成自动更新发布。macOS 自动更新需签名。

macOS 公证会改写并装订最终 DMG，因此发布所有者必须在装订后重算 DMG 的 SHA-512 与字节数，再生成最终 `latest-mac.yml`；ZIP 的摘要也必须来自实际上传文件。Release 至少同时提供 `latest-mac.yml`、其引用的签名 ZIP 与已公证 DMG。上传前后分别校验 metadata 中每个 URL 对应的真实文件和 SHA-512。缺少 metadata 或摘要不符时，Release 不得宣称“检查更新”可用。验收从已安装正式 App 发起检查，应显示“已是最新”或真实较新版本，不出现找不到 `latest-mac.yml`。

Windows GitHub provider 使用一个 `latest.yml`。x64 与 ARM64 规范安装器都要列入 `files`，文件名包含架构，以便 electron-updater 按当前 `process.arch` 选择。摘要和字节数必须取自最终公开安装器；清单的主 `path`/`sha512` 指向 x64，两个架构的 URL 均须在 Release 中存在。发布后分别在 Windows x64、ARM64 已安装应用中从 About 发起检查，不能只检查 YAML 可下载。

## Linux DEB/RPM 边界

当前交付 Linux DEB/RPM，不交付 AppImage。`electron-updater` 的 Linux AppImage 更新器在没有 `APPIMAGE` 环境变量时会返回空结果且不发 `update-not-available` 事件；不能让 About 永远停在“检查中”，也不能显示“已是最新”作为没有执行请求的替代结果。Linux 包安装方式由系统包管理器负责，Main updater 应返回明确的“请通过安装来源或 GitHub Release 检查/安装更新”结果，About 的按钮恢复可操作状态。该结果的来源是本机包格式，不从 UI 推断。以后若引入 Linux 自动更新，先定义受信任的发布元数据、包管理器所有权与更新安装路径，再改此规则。

验收必须从两架构的已安装 DEB 以及 RPM 中打开 About、触发检查并看到确定结果；单测中的空 Promise 不代替已安装包验收。修复进入新的正式安装资产前，不得把源码或未发布候选的结果归给 3.14.28 公共包。
