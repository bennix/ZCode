import assert from "node:assert/strict";
import { test } from "node:test";
import { sendWeixinFileToolEntry } from "../src/tool/handlers/send-weixin-file.js";

test("Weixin tool forwards only validated request and reports the host delivery result", async () => {
  const calls: unknown[] = [];
  const context: any = { weixinFilePort: async (request: unknown) => { calls.push(request); return { recipients: [{id:"latest",label:"fixture"}], sent:true }; } };
  const result = await sendWeixinFileToolEntry.handler({action:"send",path:"report.pdf"}, context);
  assert.equal((result as any).sent, true);
  assert.deepEqual(calls, [{action:"send",path:"report.pdf"}]);
  await assert.rejects(sendWeixinFileToolEntry.handler({action:"send",path:"report.pdf",workspacePath:"/other"}, context));
  assert.equal(calls.length, 1);
});
test("unavailable host and uncertain network delivery are errors, never success or retry", async () => {
  await assert.rejects(sendWeixinFileToolEntry.handler({action:"list"}, {} as any), /不支持/);
  let calls=0;
  await assert.rejects(sendWeixinFileToolEntry.handler({action:"send",path:"report.pdf"}, {weixinFilePort: async()=>{calls++;throw Error("uncertain delivery");}} as any), /uncertain delivery/);
  assert.equal(calls, 1);
});

test("image generation forwards optional explicit model through the same approved host port", async () => {
  const calls: unknown[]=[];
  const context:any={weixinFilePort:async(request:unknown)=>{calls.push(request);return {recipients:[],sent:true,path:"/workspace/image.png"};}};
  await sendWeixinFileToolEntry.handler({action:"generate_image",prompt:"cat"},context);
  await sendWeixinFileToolEntry.handler({action:"generate_image",prompt:"cat",model:"chosen/image"},context);
  assert.deepEqual(calls,[{action:"generate_image",prompt:"cat"},{action:"generate_image",prompt:"cat",model:"chosen/image"}]);
  assert.equal(sendWeixinFileToolEntry.metadata.needsApproval,true);
});
