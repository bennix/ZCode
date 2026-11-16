import type { OfficialPluginDefinition } from "./official-plugin-definitions.js";
export const ENGINEERING_PLUGIN_DEFINITION: OfficialPluginDefinition = {
  "name": "knowledge-engineering",
  "version": "0.6.16",
  "listing": {
    "displayName": "Engineering Lifecycle",
    "displayName_i18n": {
      "zh-CN": "工程开发流程"
    },
    "description_i18n": {
      "zh-CN": "需求、规划、实现、测试、审查与发布的引导式工程流程，含 25 个技能。"
    },
    "category": "developer-tools",
    "author": {
      "name": "Addy Osmani",
      "url": "https://github.com/addyosmani/agent-skills"
    }
  },
  "rootCandidates": [
    "packages/knowledge-engineering-plugin",
    "../knowledge-engineering-plugin",
    "../../knowledge-engineering-plugin",
    "../../../knowledge-engineering-plugin"
  ],
  "requiredSeedPaths": [
    "skills/using-agent-skills/SKILL.md",
    "skills/shipping-and-launch/SKILL.md",
    "commands/ship.md",
    "references/accessibility-checklist.md",
    "LICENSE"
  ],
  "runtimeTopLevelPaths": [
    "LICENSE",
    "ZENCode-NOTICE.md",
    "references"
  ]
};
