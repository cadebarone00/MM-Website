/** Owner-approved response buckets, 2026-10-09. Add wording only after owner approval. */
export const MOMENTUM_RESPONSES = {
 hole_in_one: ['All it takes is 1!'],
 birdie_2: ['Another one!'],
 birdie_3: ['Heating Up!'],
 birdie_4: ['Catching fire!'],
 early_match_win: ['That was quick!'],
} as const;
export type MomentumCause = keyof typeof MOMENTUM_RESPONSES;
export function momentumHeadline(cause:MomentumCause,turn=0):string {
 const bucket=MOMENTUM_RESPONSES[cause];return bucket[((turn%bucket.length)+bucket.length)%bucket.length];
}
export function momentumSubheading(cause:MomentumCause,name:string,result?:string):string {
 if(cause==='hole_in_one')return 'Hole in 1 for '+name;
 if(cause==='early_match_win')return name+' won '+(result??'their match')+' before hole 16';
 return cause.slice(-1)+' birdies in a row for '+name;
}
