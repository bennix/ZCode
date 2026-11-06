import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exportProbeRecords,
  readProbeScope,
  startProbe,
  useResearchProbeStore,
} from "../src/store/researchProbeStore.js";

const store = useResearchProbeStore;
test("independent switches, frozen labels, duplicate settlement and identity isolation", () => {
  store.setState({ scopes: {} });
  startProbe("one", "guided-task", "off")("success");
  assert.equal(readProbeScope("one").records.length, 0);
  store.getState().toggle("one", "local-edit", true);
  store.getState().configure("one", { caseId: "L02", condition: "F2" });
  const finish = startProbe("one", "local-edit", "design.local-edit");
  store.getState().configure("one", { caseId: "L03" });
  finish("failed", 2);
  finish("success");
  startProbe("one", "guided-task", "disabled")("success");
  assert.equal(readProbeScope("one").records.length, 1);
  assert.equal(readProbeScope("one").records[0].caseId, "L02");
  assert.equal(readProbeScope("one").records[0].retries, 2);
  assert.equal(readProbeScope("two").records.length, 0);
});

test("disable/re-enable and clear invalidate late span completions", () => {
  store.setState({ scopes: {} });
  store.getState().toggle("one", "local-edit", true);
  const finish = startProbe("one", "local-edit", "late");
  store.getState().toggle("one", "local-edit", false);
  store.getState().toggle("one", "local-edit", true);
  finish("success");
  const cleared = startProbe("one", "local-edit", "cleared");
  store.getState().clear("one");
  cleared("failed");
  assert.equal(readProbeScope("one").records.length, 0);
});

test("cancellation and unknown usage survive JSON/CSV without content or scope paths", () => {
  store.setState({ scopes: {} });
  const key = "/synthetic/private/workspace";
  store.getState().toggle(key, "local-edit", true);
  store.getState().configure(key, { caseId: '=HYPERLINK("bad")', condition: "F2" });
  startProbe(key, "local-edit", "edit", "test-model")("cancelled");
  const json = exportProbeRecords(key, "json");
  assert.equal(JSON.parse(json).records[0].inputTokens, null);
  assert.equal(JSON.parse(json).records[0].status, "cancelled");
  assert.equal(json.includes(key), false);
  assert.match(exportProbeRecords(key, "csv"), /'=HYPERLINK/u);
});

test("deduplicate runtime IDs and retain bounded observations with truncation count", () => {
  store.setState({ scopes: {} });
  store.getState().toggle("one", "guided-task", true);
  startProbe("one", "guided-task", "seed")("success");
  const seed = readProbeScope("one").records[0];
  const epoch = readProbeScope("one").epochs["guided-task"];
  for (let index = 0; index < 2001; index++)
    store.getState().append("one", epoch, { ...seed, id: `runtime-${index}` });
  store.getState().append("one", epoch, { ...seed, id: "runtime-2000" });
  assert.equal(readProbeScope("one").records.length, 2000);
  assert.equal(readProbeScope("one").dropped, 2);
});

test("records actual usage across retry attempts and labels incomplete coverage", () => {
  store.setState({ scopes: {} });
  assert.equal(startProbe("one", "local-edit", "disabled").usage, undefined);
  store.getState().toggle("one", "local-edit", true);
  const complete = startProbe("one", "local-edit", "two-attempts");
  complete.usage?.({ inputTokens: 10, outputTokens: 2 });
  complete.usage?.({ inputTokens: 20, outputTokens: 3 });
  complete("success", 1);
  const partial = startProbe("one", "local-edit", "missing-first-attempt");
  partial.usage?.({ inputTokens: 20, outputTokens: 3 });
  partial("success", 1);
  const records = readProbeScope("one").records;
  assert.equal(records[0].inputTokens, 30);
  assert.equal(records[0].outputTokens, 5);
  assert.equal(records[0].usageCoverage, "complete");
  assert.equal(records[1].usageCoverage, "partial");
});
