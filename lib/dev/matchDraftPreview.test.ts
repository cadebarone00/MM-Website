import { test } from "node:test";
import assert from "node:assert/strict";
import { matchDraftPreviewData } from "./matchDraftPreview";
test("each conditional opens its requested method with usable independent sample rounds",()=>{
 for(const method of ["Response","Ranks","Randomized"] as const){const result=matchDraftPreviewData([],[],undefined,method);assert.equal(result.rounds[0].type,method);assert.equal(result.rounds[0].key,"preview-"+method);assert.equal(result.players.length,8);assert.equal(new Set(result.rounds.map(round=>round.key)).size,6);assert.ok(result.rounds.every(round=>round.matches>0));}
});
