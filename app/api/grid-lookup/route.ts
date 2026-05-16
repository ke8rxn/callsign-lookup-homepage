import { NextResponse } from "next/server"

let gridCache: Record<string, string> | null = null

async function getGridMap(): Promise<Record<string, string>> {
  if (gridCache) return gridCache

  const response = await fetch("https://callsign.ke8rxnwx.net/zip_to_grid.json", {
    next: { revalidate: 86400 }, // Cache for 24 hours
  })

  if (!response.ok) {
    throw new Error("Failed to fetch grid square data")
  }

  gridCache = await response.json()
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

    return NextResponse.json({ grid })
  } catch {
    return NextResponse.json({ grid: null })
  }
}
