// node scripts/import-course-photos.cjs "path/to/MM-Website"
// Reads immediate course folders only; never changes source images.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const key = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
async function main() {
  if (!process.argv[2]) throw new Error('Pass the MM-Website folder containing the course folders.');
  const source = path.resolve(process.argv[2]);
  const manifestPath = path.resolve('lib/data/coursePhotos.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const ignored = new Set(['public', 'node_modules', 'players', 'maroon', 'white', 'app', 'lib', 'components', 'scripts', 'docs']);
  for (const folder of await fs.readdir(source, { withFileTypes: true })) {
    if (!folder.isDirectory() || folder.name.startsWith('.') || ignored.has(folder.name.toLowerCase())) continue;
    const courseKey = key(folder.name);
    if (!courseKey) continue;
    const files = (await fs.readdir(path.join(source, folder.name))).filter(name => /\.(png|jpe?g|webp|avif)$/i.test(name)).sort();
    const mainPhotos = files.map(name => ({ name, match: name.match(/(?:^|[\s_-])main[\s_-]*([123])(?=\.[^.]+$)/i) })).filter(item => item.match);
    if (!mainPhotos.length) continue;
    const output = path.resolve('public/schedule/courses', courseKey);
    await fs.mkdir(output, { recursive: true });
    const urls = new Map();
    for (const [index, file] of files.entries()) {
      const filename = `${index + 1}.webp`;
      await sharp(path.join(source, folder.name, file)).rotate().resize({ width: 2200, withoutEnlargement: true }).webp({ quality: 88 }).toFile(path.join(output, filename));
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
