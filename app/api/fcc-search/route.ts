import { NextResponse } from "next/server"

interface CallsignRecord {
  callsign: string
  callsign_lc: string
  full_name: string
  full_address: string
  service: string
  frn: string
}

// Store the index in memory after first load
let cachedIndex: CallsignRecord[] | null = null
let isLoading = false
let loadPromise: Promise<CallsignRecord[]> | null = null

async function loadIndex(): Promise<CallsignRecord[]> {
  if (cachedIndex) {
    return cachedIndex
  }

  // If already loading, wait for the existing promise
  if (isLoading && loadPromise) {
    return loadPromise
  }

  isLoading = true
  loadPromise = (async () => {
    const response = await fetch("https://ke8rxnwx.net/data/fcc-index.json", {
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`)
    }

    const data = await response.json()
    cachedIndex = data
    isLoading = false
    return data
  })()

  return loadPromise
}

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
    const index = await loadIndex()
    const searchTerm = callsign.trim().toLowerCase()
    
    // First find the searched callsign to get its FRN
    const primaryResult = index.find((record: CallsignRecord) => record.callsign_lc === searchTerm)

    if (!primaryResult) {
      return NextResponse.json(
        { error: "Callsign not found" },
        { status: 404 }
      )
    }

    // Find all callsigns with the same FRN
    const relatedCallsigns = index.filter(
      (record: CallsignRecord) => record.frn === primaryResult.frn
    )

    return NextResponse.json({
      primary: primaryResult,
      related: relatedCallsigns,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search" },
      { status: 500 }
    )
  }
}
