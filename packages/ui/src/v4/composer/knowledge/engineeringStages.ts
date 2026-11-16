export const engineeringStages = [
  { id: "spec", skill: "spec-driven-development", label: "stageSpec", hint: "stageSpecHint" },
  { id: "plan", skill: "planning-and-task-breakdown", label: "stagePlan", hint: "stagePlanHint" },
  { id: "build", skill: "incremental-implementation", label: "stageBuild", hint: "stageBuildHint" },
  { id: "test", skill: "test-driven-development", label: "stageTest", hint: "stageTestHint" },
  { id: "review", skill: "code-review-and-quality", label: "stageReview", hint: "stageReviewHint" },
  { id: "ship", skill: "shipping-and-launch", label: "stageShip", hint: "stageShipHint" },
] as const;
