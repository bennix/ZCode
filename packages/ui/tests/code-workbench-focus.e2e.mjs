import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

test('AI send scope transition retains IDE; manual tab choice and workspace isolation remain', async () => {
 const result = await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {openBrowserSidePane,resolveSidePaneScopeState} from './packages/ui/src/lib/workspaceSidePane.ts';
 const initial=openBrowserSidePane(null,{tabId:'ide',initialUrl:'http://127.0.0.1:1234',workspaceKey:'w',ownerTaskId:'draft',purpose:'code-workbench'});
 initial.tabs.push({id:'other',type:'browser',workspaceKey:'w',ownerTaskId:'task',initialUrl:'https://example.com'});
 function App(){const [state,setState]=useState(initial);const [scope,setScope]=useState({workspaceKey:'w',ownerTaskId:'draft'});
 const send=()=>{const next={workspaceKey:'w',ownerTaskId:'task'};setScope(next);setState(resolveSidePaneScopeState(state,next,'other').sidePaneState)};
 return <><button onClick={send}>Send AI</button><button onClick={()=>setState({...state,activeTabId:'other'})}>Other tab</button><button onClick={()=>{const next={workspaceKey:'different',ownerTaskId:'task'};setScope(next);setState(resolveSidePaneScopeState(state,next).sidePaneState)}}>Other workspace</button><output>{state?.activeTabId}</output><span>{scope.ownerTaskId}</span></>}
 createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'packages/ui/tsconfig.json'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:result.outputFiles[0].text});
 await page.getByText('Send AI',{exact:true}).click();assert.equal(await page.locator('output').textContent(),'ide');
 await page.getByText('Other tab',{exact:true}).click();assert.equal(await page.locator('output').textContent(),'other');
 await page.getByText('Other workspace',{exact:true}).click();assert.equal(await page.locator('output').textContent(),'');
 }finally{await browser.close()}
});

test('restored IDE tab regains focus while return and ordinary tabs stay in chat layout', async () => {
 const result = await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {shouldFocusCodeWorkbench} from './packages/ui/src/lib/codeWorkbenchLayout.ts';
 const restored={id:'restored',type:'browser',purpose:'code-workbench'};
 const ordinary={id:'ordinary',type:'browser'};
 function App(){const [tab,setTab]=useState(restored);const [suppressed,setSuppressed]=useState(null);
 const focused=shouldFocusCodeWorkbench({activeTab:tab,suppressedTabId:suppressed,sidePaneVisible:true});
 return <><button onClick={()=>setSuppressed(tab.id)}>Return to chat</button><button onClick={()=>setTab(ordinary)}>Ordinary tab</button><button onClick={()=>setTab(restored)}>Restored IDE</button><button onClick={()=>{setSuppressed(null);setTab({id:'new-ide',type:'browser',purpose:'code-workbench'})}}>Open IDE again</button><output>{focused?'focused':'chat'}</output></>}
 createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'packages/ui/tsconfig.json'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:result.outputFiles[0].text});
 assert.equal(await page.locator('output').textContent(),'focused');
 await page.getByText('Return to chat').click();assert.equal(await page.locator('output').textContent(),'chat');
 await page.getByText('Ordinary tab').click();assert.equal(await page.locator('output').textContent(),'chat');
 await page.getByText('Restored IDE').click();assert.equal(await page.locator('output').textContent(),'chat');
 await page.getByText('Open IDE again').click();assert.equal(await page.locator('output').textContent(),'focused');
 }finally{await browser.close()}
});
