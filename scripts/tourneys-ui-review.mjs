import {chromium} from 'playwright';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://localhost:3001/tournaments/join',{waitUntil:'networkidle'});
console.log(await page.evaluate(()=>Array.from(document.styleSheets).flatMap(s=>{try{return Array.from(s.cssRules).map(r=>r.cssText)}catch{return[]}}).filter(r=>r.includes('rowText')).join('\n').slice(0,3000)));
await browser.close();
