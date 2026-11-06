# 设置文件损坏恢复与服务文件拆分

设置服务当前触发 max-lines（403 行，限制 400 行）。将损坏 JSON 的备份隔离职责移至同目录 settingsFileRecovery.ts，设置读写、迁移和写入队列仍由 settingService.ts 管理。

恢复 helper 接收设置文件路径、解析错误及原设置服务的日志回调，不缓存路径、不读取其他配置、不持有写队列。所有文件 IO 保持异步，保留原故障注入点与日志内容。

```mermaid
flowchart LR
  read[设置服务读取并重试 JSON 解析] -->|连续失败| recovery[恢复 helper 将原文件重命名备份]
  recovery --> defaults[设置服务返回默认值]
  defaults --> update[原写队列在后续更新时重建合法设置]
```

规则保持原实现。备份路径包含原文件名与时间戳；其他读取者已完成隔离导致 ENOENT 时正常返回；其他备份失败记录原日志并返回默认值。ISettingService 公共接口、正常读写、迁移条件、重试次数和等待时间保持一致。

验收从 createSettingService().get()/update() 正常入口执行。损坏文件经过重试后保留原内容备份，随后更新可创建合法配置。现有媒体设置迁移测试、typecheck、全仓 lint 与 changed architecture 检查须实际执行。
