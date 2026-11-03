// Uso: npm run parse -- caminho/da/tab.txt
import { readFileSync } from "node:fs";
import { parseTab } from "../src/parser";

const file = process.argv[2];
if (!file) {
  console.error("Uso: npm run parse -- caminho/da/tab.txt");
  process.exit(1);
}
console.log(JSON.stringify(parseTab(readFileSync(file, "utf8")), null, 2));
