#!/usr/bin/env node

const args = process.argv.slice(2)

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp()
  process.exit(0)
}

const text = args[0]?.trim()
if (!text) {
  console.error("A capture text argument is required.")
  printHelp()
  process.exit(1)
}

const options = parseOptions(args.slice(1))
const apiUrl = (process.env.KLOG_API_URL || "http://localhost:8000").replace(/\/$/, "")
const token = (process.env.KLOG_TOKEN || "").trim()

if (!token) {
  console.error("KLOG_TOKEN is required.")
  process.exit(1)
}

const payload = {
  text,
  type: options.type || "til",
  project: options.project || null,
  tags: options.tags ? options.tags.split(",").map((item) => item.trim()).filter(Boolean) : [],
  repo_url: options.repoUrl || null,
}

const response = await fetch(`${apiUrl}/capture/cli`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
})

if (!response.ok) {
  const errorText = await response.text()
  console.error(errorText || `Request failed with status ${response.status}`)
  process.exit(1)
}

const result = await response.json()
console.log(`Created ${result.entity.type} ${result.entity.id}`)
if (result.linked_project_id) {
  console.log(`Linked project: ${result.linked_project_id}`)
}

function parseOptions(parts) {
  const options = {}
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part === "--type") {
      options.type = parts[index + 1]
      index += 1
      continue
    }
    if (part === "--project") {
      options.project = parts[index + 1]
      index += 1
      continue
    }
    if (part === "--tags") {
      options.tags = parts[index + 1]
      index += 1
      continue
    }
    if (part === "--repo-url" || part === "--repo_url") {
      options.repoUrl = parts[index + 1]
      index += 1
      continue
    }
  }
  return options
}

function printHelp() {
  console.log(`klog \"text\" [--type til|note|task|idea] [--project name] [--tags a,b] [--repo-url https://github.com/owner/repo]\n\nEnvironment:\n  KLOG_API_URL   default http://localhost:8000\n  KLOG_TOKEN     required bearer token`)
}
