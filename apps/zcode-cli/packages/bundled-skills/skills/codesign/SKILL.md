---
name: codesign
description: Create editable prototypes, posters, reports and slides for ZenCode CoDesign with AI image plans, scoped comments and token tweaks. Use for 协同设计, CoDesign, posters, visual reports and interactive prototypes.
---
# ZenCode CoDesign

Create a local, editable design artifact using the user's existing workspace and Write/Edit permissions. Read workspace DESIGN.md first. Do not overwrite an unrelated file or bypass selected-file restrictions. No separate API key or account is needed for CoDesign UI image generation.

1. Clarify the brief from available context: goal, audience, format (prototype/poster/report/slides), design tokens, constraints. Use `zencode_mark_progress` if available to report actual milestones.
2. Read `schema.json` beside this skill. Use normal file tools to write a `.zencode-design.json` artifact matching that schema. Include one complete `<!doctype html><html>...<body>...</body></html>` document. Use inline CSS/JavaScript, local interactions, inline SVG; no external scripts, network requests, credentials or local paths in HTML. Never claim a backend is live when its data is simulated.
3. Describe images as plans in `codesign.images` (max 8), with IDs, prompts, purposes, ratios and alt text. Reference each image via `{{IMAGE:id}}` in HTML. Do not invent generated asset URLs or claim pending images already exist. The user imports this design in 创作 → 协同设计 and clicks AI 配图; ZenCode uses its configured internal image model. Paid image generation requires that explicit UI action; this skill does not have a secret image tool.
4. Expose useful existing CSS variables through `codesign.tweaks`: color values are #RRGGBB; finite numeric values must respect min/max and unit. Bind those tokens to real styles. Editing a value must not redesign other parts of the artifact.
5. Scoped comments target `data-zencode-design-id="zc-N"` elements. Preserve unrelated layout and elements. Keep source and derived controls aligned.
6. Validate JSON and schema before handing it off. Return the exact workspace-relative artifact path and explain import, pending image plans and supported exports. Use existing presentation/document tools for binary PPTX/PDF only when available; never rename HTML to pretend it is another file type.

The desktop UI and this bundled capability use the same version=1 schema. The JSON contains design content only; never include an API key, authorization header, workspace context snapshot or private environment data.
