# ZenMux 官网复核及订阅 Key 实测（2026-10-23）

官网目录 21 个视频模型全部提交测试：20 个返回有效视频；Agnes 返回上游限流，暂不保留。另外复核旧 Seedance 1.5，返回 `404 / invalid_model`。当前内置目录更新为 20 个，新增 MiniMax H3 Fast，恢复本次验证成功的 Kling 三个型号。默认仍为已验证的 Veo 3.1 Fast。

来源：[模型列表](https://zenmux.ai/models?output_modalities=video)、模型页公开 `api_info` / `api_protocols`、[视频指南](https://zenmux.ai/docs/zh/guide/advanced/video-generation.html)、[原生接口](https://zenmux.ai/docs/zh/api/zenmux/generate-videos-native.html)、[Vertex 接口](https://zenmux.ai/docs/zh/api/vertexai/generate-videos.html)、[订阅指南](https://zenmux.ai/docs/zh/guide/subscription.html)、[错误码](https://zenmux.ai/docs/zh/guide/advanced/error-codes.html)。公开网页目录列出 21 个；`/api/v1/models` 返回其中 13 个，故不能只用后者筛选。

使用用户授权的订阅 Key，仅在进程内存中使用。中性英文旋转木方场景，无参考图，16:9，低分辨率，最短目录时长；既有项通过应用同一 request builder 构造。成功按协议真实视频字段验证，不以 HTTP 200 或 queued 判定。异步任务只查询同一 job；Omni 同步完成直接核对 model_output 视频内容。

| 模型                                   | 协议         | 官网时长（秒） | 实测秒数 | 结果                        |
| -------------------------------------- | ------------ | -------------- | -------- | --------------------------- |
| `klingai/kling-3.0-omni`               | native       | 3–15           | 3        | 返回有效视频                |
| `klingai/kling-3.0`                    | native       | 3–15           | 3        | 返回有效视频                |
| `klingai/kling-3.0-turbo`              | native       | 3–15           | 3        | 返回有效视频                |
| `alibaba/wan3.0-video`                 | native       | 2–30           | 2        | 返回有效视频                |
| `alibaba/wan3.0-video-prime`           | native       | 2–30           | 2        | 返回有效视频                |
| `pixverse/v6`                          | native       | 1–15           | 1        | 返回有效视频                |
| `pixverse/c1`                          | native       | 1–15           | 1        | 返回有效视频                |
| `bfl/flux-3-video`                     | native       | 5–20           | 5        | 返回有效视频                |
| `minimax/minimax-h3-max`               | native       | 5–15           | 5        | 返回有效视频                |
| `minimax/minimax-h3-fast`              | native       | 4–15           | 4        | 返回有效视频                |
| `minimax/minimax-h3`                   | native       | 4–15           | 4        | 返回有效视频                |
| `alibaba/happyhorse-1.0`               | vertex       | 3–15           | 3        | 返回有效视频                |
| `skyreels/skyreels-v4`                 | vertex       | 3–15           | 3        | 返回有效视频                |
| `google/veo-3.1-fast-generate-001`     | vertex       | 4, 6, 8        | 4        | 返回有效视频                |
| `google/veo-3.1-generate-001`          | vertex       | 4, 6, 8        | 4        | 返回有效视频                |
| `google/veo-3.1-lite-generate-001`     | vertex       | 4, 6, 8        | 4        | 返回有效视频                |
| `bytedance/doubao-seedance-2.0`        | vertex       | 4–15           | 4        | 返回有效视频                |
| `bytedance/doubao-seedance-2.5`        | vertex       | 4–30           | 4        | 返回有效视频                |
| `google/gemini-omni-1.1-flash-preview` | interactions | 3–10           | 3        | 返回有效视频                |
| `google/gemini-omni-flash-preview`     | interactions | 3–10           | 3        | 返回有效视频                |
| `sapiens-ai/agnes-video-v2.0`          | vertex       | 1–18           | 1        | 上游限流；不保留            |
| `bytedance/doubao-seedance-1.5-pro`    | vertex       | 当前目录无此项 | 4        | 404 / invalid_model；不保留 |

Agnes 终态为 `done: true`，`raiMediaFilteredCount: 1`，原因为 `Agnes API rate limit exceeded. Please try again later.`。这是上游限流，不是用户余额不足、订阅失效或内容违规。Kling 本次已成功，历史上游余额报错不能解释为用户余额不足或模型永久不可用。

官网指出订阅 Key 的 402 配额和账户余额是不同机制；404 还需区分套餐权限、模型标识和接口支持。订阅详情 Management API 仅接受 Management Key，本次未用普通订阅 Key 调用该接口。

OpenAI 官方 [视频生成限制](https://developers.openai.com/api/docs/guides/video-generation/) 已用于补充自定义 Sora 提示词规则；不把视频专属限制施加到图片模型，不宣称 ZenMux 当前目录提供 Sora。英文优先、安全拒绝拦截及不绕过审核规则继续保留。

验证：13 项单测通过；真实 StudioPanel 浏览器验证三协议、时长切换、手机布局、取消和只重查同一 job；根目录 typecheck 通过，目标 lint 无错误。全量 lint 仍被未修改的 settingService.ts 403 行超限阻塞（76 warnings / 1 error）。架构检查通过。未打包或安装桌面应用。

局限：只证明本 Key 在此次时点的最短文生视频组合可用；未逐一生成全部时长、比例及图生视频组合。报告不保存凭据、原始视频、签名 URL 或任务 ID。详见 [脱敏 JSON](studio-video-audit-2026-10-23.json)。
