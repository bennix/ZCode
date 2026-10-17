import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { BONE_DEFS, BONE_NAMES } from "./bodyFactory/mannequin.js";
import { PRESETS } from "./bodyFactory/poses.js";
import { createPoseScene, type PoseGender, type PoseTool } from "./poseScene.js";

export function StudioPoseEditor({
  onCapture,
  onBind,
  disabled,
}: {
  onCapture: (image: Blob) => void;
  onBind?: (capture: (() => Promise<Blob>) | null) => void;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.pose.${key}` });
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createPoseScene> | null>(null);
  const onBindRef = useRef(onBind);
  onBindRef.current = onBind;
  const [count, setCount] = useState(1),
    [person, setPerson] = useState(0),
    [bone, setBone] = useState("shoulderL"),
    [tool, setToolMode] = useState<PoseTool>("rotate");
  const [view, setView] = useState({
    shape: {} as Record<string, number>,
    angles: [0, 0, 0],
    gender: "female" as PoseGender,
  });
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    try {
      scene.current = createPoseScene(container.current, (index, name) => {
        setPerson(index);
        setBone(name);
        const next = scene.current?.snapshot(index, name);
        if (next) setView(next);
      });
      scene.current.select(0, "shoulderL");
      setView(scene.current.snapshot(0, "shoulderL"));
    } catch (failure) {
      setError(
        `${t("unavailable")} ${failure instanceof Error ? failure.message : String(failure)}`,
      );
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
    // 场景仅在挂载时创建，语言变化不重建用户已摆好的姿势。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    onBindRef.current?.(() => {
      const owner = scene.current;
      if (!owner) return Promise.reject(new Error("Pose capture failed"));
      return owner.capture();
    });
    return () => onBindRef.current?.(null);
  }, []);
  const refresh = (index = person, joint = bone) => {
    if (scene.current) setView(scene.current.snapshot(index, joint));
  };
  return (
    <div
      className="my-2 space-y-2 rounded-xl border border-border bg-surface p-2"
      data-testid="studio-pose-editor"
    >
      <p className="text-ui-caption">{t("guide")}</p>
      {error ? (
        <p role="alert" className="text-ui-caption text-destructive">
          {error}
        </p>
      ) : null}
      <div className="relative">
        <div ref={container} className="h-80 w-full overflow-hidden rounded-lg" />
        <div className="absolute top-2 left-2 z-10 flex gap-1">
          <Button
            type="button"
            variant={tool === "rotate" ? "secondary" : "ghost"}
            className="h-7 bg-card/90 px-2 text-ui-caption"
            disabled={disabled || capturing || Boolean(error)}
            onClick={() => {
              setToolMode("rotate");
              scene.current?.setTool("rotate");
            }}
          >
            {t("rotate")}
          </Button>
          <Button
            type="button"
            variant={tool === "translate" ? "secondary" : "ghost"}
            className="h-7 bg-card/90 px-2 text-ui-caption"
            disabled={disabled || capturing || Boolean(error)}
            onClick={() => {
              setToolMode("translate");
              scene.current?.setTool("translate");
            }}
          >
            {t("move")}
          </Button>
        </div>
      </div>
      <fieldset
        disabled={disabled || capturing || Boolean(error)}
        className="min-w-0 space-y-2 text-ui-caption"
      >
        <div className="flex flex-wrap gap-2">
          <label>
            {t("count")}{" "}
            <select
              aria-label={t("count")}
              value={count}
              onChange={(event) => {
                const next = Number(event.target.value);
                scene.current?.setCount(next);
                scene.current?.select(0, bone);
                setCount(next);
                setPerson(0);
                refresh(0);
              }}
              className="h-8 rounded-lg border border-input-border bg-input px-2"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            {t("person")}{" "}
            <select
              aria-label={t("person")}
              value={person}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPerson(next);
                scene.current?.select(next, bone);
                refresh(next);
              }}
              className="h-8 rounded-lg border border-input-border bg-input px-2"
            >
              {Array.from({ length: count }, (_, index) => (
                <option key={index} value={index}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("gender")}{" "}
            <select
              aria-label={t("gender")}
              value={view.gender}
              onChange={(event) => {
                scene.current?.setGender(person, event.target.value as PoseGender);
                refresh();
              }}
              className="h-8 rounded-lg border border-input-border bg-input px-2"
            >
              <option value="female">{t("gender.female")}</option>
              <option value="male">{t("gender.male")}</option>
            </select>
          </label>
          <label>
            {t("preset")}{" "}
            <select
              aria-label={t("preset")}
              defaultValue=""
              onChange={(event) => {
                scene.current?.preset(person, Number(event.target.value));
                refresh();
                event.target.value = "";
              }}
              className="h-8 max-w-full rounded-lg border border-input-border bg-input px-2"
            >
              <option value="" disabled>
                {t("choose")}
              </option>
              {PRESETS.map((preset, index) => (
                <option key={t(`preset.${index}`)} value={index}>
                  {t(`preset.${index}`)}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              scene.current?.mirror(person);
              refresh();
            }}
          >
            {t("mirror")}
          </Button>
        </div>
        <details>
          <summary>{t("adjust")}</summary>
          <label className="mt-2 block">
            {t("joint")}{" "}
            <select
              aria-label={t("joint")}
              value={bone}
              onChange={(event) => {
                const next = event.target.value;
                setBone(next);
                scene.current?.select(person, next);
                refresh(person, next);
              }}
              className="h-8 rounded-lg border border-input-border bg-input px-2"
            >
              {BONE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {t(`bone.${name}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((axis) => (
              <label key={axis} className="flex items-center gap-2">
                {["X", "Y", "Z"][axis]} {Math.round(view.angles[axis] ?? 0)}°
                <input
                  type="range"
                  aria-label={`Pose ${["X", "Y", "Z"][axis]}`}
                  min={BONE_DEFS[bone]!.limits[axis]![0]}
                  max={BONE_DEFS[bone]!.limits[axis]![1]}
                  value={view.angles[axis] ?? 0}
                  onChange={(event) => {
                    scene.current?.angle(person, bone, axis, Number(event.target.value));
                    refresh();
                  }}
                  className="min-w-0 flex-1"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ["height", 120, 210, 1],
                ["weight", 35, 150, 1],
                ["shoulders", 0.7, 1.4, 0.05],
                ["hips", 0.7, 1.4, 0.05],
                ["waist", 0.7, 1.4, 0.05],
                ["muscle", 0.7, 1.4, 0.05],
              ] as const
            ).map(([key, min, max, step]) => (
              <label key={key} className="flex items-center gap-2">
                {t(key)} {view.shape[key]}
                <input
                  type="range"
                  aria-label={t(key)}
                  min={min}
                  max={max}
                  step={step}
                  value={view.shape[key] ?? min}
                  onChange={(event) => {
                    scene.current?.shape(person, key, Number(event.target.value));
                    refresh();
                  }}
                  className="min-w-0 flex-1"
                />
              </label>
            ))}
          </div>
        </details>
        <Button
          disabled={!scene.current || capturing}
          onClick={async () => {
            if (!scene.current) return;
            setCapturing(true);
            try {
              const owner = scene.current;
              const image = await owner.capture();
              if (scene.current !== owner) return;
              onCapture(image);
            } catch (failure) {
              setError(String(failure));
            } finally {
              setCapturing(false);
            }
          }}
        >
          {t("capture")}
        </Button>
      </fieldset>
    </div>
  );
}
