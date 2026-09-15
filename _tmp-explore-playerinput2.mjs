import XLSX from "xlsx";
const wb = XLSX.readFile("Maroon Masters Pinehurst (1).xlsx");
const sheet = wb.Sheets["Player Input"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

for (let i = 0; i < rows.length; i++) {
  const v = String(rows[i][1] ?? "").trim();
  if (v.includes("TOURNAMENT")) console.log(`row ${i}: ${v.replace(/\n/g, " / ")}`);
}
console.log(`\ntotal rows: ${rows.length}`);
