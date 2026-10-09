import {test} from 'node:test';import assert from 'node:assert/strict';import {momentumHeadline,momentumSubheading} from './momentumCopy.ts';
test('approved response buckets keep exact wording with the cause as the subheading',()=>{
 assert.equal(momentumHeadline('hole_in_one'),'All it takes is 1!');assert.equal(momentumHeadline('birdie_2'),'Another one!');
 assert.equal(momentumHeadline('birdie_3'),'Heating Up!');assert.equal(momentumHeadline('birdie_4'),'Catching fire!');assert.equal(momentumHeadline('early_match_win'),'That was quick!');
 assert.equal(momentumSubheading('birdie_3','Cam'),'3 birdies in a row for Cam');assert.equal(momentumSubheading('early_match_win','Cam','5&4'),'Cam won 5&4 before hole 16');
});
