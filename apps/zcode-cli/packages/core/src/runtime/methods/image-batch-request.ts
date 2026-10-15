import {rememberedImageBatch} from "../helpers/image-batch-memory.js";
import {IMAGE_BATCH_SIZE,projectImageBatches} from "../helpers/image-batches.js";
import {auxiliaryModelOptions} from "../../model/auxiliary-model-options.js";
import {recordModelUsageFact} from "./usage-observability.js";
import {createChildTraceContext,runWithModelInvocationContext,traceContextToLogContext} from "../deps.js";
import type {ModelInputMessage} from "../deps.js";
import type {AgentRuntimeInternal} from "../internal.js";
import type {RunModelTextRequestOptions} from "../types.js";
import {projectMessagesForMediaBudget} from "../helpers/media-budget.js";
import {createModelStreamingEventQueue} from "./model-streaming-event-queue.js";
import {resolveModelRequestSessionTypeFromTaskType} from "./model-request-session-type.js";
import {createRefreshRuntimeHeadersBeforeModelAttempt} from "./model-runtime-headers.js";
import {isOutputTokenLimitFinishReason} from "./turn-output-token-continuation.js";
export class ImageBatchTruncated extends Error {}

function splitImageContent(content:ModelInputMessage["content"]):ModelInputMessage["content"][] {
 if(!Array.isArray(content))return [content];
 const imageIndexes=content.flatMap((block,index)=>block.type==="image"?[index]:[]);
 if(imageIndexes.length!==2)return [content];
 const prefix=content.slice(0,imageIndexes[0]!-1);
 return imageIndexes.map(index=>[...prefix,content[index-1]!,content[index]!]);
}
export async function analyzeImageBatchWithFallback(
 content:ModelInputMessage["content"],
 run:(content:ModelInputMessage["content"])=>Promise<string>,
 remembered:(content:ModelInputMessage["content"],suffix:string,execute:()=>Promise<string>)=>Promise<string>,
 signal?:AbortSignal,
):Promise<string>{
 return remembered(content,"pair",async()=>{
  try{return await run(content);}catch(error){
   if(!(error instanceof ImageBatchTruncated))throw error;
   const singles=splitImageContent(content);
   if(singles.length===1)throw new Error("单张图片分析仍被截断");
   const results:string[]=[];
   for(const [index,single] of singles.entries()){
    signal?.throwIfAborted();
    results.push(await remembered(single,`single-${index}`,async()=>{
     try{return await run(single);}catch(singleError){
      if(singleError instanceof ImageBatchTruncated)throw new Error(`第 ${index+1} 张图片分析仍被截断`);
      throw singleError;
     }
    }));
   }
   return results.join("\n\n");
  }
 });
}
export async function prepareImageBatchMessages(this:AgentRuntimeInternal,messages:ModelInputMessage[],options:RunModelTextRequestOptions):Promise<ModelInputMessage[]> {
 const model=options.model;
  return await projectImageBatches(messages, async (content,batch,total) => {
    const run=async(batchContent:ModelInputMessage["content"]):Promise<string>=>{
    const progress=createModelStreamingEventQueue({events:options.events,runtime:this,traceContext:options.traceContext});
    progress.enqueue({assistantMessageId:options.assistantMessageId,kind:"text_delta",delta:`正在分析图片：第 ${batch}/${total} 批（每批最多 ${IMAGE_BATCH_SIZE} 张）。\n`,done:false});
    await progress.drain();
    const batchModel=model.bind(auxiliaryModelOptions(model));
    const traceContext=createChildTraceContext(options.traceContext,{attributes:{querySource:"image_batch",batch}});
    const startedAt=Date.now();
    const batchMessages=projectMessagesForMediaBudget([{role:"user",content:batchContent}],{latestRealUserMessageIndex:0}).messages;
    const events: typeof options.events = [];
    try {
      const result=await runWithModelInvocationContext({
        traceContext,metadata:traceContextToLogContext(traceContext),
        modelRequestSessionType:resolveModelRequestSessionTypeFromTaskType(this.config.taskType),
        modelCall:{operation:"workspace_generate_text"},
        statusSink:this.createModelStatusSink(traceContext,events),
        refreshRuntimeHeadersBeforeAttempt:createRefreshRuntimeHeadersBeforeModelAttempt(this,{abortSignal:options.abortSignal,model:batchModel,traceContext}),
      },()=>batchModel.generateText({messages:batchMessages,abortSignal:options.abortSignal}));
      // 修复：截断的文字是不完整结果，不能写入完成缓存或交给最终综合。
      if(isOutputTokenLimitFinishReason(result.finishReason, undefined)) throw new ImageBatchTruncated(`第 ${batch}/${total} 批图片分析被截断`);
      await recordModelUsageFact(this,{events,model:batchModel,networkEventStartIndex:0,querySource:"image_batch",result,startedAt,status:"completed",traceContext});
      return result.text;
    }catch(error){
      await recordModelUsageFact(this,{events,model:batchModel,networkEventStartIndex:0,querySource:"image_batch",error,startedAt,status:"error",traceContext});
      throw error;
    }
    };
    const remembered=async(batchContent:ModelInputMessage["content"],suffix:string,execute:()=>Promise<string>):Promise<string>=>{
    if(!this.sessionPersisted||!this.sessionStore)return execute();
    return rememberedImageBatch({
      store:this.sessionStore,sessionId:this.sessionId,batch,total,
      fingerprintInput:{version:2,provider:model.providerId,model:model.modelId,options:auxiliaryModelOptions(model),content:batchContent,suffix},
      run:execute,
      onRestored:async()=>{
        const progress=createModelStreamingEventQueue({events:options.events,runtime:this,traceContext:options.traceContext});
        progress.enqueue({assistantMessageId:options.assistantMessageId,kind:"text_delta",delta:`已恢复第 ${batch}/${total} 批图片的分析结果，无需重复处理。\n`,done:false});
        await progress.drain();
      },
    });
    };
    return analyzeImageBatchWithFallback(content,run,remembered,options.abortSignal);
  },options.abortSignal);
}
