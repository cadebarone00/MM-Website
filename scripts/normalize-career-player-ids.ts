import fs from "node:fs";
import { requirePlayerSlug } from "../lib/data/players/index.ts";

const file = "lib/data/careerArchive.generated.ts";
const source = fs.readFileSync(file, "utf8");
let changed = 0;
const result = source.replace(/JSON\.parse\(("(?:[^"\\]|\\.)*")\)/g, (_match, encoded: string) => {
  const rows = JSON.parse(JSON.parse(encoded));
  for (const row of rows) {
    for (const field of ["player", "partner", "player1", "player2"]) {
      if (!row[field]) continue;
      const slug = requirePlayerSlug(row[field]);
      if (slug !== row[field]) changed++;
      row[field] = slug;
    }
  }
  return "JSON.parse(" + JSON.stringify(JSON.stringify(rows)) + ")";
});
fs.writeFileSync(file, result);
console.log("Normalized", changed, "career player references.");
