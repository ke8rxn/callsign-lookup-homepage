import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const callsign = searchParams.get("callsign")

  if (!callsign) {
    return NextResponse.json(
      { error: "Callsign parameter is required" },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(
      `https://api.ke8rxnwx.net/crossref/${encodeURIComponent(callsign.trim().toLowerCase())}`
    )

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Callsign not found" },
          { status: 404 }
        )
      }
      throw new Error(`API returned ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search" },
      { status: 500 }
    )
  }
}
