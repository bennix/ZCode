/** 委员会的媒体安全约束，不替代供应商审核。 */
export function studioPromptSafetyRules(mediaModel: string): string {
  const common =
    "Review both the request and reference images. Do not produce sexual content involving minors, pornography, non-consensual intimate imagery, hateful imagery or graphic violence. Allow ordinary age-appropriate sports, family and school scenes involving children. Preserve the subject's stated age and identity. If the request cannot be fulfilled faithfully within these constraints, the final writer must emit a standalone line SAFETY_BLOCKED: followed by a brief reason in the user's language and may suggest a compliant alternative. Do not emit FINAL or ILLUSTRATE in that case. Do not hide disallowed content behind euphemisms or instruct a model to ignore safety policies.";
  // 修复依据：Sora 官方视频限制与图片审核不同，不能复用图片专用描述。
  if (/^openai\/sora(?:-|$)/u.test(mediaModel))
    return `${common} For OpenAI Sora video generation, only create content suitable for audiences under 18. Copyrighted characters and copyrighted music are rejected. Real people, including public figures, cannot be generated. Reference images with human faces and character uploads depicting human likeness are blocked. Respect these constraints without disguising identity, removing safeguards or automatically resubmitting a refusal.`;
  return mediaModel.startsWith("openai/")
    ? `${common} For OpenAI image models, both input and output are subject to content moderation. Keep descriptions neutral and non-sexual; do not sexualize people in reference images or add intimate body details. Do not lower moderation settings or promise acceptance. A safety refusal must be shown to the user, not automatically rewritten and resubmitted.`
    : common;
}

export function assertStudioPromptAllowed(text: string): void {
  // 修复：成稿拒绝时没有 FINAL，原 fallback 会把用户原始需求继续提交；先检查拒绝再进入生成路径。
  const blocked = /^[ \t]*SAFETY_BLOCKED:[ \t]*([^\r\n]*)/mu.exec(text);
  if (blocked)
    throw new Error(blocked[1]?.trim() || "该生成请求未通过提示词安全检查，请调整内容。");
}
