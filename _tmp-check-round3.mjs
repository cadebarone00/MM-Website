import XLSX from "xlsx";
const wb = XLSX.readFile("Maroon Masters Pinehurst (1).xlsx");
const sheet = wb.Sheets["Player Input"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
// Cam Latto's block is rows 6-17. Find every "Hole" cell in that band.
for (let r = 6; r <= 17; r++) {
  const row = rows[r];
  for (let c = 0; c < row.length; c++) {
    if (String(row[c]).trim() === "Hole") console.log(`row ${r} col ${c}`);
  }
}
console.log("\n--- full rows 6-17, columns 44-70 (round 3 area) ---");
for (let r = 6; r <= 17; r++) console.log(r, JSON.stringify(rows[r].slice(44, 70)));
