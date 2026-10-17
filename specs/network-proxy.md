# 网络代理

## 行为

设置页只有一个代理模式，取值 `auto`、`manual`、`direct`。它决定模型、MCP、命令工具、Host API 和桌面渲染层的出口。内置浏览器使用同一模式。

- `auto`：读取本机系统代理，macOS、Windows、Linux 走各自的系统设置，不读另一端的配置格式。macOS 读系统网络代理。Windows 读当前用户的 Internet 设置（`HKCU\...\Internet Settings` 的 `ProxyEnable` / `ProxyServer` / `ProxyOverride`），查询使用 `SystemRoot\System32\reg.exe`。Linux 先读 GNOME `org.gnome.system.proxy`，再读 KDE `kioslaverc`，桌面设置都没有时再读 systemd 用户环境，最后才读进程环境变量 `all_proxy` / `https_proxy` / `http_proxy`。同时存在 HTTP(S) 和 SOCKS 时优先 HTTP(S)，因为 Clash Verge 的混合端口走 HTTP。只有 SOCKS 时使用 `socks5://`，以覆盖 Shadowsocks 常见的本地端口。没有发现可用代理时直连，不把请求判失败。
- `manual`：使用设置里填写的地址。接受 `http`、`https`、`socks5`、`socks5h`、`socks4`、`socks4a`、`socks`，可带用户名和密码。裸 `host:port` 视为 HTTP。三个平台的填写方式相同。
- `direct`：不走代理，也不再读取系统代理。这是从自动模式手动切回的方式。

设置页在自动和手动模式下都显示代理地址。「检测并填写」调用同一套三平台发现，把发现的地址写成手动代理并立即生效；系统有例外主机时一并写入绕过列表。没有发现时不改已保存的地址。用户也可以不检测，直接改地址后保存，保存后同样变为手动。

旧配置没有模式字段时：已经填了地址的视为 `manual`，空白视为 `auto`。

`ss://`、`ssr://`、`vmess://`、`vless://`、`trojan://` 是服务器链接，不是本机出口。手动填入时 Host 拒绝该请求并说明原因；渲染层不把这种链接写进 Chromium 代理规则。用户应在 Clash Verge、Shadowsocks 等客户端打开系统代理，或填写它的本地 HTTP/SOCKS 端口，例如 `http://127.0.0.1:7897`、`socks5://127.0.0.1:1080`。

绕过列表仍由 `httpProxyNoProxy` 保存。自动模式下若用户没填绕过列表，则沿用系统代理自己的例外主机。

## 所有者与生效

`httpProxyMode`、`httpProxy`、`httpProxyNoProxy` 只存在 AppSettings。系统代理发现不落盘。

桌面渲染层在保存后立刻按模式调用 Chromium 代理：自动用系统解析，手动用固定规则，直连用 direct。Host 每次请求重新读取设置；自动模式的系统代理发现缓存 5 秒。已经启动的 Agent 在下次启动时拿到同一套结果。WSL 远端沿用这条已解析的地址，既有回环地址改写保持不变。

发现失败或命令不存在时视为没有系统代理，流量直连。手动地址无法解析时，Host 拒绝该请求，不偷偷改走直连。
