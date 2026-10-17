import { useState } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { StudioReferenceKind } from "./studioReferenceStages.js";

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|bmp|heic|avif)$/i;

function mimeFromName(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "bmp") return "image/bmp";
  if (extension === "heic") return "image/heic";
  if (extension === "avif") return "image/avif";
  return "image/png";
}

function asImageFile(file: File, type: string): File {
  return type === file.type ? file : new File([file], file.name || "pasted-image", { type });
}

/** 剪贴板截图经常没有 MIME，只在条目类型或文件名上能看出是图片。 */
export function pastedReferenceImages(data: DataTransfer | null): File[] {
  if (!data) return [];
  const images: File[] = [];
  for (const item of data.items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (!file) continue;
    const type = file.type.startsWith("image/")
      ? file.type
      : item.type.startsWith("image/")
        ? item.type
        : IMAGE_NAME.test(file.name)
          ? mimeFromName(file.name)
          : "";
    if (!type.startsWith("image/")) continue;
    images.push(asImageFile(file, type));
  }
  if (images.length > 0) return images;
  for (const file of data.files) {
    if (file.type.startsWith("image/")) images.push(file);
    else if (IMAGE_NAME.test(file.name)) images.push(asImageFile(file, mimeFromName(file.name)));
  }
  return images;
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest("textarea, input, select, [contenteditable='true']"))
  );
}

export function clipboardMayHoldImage(data: DataTransfer | null): boolean {
  if (!data) return false;
  const types = [...data.types];
  if (types.includes("text/plain") || types.includes("text/html")) return false;
  return types.length === 0 || types.some((type) => type === "Files" || type.startsWith("image/"));
}

export async function readClipboardImages(): Promise<File[]> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) return [];
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((entry) => entry.startsWith("image/"));
      if (!type) continue;
      files.push(new File([await item.getType(type)], "pasted-image", { type }));
    }
    return files;
  } catch {
    return [];
  }
}

export function StudioReferenceGuide({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (files: File[], kind: StudioReferenceKind, person?: number) => void;
}) {
  const { intl } = useZCodeIntl();
  const [assigned, setAssigned] = useState({ face: 1, clothing: 1 });
  return (
    <div className="my-3 space-y-2" data-testid="studio-reference-guide">
      <p className="text-ui-caption text-foreground-subtle">
        {intl.formatMessage({ id: "chat.studio.references.guide" })}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["face", "clothing", "scene", "body"] as const).map((kind) => {
          const assignedKind = kind === "face" || kind === "clothing" ? kind : null;
          return (
            <div
              key={kind}
              tabIndex={0}
              data-reference-kind={kind}
              className="min-w-0 rounded-lg border border-border bg-surface p-2 text-ui-caption outline-none focus-visible:ring-1 focus-visible:ring-border"
              onPointerDown={(event) => {
                if (isTextEditingTarget(event.target)) return;
                event.currentTarget.focus({ preventScroll: true });
              }}
              onPaste={(event) => {
                const images = pastedReferenceImages(event.clipboardData);
                const person = assignedKind ? assigned[assignedKind] : undefined;
                if (images.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  onAdd(images, kind, person);
                  return;
                }
                if (!clipboardMayHoldImage(event.clipboardData)) return;
                event.preventDefault();
                event.stopPropagation();
                void readClipboardImages().then((files) => {
                  if (files.length > 0) onAdd(files, kind, person);
                });
              }}
            >
              <span className="block font-medium">
                {intl.formatMessage({ id: `chat.studio.references.${kind}` })}
              </span>
              {assignedKind ? (
                <select
                  aria-label={intl.formatMessage({ id: "chat.studio.references.assign" })}
                  disabled={disabled}
                  value={assigned[assignedKind]}
                  className="mt-2 h-8 w-full rounded-md border border-input-border bg-input px-1"
                  onChange={(event) =>
                    setAssigned((current) => ({
                      ...current,
                      [assignedKind]: Number(event.target.value),
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map((person) => (
                    <option key={person} value={person}>
                      {intl.formatMessage({ id: "chat.studio.references.person" })} {person}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={disabled}
                aria-label={intl.formatMessage({ id: `chat.studio.references.${kind}` })}
                className="mt-2 w-full min-w-0 text-ui-xs"
                onChange={(event) => {
                  onAdd(
                    [...(event.target.files ?? [])],
                    kind,
                    assignedKind ? assigned[assignedKind] : undefined,
                  );
                  event.target.value = "";
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
