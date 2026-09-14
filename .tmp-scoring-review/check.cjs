const fs=require('fs');
const assert=require('node:assert/strict');
(async()=>{
await require('esbuild').build({entryPoints:['.tmp-scoring-review/entry.tsx'],outfile:'.tmp-scoring-review/bundle.js',bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
const css=await require('postcss')([require('@tailwindcss/postcss')()]).process(fs.readFileSync('app/globals.css','utf8'),{from:'app/globals.css'});
const browser=await require('playwright').chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.setContent('<html><head></head><body><div id="root"></div></body></html>');
await page.addStyleTag({content:css.css});await page.addScriptTag({path:'.tmp-scoring-review/bundle.js'});
await page.getByRole('group',{name:'Your score',exact:true}).waitFor();
assert.equal(await page.locator('input[type="number"]').count(),0);
assert.equal(await page.getByRole('group',{name:/ score$/}).count(),2);
assert.equal(await page.getByRole('group',{name:'Barone score',exact:true}).count(),1);
assert.equal(await page.getByRole('group',{name:'Peabody score',exact:true}).count(),0);
await page.getByRole('group',{name:'Your score',exact:true}).getByRole('button',{name:'5',exact:true}).click();
await page.getByRole('group',{name:'Barone score',exact:true}).getByRole('button',{name:'3',exact:true}).click();
await page.getByText('Total: 5',{exact:true}).waitFor();
await page.screenshot({path:'.tmp-scoring-review/mobile.png',fullPage:true});
await page.getByRole('button',{name:'Next Hole',exact:true}).click();
await page.getByRole('button',{name:'Hole 2',exact:true}).waitFor();
assert.equal(await page.getByRole('button',{name:'Hole 2',exact:true}).getAttribute('aria-pressed'),'true');
await page.getByRole('button',{name:'Next Hole',exact:true}).click();
assert.equal(await page.getByRole('button',{name:'Hole 3',exact:true}).getAttribute('aria-pressed'),'true');
await page.getByRole('button',{name:'Hole 18',exact:true}).click();
await page.getByRole('button',{name:'Finish round',exact:true}).click();
await page.getByRole('button',{name:'Confirm submission',exact:true}).click();
await page.getByText('Scores submitted for this round.',{exact:true}).waitFor();
console.log('Mobile preview passed: paired sliders, score changes, totals, untouched-hole saving, navigation, and final submission.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});