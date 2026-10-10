import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export async function releaseFileMetadata(path) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const { size } = await stat(path);
  return { sha512: hash.digest("base64"), size };
}
