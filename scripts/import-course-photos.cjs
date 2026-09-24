// node scripts/import-course-photos.cjs "path/to/MM-Website"
// Reads course folders and their photo subfolders; optional trailing folder names limit the import.
// Never changes source images.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createHash } = require('node:crypto');
const key = value => value.replace(/[\s_-]*photos$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function imageFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await imageFiles(directory, relative));
    else if (entry.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(entry.name)) result.push(relative);
  }
  return result.sort();
}
async function main() {
  if (!process.argv[2]) throw new Error('Pass the MM-Website folder containing the course folders.');
  const source = path.resolve(process.argv[2]);
  const manifestPath = path.resolve('lib/data/coursePhotos.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const ignored = new Set(['public', 'node_modules', 'players', 'maroon', 'white', 'app', 'lib', 'components', 'scripts', 'docs']);
  for (const folder of await fs.readdir(source, { withFileTypes: true })) {
    if (!folder.isDirectory() || folder.name.startsWith('.') || ignored.has(folder.name.toLowerCase())) continue;
    const selected = process.argv.slice(3);
    if (selected.length && !selected.includes(folder.name)) continue;
    const courseKey = key(folder.name);
    if (!courseKey) continue;
    const files = await imageFiles(path.join(source, folder.name));
    const mainPhotos = files.map(name => ({ name, match: name.match(/(?:^|[\s_-])main[\s_-]*([123])(?=\.[^.]+$)/i) })).filter(item => item.match);
    if (!mainPhotos.length && !process.argv.slice(3).includes(folder.name) && !Object.values(manifest).some(entry => key(entry.name) === courseKey)) continue;
    for (const [oldKey, entry] of Object.entries(manifest)) if (key(entry.name) === courseKey) delete manifest[oldKey];
    const output = path.resolve('public/schedule/courses', courseKey);
    await fs.mkdir(output, { recursive: true });
    const urls = new Map();
    for (const file of files) {
      const image = await sharp(path.join(source, folder.name, file)).rotate().resize({ width: 2200, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
      const filename = createHash("sha256").update(image).digest("hex").slice(0, 20) + ".webp";
      await fs.writeFile(path.join(output, filename), image);
      urls.set(file, `/schedule/courses/${courseKey}/${filename}`);
    }
    manifest[courseKey] = {
      name: folder.name,
      main: mainPhotos.sort((a, b) => Number(a.match[1]) - Number(b.match[1])).map(item => urls.get(item.name)),
      library: files.filter(file => !mainPhotos.some(item => item.name === file)).map(file => urls.get(file)),
    };
    console.log(`${folder.name}: ${mainPhotos.length} main photos, ${manifest[courseKey].library.length} library photos`);
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
