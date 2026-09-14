import XLSX from "xlsx";
const wb = XLSX.readFile("Maroon Masters Pinehurst (1).xlsx");
for (const [sheetName, rowsRange] of [["Tuesday", [7, 20]], ["Thursday", [0, 20]], ["Friday", [0, 20]]]) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  console.log(`\n=== ${sheetName} ===`);
  for (let i = rowsRange[0]; i < rowsRange[1]; i++) {
    const row = rows[i];
    if (row.some((c) => c !== "")) console.log(i, JSON.stringify(row));
  }
}
