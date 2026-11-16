import { ENGINEERING_PLUGIN_DEFINITION } from "./engineering-plugin-definition.js";
import type { OfficialPluginDefinition } from "./official-plugin-definitions.js";

export const KNOWLEDGE_PLUGIN_DEFINITIONS: readonly OfficialPluginDefinition[] = [
  {
    "name": "knowledge-sales",
    "version": "2.1.0",
    "listing": {
      "displayName": "Sales & CRM",
      "displayName_i18n": {
        "zh-CN": "销售与客户"
      },
      "description_i18n": {
        "zh-CN": "引导式销售与客户工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-sales-plugin",
      "../knowledge-sales-plugin",
      "../../knowledge-sales-plugin",
      "../../../knowledge-sales-plugin"
    ],
    "requiredSeedPaths": [
      "skills/account-research/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-marketing",
    "version": "1.2.0",
    "listing": {
      "displayName": "Marketing",
      "displayName_i18n": {
        "zh-CN": "营销与内容"
      },
      "description_i18n": {
        "zh-CN": "引导式营销与内容工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-marketing-plugin",
      "../knowledge-marketing-plugin",
      "../../knowledge-marketing-plugin",
      "../../../knowledge-marketing-plugin"
    ],
    "requiredSeedPaths": [
      "skills/content-creation/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-customer-support",
    "version": "1.3.0",
    "listing": {
      "displayName": "Customer Support",
      "displayName_i18n": {
        "zh-CN": "客户支持"
      },
      "description_i18n": {
        "zh-CN": "引导式客户支持工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-customer-support-plugin",
      "../knowledge-customer-support-plugin",
      "../../knowledge-customer-support-plugin",
      "../../../knowledge-customer-support-plugin"
    ],
    "requiredSeedPaths": [
      "skills/customer-escalation/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-product-management",
    "version": "1.2.0",
    "listing": {
      "displayName": "Product Management",
      "displayName_i18n": {
        "zh-CN": "产品管理"
      },
      "description_i18n": {
        "zh-CN": "引导式产品管理工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-product-management-plugin",
      "../knowledge-product-management-plugin",
      "../../knowledge-product-management-plugin",
      "../../../knowledge-product-management-plugin"
    ],
    "requiredSeedPaths": [
      "skills/write-spec/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-productivity",
    "version": "1.3.1",
    "listing": {
      "displayName": "Productivity",
      "displayName_i18n": {
        "zh-CN": "效率管理"
      },
      "description_i18n": {
        "zh-CN": "引导式效率管理工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-productivity-plugin",
      "../knowledge-productivity-plugin",
      "../../knowledge-productivity-plugin",
      "../../../knowledge-productivity-plugin"
    ],
    "requiredSeedPaths": [
      "skills/start/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-data",
    "version": "1.1.0",
    "listing": {
      "displayName": "Data Analysis",
      "displayName_i18n": {
        "zh-CN": "数据分析"
      },
      "description_i18n": {
        "zh-CN": "引导式数据分析工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-data-plugin",
      "../knowledge-data-plugin",
      "../../knowledge-data-plugin",
      "../../../knowledge-data-plugin"
    ],
    "requiredSeedPaths": [
      "skills/analyze/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-finance",
    "version": "1.3.0",
    "listing": {
      "displayName": "Finance",
      "displayName_i18n": {
        "zh-CN": "财务分析"
      },
      "description_i18n": {
        "zh-CN": "引导式财务分析工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-finance-plugin",
      "../knowledge-finance-plugin",
      "../../knowledge-finance-plugin",
      "../../../knowledge-finance-plugin"
    ],
    "requiredSeedPaths": [
      "skills/financial-statements/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-legal",
    "version": "1.3.0",
    "listing": {
      "displayName": "Legal",
      "displayName_i18n": {
        "zh-CN": "合同与法律"
      },
      "description_i18n": {
        "zh-CN": "引导式合同与法律工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-legal-plugin",
      "../knowledge-legal-plugin",
      "../../knowledge-legal-plugin",
      "../../../knowledge-legal-plugin"
    ],
    "requiredSeedPaths": [
      "skills/review-contract/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-bio-research",
    "version": "1.2.0",
    "listing": {
      "displayName": "Bio Research",
      "displayName_i18n": {
        "zh-CN": "生物研究"
      },
      "description_i18n": {
        "zh-CN": "引导式生物研究工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-bio-research-plugin",
      "../knowledge-bio-research-plugin",
      "../../knowledge-bio-research-plugin",
      "../../../knowledge-bio-research-plugin"
    ],
    "requiredSeedPaths": [
      "skills/scientific-problem-selection/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-enterprise-search",
    "version": "1.3.0",
    "listing": {
      "displayName": "Enterprise Search",
      "displayName_i18n": {
        "zh-CN": "企业搜索"
      },
      "description_i18n": {
        "zh-CN": "引导式企业搜索工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-enterprise-search-plugin",
      "../knowledge-enterprise-search-plugin",
      "../../knowledge-enterprise-search-plugin",
      "../../../knowledge-enterprise-search-plugin"
    ],
    "requiredSeedPaths": [
      "skills/search-strategy/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  {
    "name": "knowledge-cowork-plugin-management",
    "version": "0.2.2",
    "listing": {
      "displayName": "Plugin Customization",
      "displayName_i18n": {
        "zh-CN": "插件定制"
      },
      "description_i18n": {
        "zh-CN": "引导式插件定制工作流程，按需启用专业技能与连接器。"
      },
      "category": "productivity",
      "author": {
        "name": "Anthropic",
        "url": "https://github.com/anthropics/knowledge-work-plugins"
      }
    },
    "rootCandidates": [
      "packages/knowledge-cowork-plugin-management-plugin",
      "../knowledge-cowork-plugin-management-plugin",
      "../../knowledge-cowork-plugin-management-plugin",
      "../../../knowledge-cowork-plugin-management-plugin"
    ],
    "requiredSeedPaths": [
      "skills/cowork-plugin-customizer/SKILL.md",
      "LICENSE"
    ],
    "runtimeTopLevelPaths": [
      "ZENCode-NOTICE.md",
      "LICENSE"
    ]
  },
  // 工程插件是独立数组项，必须与前一个专业插件以逗号分隔。
  ENGINEERING_PLUGIN_DEFINITION,
];
