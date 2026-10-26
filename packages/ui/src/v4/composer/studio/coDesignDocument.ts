import { validateCoDesignState, type CoDesignState, type CoDesignTweak } from "@zcode/shared";
import { requireDesignDocument } from "./studioDesignDocument.js";

/** 给源文档分配稳定 ID，预览消息不能自行发明可以改写的目标。 */
export function prepareCoDesignHtml(html: string): string {
  const document = new DOMParser().parseFromString(requireDesignDocument(html), "text/html");
  const used = new Set<string>();
  const reserved = new Set(
    [...document.body.querySelectorAll("[data-zencode-design-id]")].map((node) =>
      node.getAttribute("data-zencode-design-id"),
    ),
  );
  let next = 0;
  for (const node of document.body.querySelectorAll(
    "section,article,h1,h2,h3,p,button,img,li,table",
  )) {
    let id = node.getAttribute("data-zencode-design-id") ?? "";
    if (!/^zc-[0-9]+$/u.test(id) || used.has(id)) {
      do {
        id = `zc-${next++}`;
      } while (used.has(id) || reserved.has(id));
      node.setAttribute("data-zencode-design-id", id);
    }
    used.add(id);
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
export function readCoDesignMetadata(html: string, fallback: CoDesignState): CoDesignState {
  const document = new DOMParser().parseFromString(html, "text/html");
  const metadata = document.querySelector('script#zencode-codesign[type="application/json"]');
  return metadata ? validateCoDesignState(JSON.parse(metadata.textContent ?? "")) : fallback;
}
export function applyCoDesignTweaks(html: string, tweaks: CoDesignTweak[]): string {
  validateCoDesignState({ kind: "prototype", tweaks, images: [], comments: [] });
  const document = new DOMParser().parseFromString(html, "text/html");
  document.getElementById("zencode-design-tweaks")?.remove();
  const style = document.createElement("style");
  style.id = "zencode-design-tweaks";
  style.textContent = `:root{${tweaks.map((tweak) => `${tweak.token}:${tweak.value}${tweak.kind === "number" ? tweak.unit : ""}!important`).join(";")}}`;
  document.head.append(style);
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
export function replaceCoDesignElement(
  html: string,
  elementId: string,
  replacement: string,
): string {
  if (!/^zc-[0-9]+$/u.test(elementId)) throw new Error("Invalid design element ID");
  const document = new DOMParser().parseFromString(html, "text/html");
  const matches = document.querySelectorAll(`[data-zencode-design-id="${elementId}"]`);
  if (matches.length !== 1) throw new Error("Design element changed or is missing");
  const template = document.createElement("template");
  template.innerHTML = replacement.trim();
  if (
    template.content.childElementCount !== 1 ||
    [...template.content.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim())
  )
    throw new Error("Expected one replacement element");
  const next = template.content.firstElementChild!;
  if (["HTML", "BODY", "HEAD", "SCRIPT", "STYLE", "IFRAME"].includes(next.tagName))
    throw new Error("Invalid replacement element");
  // 局部替换禁止脚本、全局样式和事件处理器，否则子节点可越过选区边界。
  if (next.querySelector("script,style,iframe,link,meta,base,object,embed"))
    throw new Error("Active content is not allowed in scoped edits");
  for (const node of [next, ...next.querySelectorAll("*")]) {
    for (const attribute of node.attributes) {
      if (
        /^on/iu.test(attribute.name) ||
        /^(?:javascript|vbscript):/iu.test(attribute.value.trim())
      )
        throw new Error("Active attributes are not allowed in scoped edits");
    }
  }
  for (const child of next.querySelectorAll("[data-zencode-design-id]"))
    child.removeAttribute("data-zencode-design-id");
  next.setAttribute("data-zencode-design-id", elementId);
  matches[0]!.replaceWith(next);
  return prepareCoDesignHtml(`<!doctype html>\n${document.documentElement.outerHTML}`);
}
export interface CoDesignSelection {
  elementId: string;
  quote: string;
}
export function acceptCoDesignSelection(value: unknown, nonce: string): CoDesignSelection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    data.type !== "zencode-codesign-selection" ||
    data.nonce !== nonce ||
    typeof data.elementId !== "string" ||
    !/^zc-[0-9]+$/u.test(data.elementId) ||
    typeof data.quote !== "string" ||
    data.quote.length > 500
  )
    return null;
  return { elementId: data.elementId, quote: data.quote };
}
export function coDesignSelectionScript(nonce: string): string {
  return `<script>document.addEventListener('click',function(event){var node=event.target.closest('[data-zencode-design-id]');if(!node)return;event.preventDefault();event.stopImmediatePropagation();parent.postMessage({type:'zencode-codesign-selection',nonce:${JSON.stringify(nonce)},elementId:node.getAttribute('data-zencode-design-id'),quote:(node.innerText||node.getAttribute('alt')||'').slice(0,500)},'*');},true);</script>`;
}

export function syncCoDesignMetadata(html: string, state: CoDesignState): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.getElementById("zencode-codesign")?.remove();
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "zencode-codesign";
  script.textContent = JSON.stringify(validateCoDesignState(state)).replaceAll("<", "\\u003c");
  document.head.append(script);
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
