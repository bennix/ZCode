/** BodyFactory 风格的参考隔离：每步只看到工作图与本步参考，避免身份和构图串用。 */
export type StudioReferenceKind = "general" | "body" | "face" | "clothing" | "scene";
export interface StudioReference {
  id: string;
  url: string;
  kind?: StudioReferenceKind;
  person?: number;
}
export function buildReferenceStages(references: readonly StudioReference[]) {
  return (["clothing", "scene", "face"] as const).flatMap((kind) =>
    references
      .filter((item) => item.kind === kind)
      .map((reference) => {
        const person = Math.min(5, Math.max(1, reference.person ?? 1));
        const preserve =
          "Image 1 is the working image. Edit it directly. Keep the number of people, pose, body proportions, camera and framing. No collage, duplicate people or comparison panels.";
        const instruction =
          kind === "clothing"
            ? `Replace only person ${person}'s clothing using image 2 as the clothing reference: cut, fabric, color and accessories. Preserve identity, face, hair, pose and background. Do not copy the reference person's face, body or background.`
            : kind === "scene"
              ? "Replace the ENTIRE background and ground of image 1 with the environment from image 2. Preserve all people, identity, pose and clothing. Match lighting, contact shadows and perspective to the new environment. Ignore people in image 2. Do not preserve the old background."
              : `Apply the identity from image 2 only to person ${person}'s face in image 1: facial features, hairline, hairstyle and age. Keep head scale and orientation, other people's identities, body, pose, clothes and environment. Do not copy image 2's composition.`;
        return { kind, reference, prompt: `${preserve}\n${instruction}` };
      }),
  );
}
export const SCENE_PROMPT_RULE =
  "The attached scene image is the background. The FINAL prompt must describe its location, ground, lighting and atmosphere. Do not replace that environment with a plain grey or empty studio backdrop. Do not copy people from the scene image.";

/** 讨论成稿时按附件顺序标注角色。场景图排在形体图之后，避免被当成姿态。 */
export function discussionReferenceCaptions(bodyCount: number, sceneCount: number): string[] {
  const captions: string[] = [];
  for (let index = 0; index < bodyCount; index += 1) {
    captions.push(
      `Image ${index + 1}: body or pose reference. It controls pose, proportions and the number of people only.`,
    );
  }
  for (let index = 0; index < sceneCount; index += 1) {
    captions.push(`Image ${bodyCount + index + 1}: background reference. ${SCENE_PROMPT_RULE}`);
  }
  return captions;
}

export const BODY_REFERENCE_RULE =
  "Body/pose references control only pose, proportions and relative positions. Convert mannequins into natural fully clothed real people with realistic skin, hair and anatomy. Preserve the intended number of people. One continuous scene, no turnarounds, duplicated limbs or multiple views. Face, clothing and scene references are applied in later isolated steps.";

export async function runReferenceStages(options: {
  initial: string;
  references: readonly StudioReference[];
  signal: AbortSignal;
  generate: (working: string, reference: StudioReference, prompt: string) => Promise<string>;
  onStage: (kind: "clothing" | "scene" | "face", index: number, total: number) => void;
}): Promise<string> {
  let working = options.initial;
  const stages = buildReferenceStages(options.references);
  for (const [index, stage] of stages.entries()) {
    options.signal.throwIfAborted();
    options.onStage(stage.kind, index + 1, stages.length);
    working = await options.generate(working, stage.reference, stage.prompt);
    options.signal.throwIfAborted();
  }
  return working;
}
