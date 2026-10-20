// Keep this frontend portable: no app UI, auth, database or business-engine imports.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const ui = path.join(root, 'components/marketing');
const entry = path.join(root, 'app/dev-website/page.tsx');
const allowedPackages = new Set(['react', 'react/jsx-runtime', 'next', 'next/image', 'next/link', 'next/navigation', 'lucide-react']);
const errors = [];
const sources = [entry];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else if (/\.(tsx?|css)$/.test(file)) sources.push(file);
  }
}
walk(ui);
function insideUi(file) {
  const relative = path.relative(ui, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function checkImport(file, specifier) {
  // The server entry composes an external account slot. Marketing modules still cannot import auth/data.
  if (file === entry && ['@/lib/website/playerSession', '@/components/website/WebsiteAccountActions'].includes(specifier)) return;
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
    if (!allowedPackages.has(specifier)) errors.push(`${path.relative(root, file)}: unapproved package ${specifier}`);
    return;
  }
  const target = specifier.startsWith('@/') ? path.resolve(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
  if (!insideUi(target)) errors.push(`${path.relative(root, file)}: import crosses marketing boundary: ${specifier}`);
}
for (const file of sources) {
  const source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.css')) {
    if (/@import\b/i.test(source)) errors.push(`${path.relative(root, file)}: CSS imports must be reviewed`);
  } else {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) checkImport(file, node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require')) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) checkImport(file, argument.text);
        else errors.push(`${path.relative(root, file)}: nonliteral import needs review`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  // Literal public asset references must belong to the website asset directory.
  for (const match of source.matchAll(/["'(](\/(?!\/)[^"'()\s]+\.(?:svg|png|jpe?g|webp|mp4|woff2?))/gi)) {
    if (!match[1].startsWith('/marketing/')) errors.push(`${path.relative(root, file)}: shared/legacy asset ${match[1]}`);
    else if (!fs.existsSync(path.join(root, 'public', match[1]))) errors.push(`Missing asset ${match[1]}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Marketing boundary OK: ${sources.length} files; no mobile UI, legacy service or business logic imports. Root layout inheritance is outside this check.`);
