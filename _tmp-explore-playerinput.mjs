import XLSX from "xlsx";
const wb = XLSX.readFile("Maroon Masters Pinehurst (1).xlsx");
const sheet = wb.Sheets["Player Input"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  for (let c = 0; c < row.length; c++) {
    const v = String(row[c] ?? "").trim();
    if (/^Round \d+$/.test(v)) console.log(`row ${i} col ${c}: ${v}`);
    if (v === "Hole") console.log(`  row ${i} col ${c}: HOLE — player name col1="${row[1]}" col3="${row[3]}"`);
  }
}
console.log(`\ntotal rows: ${rows.length}`);
