import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseExtensionReference } from "./extensionImport";

// 扩展只传递选区，不持有模型密钥，不创建另一套 AI 会话。
export async function writeWorkbenchExtension(extensions: string) {
  const root = join(extensions, "zencode.ai-bridge-1.0.0");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "ai-bridge",
        publisher: "zencode",
        displayName: "ZenCode AI",
        description: "Send code context to your existing ZenCode AI conversation",
        version: "1.0.0",
        engines: { vscode: "^1.90.0" },
        main: "./extension.cjs",
        extensionKind: ["workspace"],
        capabilities: { untrustedWorkspaces: { supported: true } },
        activationEvents: ["onStartupFinished", "onCommand:zencode.askAI"],
        contributes: {
          themes: [
            { label: "ZenCode Light", uiTheme: "vs", path: "./themes/light.json" },
            { label: "ZenCode Dark", uiTheme: "vs-dark", path: "./themes/dark.json" },
          ],
          commands: [
            { command: "zencode.askAI", title: "ZenCode: 将选中代码交给 AI / Ask AI" },
            {
              command: "zencode.importExtension",
              title: "ZenCode: 导入扩展 / Import Extension",
              icon: "$(extensions)",
            },
          ],
          menus: {
            "view/title": [
              {
                command: "zencode.importExtension",
                when: "view == workbench.views.extensions.installed",
                group: "navigation",
              },
            ],
            "editor/context": [
              { command: "zencode.askAI", when: "editorTextFocus", group: "zencode" },
            ],
          },
          keybindings: [
            {
              command: "zencode.askAI",
              key: "ctrl+alt+k",
              mac: "cmd+alt+k",
              when: "editorTextFocus",
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  await mkdir(join(root, "themes"), { recursive: true });
  for (const [mode, palette] of Object.entries({
    light: { background: "#f8f8f8", panel: "#ffffff", sidebar: "#f0f0f0", input: "#ffffff", foreground: "#0d0d0d", border: "#0d0d0d1a", accent: "#0b7fff" },
    dark: { background: "#161616", panel: "#202020", sidebar: "#161616", input: "#2b2b2b", foreground: "#f8f8f8", border: "#ffffff1a", accent: "#4099ff" },
  })) {
    await writeFile(join(root, "themes", `${mode}.json`), JSON.stringify({
      name: `ZenCode ${mode === "light" ? "Light" : "Dark"}`,
      type: mode,
      colors: {
        "foreground": palette.foreground,
        "focusBorder": palette.accent,
        "editor.background": palette.background,
        "editor.foreground": palette.foreground,
        "sideBar.background": palette.sidebar,
        "sideBar.foreground": palette.foreground,
        "activityBar.background": palette.sidebar,
        "activityBar.foreground": palette.foreground,
        "titleBar.activeBackground": palette.panel,
        "titleBar.activeForeground": palette.foreground,
        "tab.activeBackground": palette.background,
        "tab.inactiveBackground": palette.panel,
        "panel.background": palette.panel,
        "statusBar.background": palette.panel,
        "statusBar.foreground": palette.foreground,
        "editorGroupHeader.tabsBackground": palette.panel,
        "input.background": palette.input,
        "dropdown.background": palette.input,
        "menu.background": palette.input,
        "list.activeSelectionBackground": palette.accent + "33",
        "list.hoverBackground": palette.accent + "1a",
        "editorGroup.border": palette.border,
        "panel.border": palette.border,
        "sideBar.border": palette.border,
      },
    }, null, 2));
  }
  await writeFile(
    join(root, "extension.cjs"),
    `
const vscode = require('vscode');
const parseExtensionReference = ${parseExtensionReference.toString()};
exports.activate = context => {
 // 主题由 ZenCode 外层拥有；扩展通过已鉴权的本机桥接接收变更，再交给 VS Code 配置 API。
 let disposed = false;
 context.subscriptions.push({ dispose() { disposed = true; } });
 void (async () => {
  while (!disposed) {
   try {
    const response = await fetch(process.env.ZENCODE_IDE_BRIDGE_URL.replace('/context', '/theme-stream'), {
     headers: { Authorization: 'Bearer ' + process.env.ZENCODE_IDE_BRIDGE_TOKEN }
    });
    if (!response.ok || !response.body) throw new Error('ZenCode theme bridge unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!disposed) {
     const { value, done } = await reader.read();
     if (done) break;
     buffer += decoder.decode(value, { stream: true });
     let boundary;
     while ((boundary = buffer.indexOf('\\n\\n')) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const theme = event.startsWith('data: ') ? event.slice(6).trim() : '';
      if (theme === 'light' || theme === 'dark') {
       const name = theme === 'light' ? 'ZenCode Light' : 'ZenCode Dark';
       const config = vscode.workspace.getConfiguration('workbench');
       if (config.get('colorTheme') !== name) await config.update('colorTheme', name, vscode.ConfigurationTarget.Global);
      }
     }
    }
   } catch { /* 子进程或桥接暂时不可用时重连，不影响编辑。 */ }
   if (!disposed) await new Promise(resolve => setTimeout(resolve, 1000));
  }
 })();
 context.subscriptions.push(vscode.commands.registerCommand('zencode.importExtension', async () => {
  try {
   const kind = await vscode.window.showQuickPick(['网页链接或扩展 ID / Web link or ID', '本地 VSIX / Local VSIX'], { placeHolder: '导入 VS Code 扩展 / Import extension' });
   if (!kind) return;
   if (kind.startsWith('网页')) {
    const value = await vscode.window.showInputBox({ prompt: 'Open VSX / Marketplace / vscode:extension / publisher.name', placeHolder: '粘贴扩展网页链接 / Paste extension link', validateInput: value => parseExtensionReference(value) ? undefined : '请输入有效的扩展链接或 publisher.name / Invalid extension reference' });
    if (!value) return;
    const id = parseExtensionReference(value);
    if (!id) return;
    await vscode.commands.executeCommand('workbench.extensions.search', '@id:' + id);
    vscode.window.showInformationMessage('请在扩展列表确认安装。使用 Open VSX；未收录的扩展可导入 VSIX。 / Review and install in Extensions.');
   } else {
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { VSIX: ['vsix'] }, openLabel: '导入 / Import' });
    if (!files?.length) return;
    const confirm = await vscode.window.showWarningMessage('安装扩展可执行本机代码 / Extensions can execute local code: ' + files[0].fsPath, { modal: true }, '安装 / Install');
    if (!confirm) return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在安装扩展 / Installing extension' }, () => vscode.commands.executeCommand('workbench.extensions.installExtension', files[0]));
    vscode.window.showInformationMessage('扩展安装完成，请在扩展列表查看。 / Extension installed.');
   }
  } catch (error) { vscode.window.showErrorMessage('扩展导入失败 / Extension import failed: ' + String(error)); }
 }));
 context.subscriptions.push(vscode.commands.registerCommand('zencode.askAI', async () => {
  try {
   const editor = vscode.window.activeTextEditor;
   if (!editor || editor.document.uri.scheme !== 'file') return;
   if (editor.document.isDirty) {
    const choice = await vscode.window.showWarningMessage('先保存文件，让 ZenCode AI 读取最新代码。', '保存并继续');
    if (!choice || !await editor.document.save()) return;
   }
   const comment = await vscode.window.showInputBox({ prompt: '希望 ZenCode AI 如何处理这段代码？', placeHolder: '解释、排错、重构或实现功能…' });
   if (!comment?.trim()) return;
   const range = editor.selection.isEmpty ? new vscode.Range(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length) : editor.selection;
   const response = await fetch(process.env.ZENCODE_IDE_BRIDGE_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.ZENCODE_IDE_BRIDGE_TOKEN },
    body: JSON.stringify({ sourcePath: editor.document.uri.fsPath, startLine: range.start.line + 1, endLine: range.end.line + 1, selectedText: editor.document.getText(range), comment })
   });
   if (!response.ok) throw new Error('ZenCode bridge: HTTP ' + response.status);
   vscode.window.showInformationMessage('已交给 ZenCode。请回到 AI 对话查看并发送。');
  } catch (error) { vscode.window.showErrorMessage(String(error)); }
 }));
};
`,
  );
}
