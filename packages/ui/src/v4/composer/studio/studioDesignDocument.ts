export function requireDesignDocument(output: string): string {
  const html = output
    .trim()
    .replace(/^```(?:html)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  if (
    !/^<!doctype html>/iu.test(html) ||
    !/<html[\s>]/iu.test(html) ||
    !/<body[\s>]/iu.test(html) ||
    !/<\/body>\s*<\/html>\s*$/iu.test(html)
  ) {
    throw new Error(
      "The model did not return a complete HTML document. Previous preview retained.",
    );
  }
  return html;
}
/** 生成原型是不可信内容：去除模型提供的 head 外壳，始终在最前方注入限制策略。 */
export function isolateDesignDocument(html: string): string {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return html
    .replace(/<head[^>]*>/iu, "")
    .replace(/<\/head\s*>/iu, "")
    .replace(
      /<html\b[^>]*>/iu,
      (match) =>
        `${match}<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"></head>`,
    );
}
