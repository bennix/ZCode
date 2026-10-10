# Linux 安装包发布转存

GitHub Actions 是 Linux deb/rpm 的构建与验收所有者；发布草稿只接收结论为 success、来源为本仓库 main 分支的 `Linux packages` run 所产出的安装包。转存任务从指定 run 取 `zencode-linux-arm64` 归档，检查四个文件条件：文件存在、版本为 3.14.26、扩展名为 deb/rpm、架构标记为 arm64/aarch64，然后上传至仍为草稿的 `v3.14.26`。任一条件失败即停止，草稿不公开。已上传资产以 GitHub SHA-256 和本地/CI 文件哈希核对。

事件顺序：发布者指定成功的 CI run → GitHub API 校验来源与结论 → 下载 CI artifact → 校验文件 → 上传 GitHub 草稿 → 发布者确认全平台资产齐全并公开。CI artifact 不是长期发布入口；GitHub Release 是公开软件包唯一入口。

Windows x64/arm64 同样从本仓库 main 分支结论为 success 的 `Windows package` run 转存，各架构只接受对应的 `ZenCode-3.14.26-win-<arch>.exe`；构建、首次启动和 UIA 操作全部通过后，该 run 才产生可转存 artifact。草稿公开前须同时有两个 Windows 安装器。
