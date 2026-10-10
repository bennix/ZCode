import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("dispatch model selection and enablement share one settings owner", async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {AgentModelDispatchSettings} from './packages/ui/src/settings/AgentModelDispatchSettings.tsx'; const root=createRoot(document.getElementById('root')); window.renderDispatch=(modelGroups)=>root.render(<AgentModelDispatchSettings modelGroups={modelGroups}/>); window.renderDispatch([{key:'provider',label:'Provider',items:[{key:'judge',value:'custom:p:judge',name:'Judge'}]}]);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    tsconfig: "packages/ui/tsconfig.json",
    plugins: [
      {
        name: "dispatch-fixtures",
        setup(plugin) {
          plugin.onResolve({ filter: /hooks\/useSettingService\.js$/ }, () => ({
            path: "settings",
            namespace: "fixture",
          }));
          plugin.onResolve({ filter: /i18n\/IntlProvider\.js$/ }, () => ({
            path: "intl",
            namespace: "fixture",
          }));
          plugin.onResolve({ filter: /ModelConfigSelect\.js$/ }, () => ({
            path: "picker",
            namespace: "fixture",
          }));
          plugin.onResolve({ filter: /components\/ui\/switch\.js$/ }, () => ({
            path: "switch",
            namespace: "fixture",
          }));
          plugin.onResolve({ filter: /components\/ui\/toast\.js$/ }, () => ({
            path: "toast",
            namespace: "fixture",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            loader: "jsx",
            resolveDir: process.cwd(),
            contents:
              args.path === "settings"
                ? `import {useState} from 'react'; export function useSettings(){const [settings,set]=useState({agentModelDispatchEnabled:false});return {settings,loading:false,update:async patch=>{window.saved={...window.saved,...patch};set(current=>({...current,...patch}))}}}`
                : args.path === "intl"
                  ? `export function useZCodeIntl(){return {intl:{formatMessage:({id})=>id}}}`
                  : args.path === "picker"
                    ? `export function ModelConfigSelect({modelGroups,normalizedValue,onValueChange}){return <select aria-label="dispatch-model" value={normalizedValue} onChange={event=>onValueChange(event.target.value)}><option value="">Choose</option>{modelGroups.flatMap(group=>group.items).map(item=><option key={item.key} value={item.value}>{item.name}</option>)}</select>}`
                    : args.path === "switch"
                      ? `export function Switch({checked,disabled,onCheckedChange,...rest}){return <input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onCheckedChange(event.target.checked)} {...rest}/>} `
                      : `export function toast(){}`,
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const toggle = page.getByRole("checkbox", { name: "settings.agentDispatch.enabled" });
    assert.equal(await toggle.isDisabled(), true);
    await page.getByRole("combobox", { name: "dispatch-model" }).selectOption("custom:p:judge");
    await page.waitForFunction(
      () => !document.querySelector('input[aria-label="settings.agentDispatch.enabled"]')?.disabled,
    );
    assert.equal(await toggle.isDisabled(), false);
    await toggle.check();
    assert.deepEqual(await page.evaluate(() => window.saved), {
      agentModelDispatcher: { providerId: "p", modelId: "judge" },
      agentModelDispatchEnabled: true,
    });
    await page.evaluate(() => window.renderDispatch([]));
    await page.getByText("settings.agentDispatch.unavailable", { exact: true }).waitFor();
    assert.equal(await toggle.isDisabled(), false);
    await toggle.uncheck();
    assert.equal(await page.evaluate(() => window.saved.agentModelDispatchEnabled), false);
    assert.equal(await toggle.isDisabled(), true);
  } finally {
    await browser.close();
  }
});
