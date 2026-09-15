import { test } from "node:test";
import assert from "node:assert/strict";
import { contributingDifferentialIndexes } from "./whs";
import { contributingRoundIds } from "./archiveIndex";
import type { HandicapRoundSummary, ArchivedHandicapRound } from "./types";

test("selection caps at twenty, excludes older lows, and resolves ties consistently", () => {
  assert.deepEqual(contributingDifferentialIndexes([1, 1]), []);
  assert.deepEqual(contributingDifferentialIndexes([...Array(20).fill(3), -10]), [0,1,2,3,4,5,6,7]);
});
test("markers follow the selected index and exclude incomplete rounds", () => {
  const archived: ArchivedHandicapRound[] = [0,1,2].map(i => ({ id:String(i), tournamentSlug:"test", tournamentLabel:"Test", tournamentDate:"2026-01-01", datePlayed:"2026-01-01", round:i, courseName:"Course", format:"Singles", totalScore:75+i, holesPlayed:18, teeSetup:{courseId:"c",teeSetId:"t",teeSetName:"Blue",rating:72,slope:113,holes:[]} }));
  const personal: HandicapRoundSummary = {id:"p",courseId:"c",courseName:"Course",teeSetName:"Blue",rating:72,slope:113,datePlayed:"2026-02-01",teeTime:null,totalScore:70,differential:-2};
  assert.deepEqual([...contributingRoundIds([personal],archived,"maroon-masters")],["archive-0"]);
  assert.deepEqual([...contributingRoundIds([personal],archived,"overall")],["submitted-p"]);
  assert.deepEqual([...contributingRoundIds([],archived.map((r,i)=>i===0?{...r,holesPlayed:17}:r),"overall")],[]);
});
