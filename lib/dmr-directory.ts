// RadioID's per-callsign API rate-limits bursts (HTTP 429), so large searches lost most
// lookups. RadioID publishes the full user list daily; load it once and answer from memory.
const DIRECTORY_URL = "https://radioid.net/static/user.csv"
const REFRESH_MS = 12 * 60 * 60 * 1000

type Directory = {
  idByCallsign: Map<string, string>
  callsignById: Map<string, string>
  loadedAt: number
}

let directory: Directory | null = null
let pending: Promise<Directory> | null = null

async function downloadDirectory(): Promise<Directory> {
  // The file (~17 MB) exceeds the Next.js data cache limit, so it is cached in memory instead.
  const response = await fetch(DIRECTORY_URL, { cache: "no-store", signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`RadioID directory returned ${response.status}`)
  const text = await response.text()

  const idByCallsign = new Map<string, string>()
  const callsignById = new Map<string, string>()
  let start = text.indexOf("\n") + 1
  while (start > 0 && start < text.length) {
    let end = text.indexOf("\n", start)
    if (end === -1) end = text.length
    const firstComma = text.indexOf(",", start)
    if (firstComma > start && firstComma < end) {
      const secondComma = text.indexOf(",", firstComma + 1)
      const id = text.slice(start, firstComma).trim()
      const callsign = text
        .slice(firstComma + 1, secondComma > firstComma && secondComma < end ? secondComma : end)
        .trim()
        .toUpperCase()
      if (/^\d+$/.test(id) && callsign) {
        callsignById.set(id, callsign)
        // The file is sorted by ID; keep each callsign's first (lowest) ID, matching RadioID's API.
        if (!idByCallsign.has(callsign)) idByCallsign.set(callsign, id)
      }
    }
    start = end + 1
  }

  if (idByCallsign.size === 0) throw new Error("RadioID directory was empty")
  return { idByCallsign, callsignById, loadedAt: Date.now() }
}

export async function getDmrDirectory(): Promise<Directory> {
  const isFresh = directory && Date.now() - directory.loadedAt < REFRESH_MS
  if (isFresh && directory) return directory

  if (!pending) {
    pending = downloadDirectory()
      .then((loaded) => {
        directory = loaded
        return loaded
      })
      .finally(() => {
        pending = null
      })
  }

  // Serve stale data while refreshing; only wait when nothing is loaded yet.
  if (directory) {
    pending.catch(() => {})
    return directory
  }
  return pending
}

export async function lookupDmrIds(callsigns: string[]): Promise<Record<string, string>> {
  const { idByCallsign } = await getDmrDirectory()
  const result: Record<string, string> = {}
  for (const callsign of callsigns) {
    const id = idByCallsign.get(callsign.toUpperCase())
    if (id) result[callsign.toUpperCase()] = id
  }
  return result
}

export async function lookupCallsignByDmrId(id: string): Promise<string | null> {
  const { callsignById } = await getDmrDirectory()
  return callsignById.get(id) ?? null
}
