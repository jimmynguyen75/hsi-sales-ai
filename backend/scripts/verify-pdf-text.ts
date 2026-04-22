import { extractTextFromFile } from "../src/services/rfp-extract.js";
import { readFileSync } from "fs";

const path = process.argv[2] ?? "/tmp/hsi-quotation.pdf";
const buf = readFileSync(path);
const r = await extractTextFromFile(buf, path);
console.log(`--- ${path} ---`);
console.log(r.text.slice(0, 1000));
