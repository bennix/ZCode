# ZenCode 自有品牌图标

## 产品规则与所有者

- ZenCode 的应用标识使用仓库现有的蓝底章鱼应用图标，不使用单独 Z 字母标志。提供方选择器仍可显示 ZenMux 的图标，因为它代表账户提供方；两者在 UI 中按用途区分。
- 桌面应用、Dock、窗口、托盘、安装程序、安装卷、首次启动、等待页、入门引导和应用内品牌入口保持同一图形。图标不包含 `worker` 字样。
- `packages/desktop/build/zenmux-icon.svg` 是当前蓝底章鱼主图源；已导出的 PNG、ICNS、ICO 和 Linux 尺寸图保持同一视觉。UI 复用现有 `public/icon_512@2x.png`，它与桌面主图像素一致；测试比较像素，防止编码格式差异造成假失败。
- 标志在 16px 可辨识；深浅主题下保持蓝底原色，不能把图标变成单色 Z 或单色章鱼。macOS 图标保留透明画布与安全留白。

## 接口、失败与迁移

- `build/icon.png` 为运行时主图；`build/icon.icns` 为 macOS app；`build/icon.ico` 为 Windows app 与托盘；`build/icons/*` 为 Linux；`build/icon_installer.*` 为安装程序/安装卷；Web `/favicon.ico` 同源。
- 内置源码 IDE 的空白水印从同一图源生成。已有缓存的品牌处理需幂等更新，不能留下上游默认水印。
- 与 OAuth、网站 favicon 相关的外部身份图标不替换。

## 验收

1. 所有图标尺寸 16–1024px 正确、有 alpha；ICNS 含 macOS 标准尺寸，ICO 含多种尺寸。
2. 首次安装 `.app` 的 Dock、欢迎页、关于窗口、更新及权限提示展示蓝底章鱼，无 Z 字母。Windows/Linux 对应包做相同检查。
3. UI 标志、源码 IDE 水印和打包主图图形一致；重复准备 IDE 缓存不会回到旧图。
