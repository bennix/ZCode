---
name: ZenCode Operational Workspace
colors:
  surface: '#f8f8f8'
  surface-container: '#ffffff'
  surface-container-low: '#f0f0f0'
  on-surface: '#0d0d0d'
  primary: '#000000'
  inverse-surface: '#161616'
---
# ZenCode design brief

Derived from packages/ui/src/styles.css and DESIGN.md. Root DESIGN.md is authoritative; this brief does not introduce a second theme source.

## Atmosphere
Quiet, precise and readable. Distinct sidebar, working canvas and supporting panels give each task a stable place. Guide users through decisions without turning a productive desktop workspace into a promotional landing page.

## Palette and typography
Soft neutral canvas (#f8f8f8), white working surfaces (#ffffff), recessed navigation (#f0f0f0), ink text (#0d0d0d). Actual colors always come from semantic theme tokens, including dark and user-selected themes. Use existing local/system fonts for Chinese and English. Headings use text-ui-lg or xl and semibold weight; controls/body use text-ui-base; metadata uses caption/sm/xs. Never introduce remote font dependencies.

## Components
Flat primary actions, quiet secondary actions and clearly visible keyboard focus. Rounded-md controls, rounded-xl content groups, rounded-2xl dialogs. Elevation communicates overlay hierarchy, not decorative importance. Labels precede inputs; descriptions and errors remain adjacent. Resource counts are subordinate to titles. Dialogs retain Radix focus trapping and escape handling.

## Layout
Use the existing four-pixel spacing rhythm. Settings content has a max-w-4xl measure. Below sm, setting labels and controls stack; long English text wraps without hiding actions. Workspace panes remain independently resizable. Avoid perpetual motion; honor reduced-motion preferences and use color transitions only for shared controls.

## Guided workflows and localization
Ordinary conversation and WorkCoder have separate entry points. Keep the task objective, directory, model choices and next action legible. Preserve existing runtime state ownership. All visible text and accessible labels use the existing locale dictionaries; never fork locale state inside a component.

## Stitch generation prompts
- Refine a dense bilingual coding workspace with neutral layered surfaces, a restrained navigation rail, a readable conversation and an independent detail pane. Preserve all controls and current information hierarchy.
- Design a responsive model-settings form with labels above descriptions, aligned controls on desktop and stacked controls on narrow screens. Include loading, error, keyboard-focus and empty states.

Generate variants only when Stitch MCP is configured. Do not upload credentials, user conversations or local files implicitly. Validate against actual components in both themes and languages before adopting a generated design.
