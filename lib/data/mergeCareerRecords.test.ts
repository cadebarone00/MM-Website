import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mergeCareerRecords,careerRoundKey} from './mergeCareerRecords';
import type {CareerHoleRecord} from './careerStats';
const row:CareerHoleRecord={year:2026,player:'cade-barone',round:1,roundHoles:18,course:'Test',format:'Singles',hole:1,par:4,yards:400,score:5,putts:2,fairwayInRegulation:true,greenInRegulation:false,penalties:null};
test('edited archive replaces imported round without duplicating or retaining removed holes',()=>{
 const other={...row,round:2};
 const result=mergeCareerRecords([row,{...row,hole:2},other],[{...row,score:4}],new Set([careerRoundKey(2026,'cade-barone',1)]));
 assert.deepEqual(result,[other,{...row,score:4}]);
});
test('an emptied edited round removes its old imported scores',()=>assert.deepEqual(mergeCareerRecords([row],[],new Set([careerRoundKey(2026,'cade-barone',1)])),[]));
