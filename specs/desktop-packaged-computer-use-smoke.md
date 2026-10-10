# 已打包桌面端 Computer Use 验收

发布流水线用真实打包程序验证首次启动：设置中的电脑控制开关默认关闭，插件页开关与其共享同一持久状态。测试只拥有临时用户目录、Electron 子进程及 CDP 会话；应用运行时拥有插件工作目录和其子进程。测试先关闭 CDP、终止 Electron，随后清理临时目录。Windows 在进程退出后短暂保留文件句柄时，清理允许有限重试；重试用尽仍报告错误。

Linux CI 的 Xvfb 环境没有正确配置 Electron SUID sandbox helper，因此该**测试进程**显式使用 `--no-sandbox`；发布程序默认启动方式不改变。测试必须等待 CDP 和首个窗口出现，失败时保留近期子进程输出以便判断是启动失败还是 UI 断言失败。

验收场景：macOS、Windows x64/arm64、Linux x64/arm64 的打包程序均可完成上述首次启动场景；Linux CI 不因 sandbox helper 权限误报产品失败，Windows CI 不因临时测试目录的短暂句柄占用误报产品失败。
