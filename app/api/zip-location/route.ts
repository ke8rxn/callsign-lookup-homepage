import { NextResponse } from "next/server"

// Maidenhead grid square -> approximate lat/lon (center of the square).
// Used only as a fallback when the direct geocoder is unavailable.
function gridToLatLon(grid: string): { lat: number; lon: number } | null {
  const g = grid.trim().toUpperCase()
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(g)) return null

  const A = "A".charCodeAt(0)
  let lon = (g.charCodeAt(0) - A) * 20 - 180
  let lat = (g.charCodeAt(1) - A) * 10 - 90
  lon += Number.parseInt(g[2], 10) * 2
  lat += Number.parseInt(g[3], 10) * 1

  if (g.length === 6) {
    lon += (g.charCodeAt(4) - A) * (2 / 24)
    lat += (g.charCodeAt(5) - A) * (1 / 24)
    lon += 2 / 24 / 2
    lat += 1 / 24 / 2
  } else {
    lon += 1
    lat += 0.5
  }

  return { lat, lon }
}

let gridCache: Record<string, string> | null = null

async function getGridMap(): Promise<Record<string, string>> {
  if (gridCache) return gridCache
  const response = await fetch("https://callsigns.ke8rxnwx.net/zip_to_grid.json", {
    next: { revalidate: 86400 },
  })
  if (!response.ok) throw new Error("Failed to fetch grid square data")
  gridCache = (await response.json()) as Record<string, string>
  return gridCache
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const zip = searchParams.get("zip")

  if (!zip || !/^\d{5}$/.test(zip.trim())) {
    return NextResponse.json({ error: "Invalid or missing zip parameter" }, { status: 400 })
  }

  const zipKey = zip.trim().substring(0, 5)

  // Primary: geocode the ZIP directly to precise lat/lon (no grid-square rounding).
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zipKey}`, {
      next: { revalidate: 86400 },
    })
    if (res.ok) {
      const data = await res.json()
      const place = data?.places?.[0]
      const lat = Number.parseFloat(place?.latitude)
      const lon = Number.parseFloat(place?.longitude)
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        const label = place?.["place name"] && place?.["state abbreviation"]
          ? `${place["place name"]}, ${place["state abbreviation"]} ${zipKey}`
          : `ZIP ${zipKey}`
        return NextResponse.json({ lat, lon, label, source: "geocode" })
      }
    }
  } catch (err) {
    console.log("[v0] zip-location geocode error:", err)
  }

  // Fallback: resolve via the ZIP->grid map, then grid center -> lat/lon.
  try {
    const gridMap = await getGridMap()
    const grid = gridMap[zipKey]
    const coords = grid ? gridToLatLon(grid) : null
    if (coords) {
      return NextResponse.json({ lat: coords.lat, lon: coords.lon, label: `ZIP ${zipKey}`, source: "grid" })
    }
  } catch (err) {
    console.log("[v0] zip-location grid fallback error:", err)
  }

  return NextResponse.json({ error: "Could not find a location for that ZIP code." }, { status: 404 })
}
