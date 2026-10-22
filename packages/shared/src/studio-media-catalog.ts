/* eslint-disable max-lines -- Static provider model catalog; entries share one public schema. */
/** ZenMux 图片与视频目录。图片幅面于 2026-10-17 按模型页 api_protocols 与 Vertex/Images 文档核对；视频协议/比例/时长于 2026-10-23 按官网 api_info 与订阅实测复核。 */

export interface ImageCatalogEntry {
  id: string;
  name: string;
  protocol: "gemini" | "vertex";
  reference: "none" | "optional" | "required";
  ratioKind: "aspect" | "size";
  /** 缺省时 aspect 发 aspectRatio，size 发 imageSize。none 表示模型拒绝显式幅面。 */
  ratioParameter?: "aspectRatio" | "imageSize" | "size" | "none";
  ratios: readonly string[];
}

export interface VideoCatalogEntry {
  id: string;
  name: string;
  ratios: readonly string[];
  durations: readonly number[];
  protocol: "vertex" | "native" | "interactions";
  defaultResolution?: string;
}

export const IMAGE_CATALOG: readonly ImageCatalogEntry[] = [
  {
    "id": "google/gemini-2.5-flash-image",
    "name": "Gemini 2.5 Flash Image (Nano Banana)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "klingai/kling-v2",
    "name": "Kling-v2",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "z-ai/glm-image",
    "name": "GLM-Image",
    "protocol": "vertex",
    "reference": "none",
    "ratioKind": "aspect",
    "ratioParameter": "aspectRatio",
    "ratios": [
      "1:1"
    ]
  },
  {
    "id": "bfl/flux-2-flex",
    "name": "FLUX.2 Flex",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "bfl/flux-2-max",
    "name": "FLUX.2 Max",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "bfl/flux-2-pro",
    "name": "FLUX.2 Pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "qwen/qwen-image-2.0-pro",
    "name": "Qwen-Image-2.0-Pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "qwen/qwen-image-2.0",
    "name": "Qwen-Image-2.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "bytedance/doubao-seedream-5.0-lite",
    "name": "Doubao-Seedream-5.0-lite",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "openai/gpt-image-2",
    "name": "GPT-Image-2",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "1920x1080",
      "1080x1920",
      "2048x1152",
      "2048x2048",
      "1536x2048",
      "2048x1536",
      "2560x1440",
      "3840x2160",
      "2160x3840"
    ]
  },
  {
    "id": "tencent/hy-image-v3.0",
    "name": "HY-Image-V3.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratioParameter": "aspectRatio",
    "ratios": [
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16"
    ]
  },
  {
    "id": "google/gemini-3.1-flash-image",
    "name": "Nano Banana 2 (Gemini 3.1 Flash Image)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "4:5",
      "5:4",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "9:16",
      "16:9",
      "21:9",
      "1:4",
      "4:1",
      "1:8",
      "8:1"
    ]
  },
  {
    "id": "google/gemini-3-pro-image",
    "name": "Nano Banana Pro (Gemini 3 Pro Image)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "4:5",
      "5:4",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "9:16",
      "16:9",
      "21:9",
      "1:4",
      "4:1",
      "1:8",
      "8:1"
    ]
  },
  {
    "id": "google/gemini-3.1-flash-lite-image",
    "name": "Nano Banana 2 Lite (Gemini 3.1 Flash-Lite Image)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "4:5",
      "5:4",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "9:16",
      "16:9",
      "21:9",
      "1:4",
      "4:1",
      "1:8",
      "8:1"
    ]
  },
  {
    "id": "bytedance/doubao-seedream-5.0-pro",
    "name": "Doubao-Seedream-5.0-pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "openai/gpt-image-1.5",
    "name": "GPT-Image-1.5",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "imageSize",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536"
    ]
  },
  {
    "id": "qwen/qwen-image-3.0-pro",
    "name": "Qwen-Image-3.0-Pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "qwen/qwen-image-3.0",
    "name": "Qwen-Image-3.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "sapiens-ai/agnes-image-2.1-flash",
    "name": "Agnes Image 2.1 Flash",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratioParameter": "aspectRatio",
    "ratios": [
      "1:1",
      "3:4",
      "4:3",
      "16:9",
      "9:16",
      "2:3",
      "3:2",
      "21:9"
    ]
  },
  {
    "id": "klingai/kling-v3",
    "name": "Kling-v3",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "meta/muse-image-1.0",
    "name": "Muse Image 1.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "imageSize",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536"
    ]
  },
  {
    "id": "x-ai/grok-imagine-image-2.0",
    "name": "Grok Imagine Image 2.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "imageSize",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536"
    ]
  },
  {
    "id": "openai/gpt-image-2.5-sunburst",
    "name": "GPT-Image-2.5-Sunburst",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536"
    ]
  },
  {
    "id": "openai/gpt-image-2.5-flare",
    "name": "GPT-Image-2.5-Flare",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536"
    ]
  },
  {
    "id": "inclusionai/llada-image-turbo",
    "name": "LLaDA-Image-Turbo",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratioParameter": "size",
    "ratios": [
      "auto",
      "512x512",
      "1024x1024"
    ]
  },
  {
    "id": "inclusionai/ming-image-0.1-design",
    "name": "Ming Image 0.1 Design",
    "protocol": "gemini",
    "reference": "none",
    "ratioKind": "size",
    "ratioParameter": "none",
    "ratios": [
      "auto"
    ]
  },
  {
    "id": "inclusionai/ming-image-0.1-design-layer",
    "name": "Ming Image 0.1 Design Layer",
    "protocol": "gemini",
    "reference": "required",
    "ratioKind": "size",
    "ratioParameter": "none",
    "ratios": [
      "auto"
    ]
  }
];

