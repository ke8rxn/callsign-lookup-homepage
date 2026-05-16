import { NextResponse } from "next/server"

let gridCache: Record<string, string> | null = null

async function getGridMap(): Promise<Record<string, string>> {
  if (gridCache) return gridCache

  const response = await fetch("https://callsign.ke8rxnwx.net/zip_to_grid.json", {
    next: { revalidate: 86400 }, // Cache for 24 hours
  })

  console.log("[v0] grid-lookup fetch status:", response.status, response.ok)

  if (!response.ok) {
    throw new Error("Failed to fetch grid square data")
  }

  const data = await response.json()
  console.log("[v0] grid-lookup data type:", typeof data, "keys sample:", Object.keys(data).slice(0, 5))
  gridCache = data
  return gridCache as Record<string, string>
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const zip = searchParams.get("zip")

  if (!zip) {
    return NextResponse.json({ error: "Missing zip parameter" }, { status: 400 })
  }

  try {
    const gridMap = await getGridMap()
    // Try exact zip, also try 5-digit prefix if longer
    const zipKey = zip.trim().substring(0, 5)
    const grid = gridMap[zipKey] || null
    console.log("[v0] grid-lookup zip:", zipKey, "grid:", grid, "mapHasKey:", zipKey in gridMap)

    return NextResponse.json({ grid })
  } catch (err) {
    console.log("[v0] grid-lookup error:", err)
    return NextResponse.json({ grid: null })
  }
}
