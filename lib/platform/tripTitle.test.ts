import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripTitleLines } from './tripTitle';
const measure=(text:string)=>text.length;
test('trip names stay on one line when they fit and move a word down to meet 67%',()=>{
 assert.deepEqual(tripTitleLines('The Maroon Tournament 2026',40,measure),['The Maroon Tournament 2026']);
 assert.deepEqual(tripTitleLines('The Maroon Tournament 2026',22,measure),['The Maroon','Tournament 2026']);
 assert.equal(tripTitleLines('AnExtremelyLongUnbrokenName',10,measure),null);
 const lines=tripTitleLines('Weekend Golf Trip With Friends',19,measure)!;
 assert.ok(lines[1].length>=Math.ceil(lines[0].length*.67));
 assert.ok(lines.every(line=>line.length<=19));
});
