import { NextResponse } from "next/server"

export async function GET() {
  try {
    const response = await fetch("https://ke8rxnwx.net/data/fcc-index.json", {
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error fetching FCC index:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch FCC index" },
      { status: 500 }
    )
  }
}
