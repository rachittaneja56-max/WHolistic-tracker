import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'release')
const apiOrigin = String(process.env.PDKG_API_ORIGIN || '').replace(/\/$/, '')
if (!apiOrigin.startsWith('https://')) throw new Error('PDKG_API_ORIGIN must be a fixed HTTPS origin')
const parsed = new URL(apiOrigin)
if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
  throw new Error('PDKG_API_ORIGIN must not include a path, query, or fragment')
}

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
for (const file of ['background.js', 'leetcode-client.js', 'job-state.js', 'popup.html', 'popup.css', 'popup.js']) {
  await cp(path.join(root, file), path.join(output, file))
}
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.release.json'), 'utf8'))
manifest.host_permissions = ['https://leetcode.com/*', `${apiOrigin}/*`]
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Release extension written to ${output} for ${apiOrigin}`)