export const DEFAULT_STUDIO_VIDEO_MODEL = "google/veo-3.1-fast-generate-001";

/** 2026-10-23 实测未通过的历史内置项；失败不代表供应商永久不可用。 */
export const RETIRED_STUDIO_VIDEO_MODEL_IDS: readonly string[] = [
  "bytedance/doubao-seedance-1.5-pro",
  "sapiens-ai/agnes-video-v2.0"
];

export const VIDEO_CATALOG: readonly VideoCatalogEntry[] = [
  {
    "id": "klingai/kling-3.0",
    "name": "Kling-3.0",
    "protocol": "native",
    "ratios": [
      "16:9",
      "1:1",
      "9:16",
      "smart"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "720p"
  },
  {
    "id": "klingai/kling-3.0-omni",
    "name": "Kling-3.0-Omni",
    "protocol": "native",
    "ratios": [
      "16:9",
      "1:1",
      "9:16",
      "smart"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "720p"
  },
  {
    "id": "klingai/kling-3.0-turbo",
    "name": "Kling-3.0-Turbo",
    "protocol": "native",
    "ratios": [
      "16:9",
      "1:1",
      "9:16",
      "smart"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "720p"
  },
  {
    id: "minimax/minimax-h3-fast",
    name: "MiniMax H3 Fast",
    protocol: "native",
    ratios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    defaultResolution: "480p",
  },
  {
    "id": "google/veo-3.1-fast-generate-001",
    "name": "Veo 3.1 Fast",
    "protocol": "vertex",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      4,
      6,
      8
    ],
    "defaultResolution": "720p"
  },
  {
    "id": "google/veo-3.1-lite-generate-001",
    "name": "Veo 3.1 Lite",
    "protocol": "vertex",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      4,
      6,
      8
    ],
    "defaultResolution": "720p"
  },
  {
    "id": "google/veo-3.1-generate-001",
    "name": "Veo 3.1",
    "protocol": "vertex",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      4,
      6,
      8
    ],
    "defaultResolution": "720p"
  },
  {
    "id": "minimax/minimax-h3-max",
    "name": "MiniMax H3 Max",
    "protocol": "native",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "480p"
  },
  {
    "id": "google/gemini-omni-1.1-flash-preview",
    "name": "Gemini Omni 1.1 Flash Preview",
    "protocol": "interactions",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ]
  },
  {
    "id": "alibaba/wan3.0-video",
    "name": "Wan3.0-Video",
    "protocol": "native",
    "ratios": [
      "adaptive",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30
    ],
    "defaultResolution": "480p"
  },
  {
    "id": "alibaba/wan3.0-video-prime",
    "name": "Wan3.0-Video-Prime",
    "protocol": "native",
    "ratios": [
      "adaptive",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30
    ],
    "defaultResolution": "480p"
  },
  {
    "id": "pixverse/c1",
    "name": "C1",
    "protocol": "native",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "360p"
  },
  {
    "id": "pixverse/v6",
    "name": "V6",
    "protocol": "native",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "360p"
  },
  {
    "id": "bytedance/doubao-seedance-2.5",
    "name": "Doubao-Seedance-2.5",
    "protocol": "vertex",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
      "smart"
    ],
    "durations": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30
    ],
    "defaultResolution": "480p"
  },
  {
    "id": "bfl/flux-3-video",
    "name": "FLUX.3 Video",
    "protocol": "native",
    "ratios": [
      "21:9",
      "2:1",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
      "smart"
    ],
    "durations": [
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20
    ],
    "defaultResolution": "hd"
  },
  {
    "id": "minimax/minimax-h3",
    "name": "MiniMax H3",
    "protocol": "native",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "480p"
  },
  {
    "id": "google/gemini-omni-flash-preview",
    "name": "Gemini Omni Flash Preview",
    "protocol": "interactions",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ]
  },
  {
    "id": "alibaba/happyhorse-1.0",
    "name": "HappyHorse 1.0",
    "protocol": "vertex",
    "ratios": [
      "16:9",
      "9:16",
      "1:1",
      "4:3",
      "3:4"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "720p"
  },
  {
    "id": "skyreels/skyreels-v4",
    "name": "V4",
    "protocol": "vertex",
    "ratios": [
      "16:9",
      "9:16",
      "4:3",
      "1:1",
      "3:4"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "bytedance/doubao-seedance-2.0",
    "name": "Doubao-Seedance-2.0",
    "protocol": "vertex",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
      "smart"
    ],
    "durations": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ],
    "defaultResolution": "480p"
  }
];

export const CUSTOM_IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export const CUSTOM_VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
export const CUSTOM_VIDEO_DURATIONS = [4, 5, 6, 8, 10] as const;
