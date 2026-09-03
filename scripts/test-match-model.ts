import { careerArchiveRecords } from "../lib/data/careerArchive.generated";

const [playerA = "CADE", playerB = "CAM", course = "TPC Danzante Bay", format = "Singles"] = process.argv.slice(2);
const bucket = (yards: number) => yards <= 150 ? "a" : yards <= 200 ? "b" : yards <= 250 ? "c" : yards <= 350 ? "d" : yards <= 400 ? "e" : yards <= 450 ? "f" : yards <= 500 ? "g" : "h";
const setup = [...new Map(careerArchiveRecords.filter(r => r.course === course).map(r => [r.hole, r])).values()].sort((a,b)=>a.hole-b.hole);
if (setup.length !== 18) throw new Error(`${course} does not have a complete 18-hole setup in Career Stats.`);
type Tier = { name: string; source: (player:string,hole:typeof setup[number]) => typeof careerArchiveRecords };
const complete = careerArchiveRecords.filter(r => r.roundHoles === 18 && r.format === format);
const tiers: Tier[] = [
 { name:"Exact course + par + yardage + side", source:(p,h)=>complete.filter(r=>r.player===p&&r.course===course&&r.par===h.par&&bucket(r.yards)===bucket(h.yards)&&(r.hole<=9)===(h.hole<=9)) },
 { name:"Par + yardage + side", source:(p,h)=>complete.filter(r=>r.player===p&&r.par===h.par&&bucket(r.yards)===bucket(h.yards)&&(r.hole<=9)===(h.hole<=9)) },
 { name:"Par + yardage", source:(p,h)=>complete.filter(r=>r.player===p&&r.par===h.par&&bucket(r.yards)===bucket(h.yards)) },
 { name:"Player format baseline", source:(p,_h)=>complete.filter(r=>r.player===p) },
];
for(const tier of tiers){let aw=0,bw=0,tie=0, min=Infinity; for(const h of setup){min=Math.min(min,tier.source(playerA,h).length,tier.source(playerB,h).length)} if(!Number.isFinite(min)||min===0){console.log(`${tier.name}: cannot run — at least one comparison bucket has 0 samples.`);continue} for(let i=0;i<10000;i++){let lead=0;for(const h of setup){const a=tier.source(playerA,h),b=tier.source(playerB,h);const as=a[Math.floor(Math.random()*a.length)].score-h.par,bs=b[Math.floor(Math.random()*b.length)].score-h.par;if(as<bs)lead++;else if(bs<as)lead--;}if(lead>0)aw++;else if(lead<0)bw++;else tie++;} console.log(`${tier.name}: ${playerA} ${(aw/100).toFixed(1)}%, tie ${(tie/100).toFixed(1)}%, ${playerB} ${(bw/100).toFixed(1)}% | minimum per-hole sample ${min}`)}
