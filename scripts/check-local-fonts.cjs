const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../public/fonts');
let fonts = 0;
for (const family of ['spectral', 'barlow', 'barlow-semi-condensed', 'inter', 'roboto']) {
  const dir = path.join(root, family);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8'));
  assert.match(fs.readFileSync(path.join(dir, 'OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1.1/);
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(dir, entry.file));
    assert.equal(bytes.length, entry.bytes, entry.file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.file);
    if (entry.gitBlob) assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex'), entry.gitBlob, entry.file);
    if (entry.file.endsWith('.ttf')) fonts++;
  }
}
assert.equal(fonts, 33);
console.log(`PASS: ${fonts} font binaries and all vendored license/metadata hashes verified.`);
