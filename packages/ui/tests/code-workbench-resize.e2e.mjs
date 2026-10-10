import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("IDE dock stays visible on window resize while ordinary narrow chat collapses its side pane", async () => {
  const result = await build({
    stdin: {
      contents: `
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {shouldAutoCollapseConversationSidePane} from './packages/ui/src/lib/codeWorkbenchLayout.ts';
function App(){
 const [workbench,setWorkbench]=useState(true);
 const [paneOpen,setPaneOpen]=useState(true);
 useEffect(()=>{
  const onResize=()=>{
   if(shouldAutoCollapseConversationSidePane({widthPx:400,thresholdPx:480,isSidePaneOpen:paneOpen,isWorkbenchFocused:workbench}))setPaneOpen(false);
  };
  window.addEventListener('resize',onResize);
  return()=>window.removeEventListener('resize',onResize);
 },[paneOpen,workbench]);
 return <><button onClick={()=>setWorkbench(false)}>Return to chat</button><output>{paneOpen?'open':'collapsed'}</output></>;
}
createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    tsconfig: "packages/ui/tsconfig.json",
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    assert.equal(await page.locator("output").textContent(), "open");
    await page.getByText("Return to chat").click();
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    assert.equal(await page.locator("output").textContent(), "collapsed");
  } finally {
    await browser.close();
  }
});
