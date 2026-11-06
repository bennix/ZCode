# 自动代理发现补齐

代理选择由 resolveEffectiveAppProxy 统一拥有。manual 使用用户配置地址，direct 不启用代理，auto 调用 readSystemProxy。macOS 与 Windows 的原实现仅检查系统设置，系统未报告代理时漏掉进程环境中已配置的 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY。

auto 模式按系统设置优先、环境变量次之发现，保留 NO_PROXY；各平台都使用同一个已存在的 proxyFromEnv 解析与 URL 分类。现有显式 manual/direct 不因请求失败而被覆盖。禁止猜测本机端口、把订阅链接当代理或关闭 TLS 校验。

该路径在 Host API 每次请求及 Agent spawn 时读取。Agent 已运行进程中的网络快照不会被本次发现改动强行重启；重连计数本身不证明代理错误。测试覆盖 macOS/Windows 系统设置缺失时的环境发现、系统设置优先、manual/direct 优先级与原网络回归。
