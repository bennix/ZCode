import assert from "node:assert/strict";
import {test} from "node:test";
import {analyzeImageBatchWithFallback,ImageBatchTruncated} from "../src/runtime/methods/image-batch-request.js";

const pair:any[]=[{type:"text",text:"任务"},{type:"text",text:"图 1"},{type:"image",source:{type:"url",url:"a"}},{type:"text",text:"图 2"},{type:"image",source:{type:"url",url:"b"}}];
const count=(content:any)=>content.filter((item:any)=>item.type==="image").length;
test("truncated pair retries each image in order and caches completed singles",async()=>{
 const cache=new Map<string,string>();
 const calls:number[]=[];
 const remembered=async(content:any,suffix:string,run:()=>Promise<string>)=>{
  const key=`${suffix}:${JSON.stringify(content)}`;
  if(cache.has(key))return cache.get(key)!;
  const result=await run();cache.set(key,result);return result;
 };
 let failSecond=true;
 const run=async(content:any)=>{
  calls.push(count(content));
  if(count(content)===2)throw new ImageBatchTruncated();
  if(content.at(-1).source.url==="b"&&failSecond){failSecond=false;throw Error("interrupted");}
  return content.at(-1).source.url;
 };
 await assert.rejects(analyzeImageBatchWithFallback(pair,run,remembered),/interrupted/);
 assert.deepEqual(calls,[2,1,1]);
 assert.equal(await analyzeImageBatchWithFallback(pair,run,remembered),"a\n\nb");
 assert.deepEqual(calls,[2,1,1,2,1]);
 assert.equal(await analyzeImageBatchWithFallback(pair,run,remembered),"a\n\nb");
 assert.deepEqual(calls,[2,1,1,2,1]);
});
test("single-image truncation fails without caching an incomplete answer",async()=>{
 const one=pair.slice(0,3);
 const remembered=async(_content:any,_suffix:string,run:()=>Promise<string>)=>run();
 await assert.rejects(analyzeImageBatchWithFallback(one,async()=>{throw new ImageBatchTruncated();},remembered),/单张图片分析仍被截断/);
});
