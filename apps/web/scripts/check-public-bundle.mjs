import { readFile, readdir } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import path from "node:path"

const root = path.resolve("dist")
const manifest = JSON.parse(await readFile(path.join(root, ".vite", "manifest.json"), "utf8"))
const entry = Object.values(manifest).find((item) => item.isEntry && (item.src === "src/main.tsx" || item.src === "index.html"))
if (!entry) throw new Error("Unable to locate the public entry bundle")

const files = new Set()
function visit(chunk) {
  if (!chunk || files.has(chunk.file)) return
  if (chunk.file.endsWith(".js")) files.add(chunk.file)
  for (const key of chunk.imports ?? []) visit(manifest[key])
}
visit(entry)

let total = 0
for (const file of files) total += gzipSync(await readFile(path.join(root, file))).byteLength
const kib = total / 1024
const budgetKib = 200
console.log(`Public initial JavaScript: ${kib.toFixed(1)} KiB gzip across ${files.size} file(s)`)
if (kib > budgetKib) throw new Error(`Public entry exceeds the ${budgetKib} KiB gzip budget`)
