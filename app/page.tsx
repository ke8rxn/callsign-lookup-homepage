"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, Radio, MapPin, Moon, Sun, Loader2, Download, Users, Menu, SlidersHorizontal, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Part90Page } from "@/components/part90/part90-page"
import { AdvancedSearchPage } from "@/components/advanced-search-page"
import { ApiDocs } from "@/components/api-docs"
import {
  type CallsignRecord,
  formatName,
  formatLicenseClass,
  formatStreet,
  isAmateurRadio,
} from "@/lib/license-format"


interface SearchResult {
  primary: CallsignRecord
  related: CallsignRecord[]
}


export default function CallsignLookup() {
  const [callsign, setCallsign] = useState("")
  const [isDark, setIsDark] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [notFound, setNotFound] = useState<string[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dmrIds, setDmrIds] = useState<Record<string, string>>({})
  const [gridSquares, setGridSquares] = useState<Record<string, string>>({})
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileAmateurDialogOpen, setMobileAmateurDialogOpen] = useState(false)
  const [mobileGmrsDialogOpen, setMobileGmrsDialogOpen] = useState(false)
  const [mobileApiDialogOpen, setMobileApiDialogOpen] = useState(false)
  const [view, setView] = useState<"callsign" | "part90" | "advanced">("callsign")

  useEffect(() => {
    const syncView = () => {
      const isPart90 = new URLSearchParams(window.location.search).get("view") === "part90"
      setView((current) => (isPart90 ? "part90" : current === "part90" ? "callsign" : current))
    }
    syncView()
    window.addEventListener("popstate", syncView)
    return () => window.removeEventListener("popstate", syncView)
  }, [])

  const selectView = useCallback((next: "callsign" | "part90" | "advanced") => {
    setView(next)
    const url = next === "part90" ? `${window.location.pathname}?view=part90` : window.location.pathname
    if (next === "part90" && new URLSearchParams(window.location.search).get("view") === "part90") return
    window.history.replaceState(null, "", url)
  }, [])

  // Fetch DMR ID for a callsign via server-side proxy (avoids CORS issues)
  const fetchDmrId = useCallback(async (amateurCallsign: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/dmr-lookup?callsign=${encodeURIComponent(amateurCallsign)}`)
      if (!response.ok) return null
      const data = await response.json()
      return data.dmrId || null
    } catch {
      return null
    }
  }, [])

  // Fetch grid square from zip code using client-side lookup
  const gridMapCache = useRef<Record<string, string> | null>(null)
  const fetchGridSquare = useCallback(async (zip: string): Promise<string | null> => {
    if (!zip) return null
    try {
      // Fetch and cache the zip-to-grid JSON on first use
      if (!gridMapCache.current) {
        const response = await fetch("https://callsigns.ke8rxnwx.net/zip_to_grid.json")
        if (!response.ok) return null
        gridMapCache.current = await response.json()
      }
      const zipKey = zip.trim().substring(0, 5)
      return gridMapCache.current?.[zipKey] || null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark")
    setIsDark(isDarkMode)
  }, [])

  const toggleTheme = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    if (newIsDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  const exportToCSV = useCallback(() => {
    if (searchResults.length === 0) return

    // CSV headers
    const headers = ["Callsign", "Name", "Street", "City", "State", "ZIP", "Service", "License Class", "DMR ID", "Grid Square"]
    
    // Build CSV rows from all related callsigns
    const rows: string[][] = []
    for (const result of searchResults) {
      const amateurRecord = result.related.find(r => isAmateurRadio(r.service)) || result.primary
      const dmrId = amateurRecord ? dmrIds[amateurRecord.callsign] || "" : ""
      const gridSquare = gridSquares[result.primary.callsign] || ""
      
      for (const record of result.related) {
        rows.push([
          record.callsign,
          formatName(amateurRecord.name),
          formatStreet(amateurRecord.street),
          amateurRecord.city || "",
          amateurRecord.state || "",
          amateurRecord.zip || "",
          isAmateurRadio(record.service) ? "Amateur" : "GMRS",
          isAmateurRadio(record.service) && record.class ? formatLicenseClass(record.class) : "",
          isAmateurRadio(record.service) ? dmrId : "",
          gridSquare
        ])
      }
    }

    // Escape CSV values
    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\n")

    // Create and download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const now = new Date()
    const dateStr = now.toISOString().split("T")[0]
    const timeStr = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "")
    link.download = `callsign-lookup-${dateStr}-${timeStr}UTC.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [searchResults, dmrIds, gridSquares])

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!callsign.trim()) return

    setIsSearching(true)
    setHasSearched(true)
    setError(null)
    setSearchResults([])
    setNotFound([])
    setDmrIds({})
    setGridSquares({})

    // Split by comma, semicolon, or whitespace and clean up each callsign
    const callsigns = callsign
      .split(/[,;\s]+/)
      .map(c => c.trim().toUpperCase())
      .filter(c => c.length > 0)

    // Validate input
    if (callsigns.length === 0) {
      setError("Please enter at least one callsign")
      setIsSearching(false)
      return
    }

    if (callsigns.length > 10) {
      setError("Please enter no more than 10 callsigns at a time")
      setIsSearching(false)
      return
    }

    // Validate each callsign format (alphanumeric, 3-7 characters)
    const invalidCallsigns = callsigns.filter(cs => !/^[A-Z0-9]{3,7}$/.test(cs))
    if (invalidCallsigns.length > 0) {
      setError(`Invalid callsign format: ${invalidCallsigns.join(", ")}. Callsigns must be 3-7 alphanumeric characters.`)
      setIsSearching(false)
      return
    }

    try {
      const results: SearchResult[] = []
      const notFoundList: string[] = []

      // Fetch all callsigns in parallel
      const responses = await Promise.all(
        callsigns.map(async (cs) => {
          const response = await fetch(`/api/fcc-search?callsign=${encodeURIComponent(cs)}`)
          return { callsign: cs, response }
        })
      )

      for (const { callsign: cs, response } of responses) {
        if (response.ok) {
          const data = await response.json()
          results.push(data)
        } else if (response.status === 404) {
          notFoundList.push(cs)
        } else {
          const data = await response.json()
          setError(data.error || `Search failed for ${cs}`)
        }
      }

      setSearchResults(results)
      setNotFound(notFoundList)

      // Fetch DMR IDs for amateur callsigns (in parallel, non-blocking)
      const amateurCallsigns = results
        .flatMap(r => r.related.filter(rec => isAmateurRadio(rec.service)))
        .map(rec => rec.callsign)
      
      if (amateurCallsigns.length > 0) {
        Promise.all(
          amateurCallsigns.map(async (cs) => {
            const dmrId = await fetchDmrId(cs)
            return { callsign: cs, dmrId }
          })
        ).then((dmrResults) => {
          const dmrMap: Record<string, string> = {}
          for (const { callsign: cs, dmrId } of dmrResults) {
            if (dmrId) {
              dmrMap[cs] = dmrId
            }
          }
          setDmrIds(dmrMap)
        })
      }

      // Fetch grid squares from zip codes (in parallel, non-blocking)
      const zipEntries = results.map(r => {
        const amateurRec = r.related.find(rec => isAmateurRadio(rec.service)) || r.primary
        return { callsign: r.primary.callsign, zip: amateurRec.zip }
      }).filter(e => e.zip)

      if (zipEntries.length > 0) {
        Promise.all(
          zipEntries.map(async ({ callsign: cs, zip }) => {
            const grid = await fetchGridSquare(zip)
            return { callsign: cs, grid }
          })
        ).then((gridResults) => {
          const gridMap: Record<string, string> = {}
          for (const { callsign: cs, grid } of gridResults) {
            if (grid) {
              gridMap[cs] = grid
            }
          }
          setGridSquares(gridMap)
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setIsSearching(false)
    }
  }, [callsign, fetchDmrId, fetchGridSquare])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip Link for Keyboard Navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-3 py-2 md:px-4 md:py-4 flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="hidden min-[360px]:flex h-8 w-8 md:h-10 md:w-10 rounded-lg bg-primary items-center justify-center" aria-hidden="true">
                <Radio className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
              </div>
              <p className="sr-only sm:not-sr-only text-lg md:text-xl font-bold text-foreground">KE8RXN</p>
            </div>
            {/* View toggle: Callsign Lookup / Repeater Lookup */}
            <div
              role="tablist"
              aria-label="Select lookup tool"
              className="inline-flex items-center rounded-lg border border-border bg-muted p-0.5"
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault()
                  const order = ["callsign", "advanced", "part90"] as const
                  const step = e.key === "ArrowRight" ? 1 : -1
                  const next = order[(order.indexOf(view) + step + order.length) % order.length]
                  selectView(next)
                  document.getElementById(`tab-${next}`)?.focus()
                }
              }}
            >
              <button
                role="tab"
                id="tab-callsign"
                aria-controls={view === "callsign" ? "panel-callsign" : undefined}
                aria-selected={view === "callsign"}
                tabIndex={view === "callsign" ? 0 : -1}
                onClick={() => selectView("callsign")}
                className={`rounded-md px-2 sm:px-2.5 py-1 text-sm font-medium transition-colors ${
                  view === "callsign"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Callsign<span className="hidden sm:inline"> Lookup</span>
              </button>
              <button
                role="tab"
                id="tab-advanced"
                aria-controls={view === "advanced" ? "panel-advanced" : undefined}
                aria-selected={view === "advanced"}
                tabIndex={view === "advanced" ? 0 : -1}
                onClick={() => selectView("advanced")}
                className={`rounded-md px-2 sm:px-2.5 py-1 text-sm font-medium transition-colors ${
                  view === "advanced"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Advanced<span className="hidden sm:inline"> Search</span>
              </button>
              <button
                role="tab"
                id="tab-part90"
                aria-controls={view === "part90" ? "panel-part90" : undefined}
                aria-selected={view === "part90"}
                tabIndex={view === "part90" ? 0 : -1}
                onClick={() => selectView("part90")}
                className={`rounded-md px-2 sm:px-2.5 py-1 text-sm font-medium transition-colors whitespace-nowrap ${
                  view === "part90"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Part 90<span className="hidden sm:inline"> Search</span>
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Mobile Menu */}
            <div className="relative md:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                <Menu className="h-5 w-5" />
              </Button>
              {mobileMenuOpen && (
                <div 
                  className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg py-2 z-50"
                  role="menu"
                  aria-label="Navigation menu"
                >
                  <a
                    href="#"
                    className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    role="menuitem"
                  >
                    Home
                  </a>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      setMobileAmateurDialogOpen(true)
                    }}
                  >
                    Amateur Radio
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      setMobileGmrsDialogOpen(true)
                    }}
                  >
                    GMRS
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      setMobileApiDialogOpen(true)
                    }}
                  >
                    API
                  </button>
                </div>
              )}
              {/* Mobile Amateur Radio Dialog */}
              <Dialog open={mobileAmateurDialogOpen} onOpenChange={setMobileAmateurDialogOpen}>
                <DialogContent className="sm:max-w-lg" aria-describedby="amateur-dialog-description-mobile">
                  <DialogHeader>
                    <DialogTitle>Amateur Radio</DialogTitle>
                    <DialogDescription id="amateur-dialog-description-mobile">
                      Learn about the amateur radio service.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm" role="region" aria-label="Amateur radio information">
                    <p>
                      Amateur radio, also known as ham radio, is a popular hobby and service that brings people, electronics, and communication together. Licensed operators can communicate across town, around the world, or even into space without using the internet or cell networks.
                    </p>
                    <p>
                      In the United States, the FCC issues three license classes with increasing privileges:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li><strong className="text-foreground">Technician</strong> - Entry-level license with VHF/UHF privileges and limited HF access</li>
                      <li><strong className="text-foreground">General</strong> - Expanded HF privileges for worldwide communication</li>
                      <li><strong className="text-foreground">Extra</strong> - Full privileges on all amateur bands</li>
                    </ul>
                    <p className="text-muted-foreground">
                      Amateur radio operators contribute to emergency communications, scientific research, and international goodwill while enjoying the technical aspects of radio communication.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
              {/* Mobile GMRS Dialog */}
              <Dialog open={mobileGmrsDialogOpen} onOpenChange={setMobileGmrsDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby="gmrs-dialog-description-mobile">
                  <DialogHeader>
                    <DialogTitle>General Mobile Radio Service (GMRS)</DialogTitle>
                    <DialogDescription id="gmrs-dialog-description-mobile">
                      Learn about the GMRS radio service and channel frequencies.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm" role="region" aria-label="GMRS information">
                    <p>
                      GMRS is a licensed radio service in the United States for short-distance two-way communication. Unlike amateur radio, no exam is required - simply apply for a license from the FCC. One license covers the holder and their immediate family members.
                    </p>
                    <p>
                      GMRS operates on 22 channels in the UHF band (462-467 MHz), with some channels shared with the unlicensed Family Radio Service (FRS).
                    </p>
                    <div>
                      <table className="w-full text-sm border border-border rounded-lg" aria-label="GMRS channel frequencies">
                        <thead>
                          <tr className="bg-muted">
                            <th scope="col" className="px-1.5 py-1.5 text-left font-medium border-b border-border text-foreground">Ch</th>
                            <th scope="col" className="px-1.5 py-1.5 text-left font-medium border-b border-border text-foreground">Freq (MHz)</th>
                            <th scope="col" className="px-1.5 py-1.5 text-left font-medium border-b border-border text-foreground">Type</th>
                            <th scope="col" className="px-1.5 py-1.5 text-right font-medium border-b border-border text-foreground">Power</th>
                          </tr>
                        </thead>
                        <tbody className="text-foreground">
                          <tr><td className="px-1.5 py-1 border-b border-border/50">1</td><td className="px-1.5 py-1 border-b border-border/50">462.5625</td><td className="px-1.5 py-1 border-b border-border/50">FRS/GMRS</td><td className="px-1.5 py-1 text-right border-b border-border/50">5W</td></tr>
                          <tr><td className="px-1.5 py-1 border-b border-border/50">2</td><td className="px-1.5 py-1 border-b border-border/50">462.5875</td><td className="px-1.5 py-1 border-b border-border/50">FRS/GMRS</td><td className="px-1.5 py-1 text-right border-b border-border/50">5W</td></tr>
                          <tr><td className="px-1.5 py-1 border-b border-border/50">3</td><td className="px-1.5 py-1 border-b border-border/50">462.6125</td><td className="px-1.5 py-1 border-b border-border/50">FRS/GMRS</td><td className="px-1.5 py-1 text-right border-b border-border/50">5W</td></tr>
                          <tr><td className="px-1.5 py-1 border-b border-border/50">4</td><td className="px-1.5 py-1 border-b border-border/50">462.6375</td><td className="px-1.5 py-1 border-b border-border/50">FRS/GMRS</td><td className="px-1.5 py-1 text-right border-b border-border/50">5W</td></tr>
                          <tr><td className="px-1.5 py-1 border-b border-border/50">5</td><td className="px-1.5 py-1 border-b border-border/50">462.6625</td><td className="px-1.5 py-1 border-b border-border/50">FRS/GMRS</td><td className="px-1.5 py-1 text-right border-b border-border/50">5W</td></tr>
                          <tr><td className="px-1.5 py-1 border-b border-border/50">6</td><td className="px-1.5 py-1 border-b border-border/50">462.6875</td><td className="px-1.5 py-1 border-b border-border/50">FRS/GMRS</td><td className="px-1.5 py-1 text-right border-b border-border/50">5W</td></tr>
                          <tr><td className="px-1.5 py-1 border-b border-border/50">7</td><td className="px-1.5 py-1 border-b border-border/50">462.7125</td><td className="px-1.5 py-1 border-b border-border/50">FRS/GMRS</td><td className="px-1.5 py-1 text-right border-b border-border/50">5W</td></tr>
                          <tr className="bg-muted/30"><td className="px-1.5 py-1 border-b border-border/50">8</td><td className="px-1.5 py-1 border-b border-border/50">467.5625</td><td className="px-1.5 py-1 border-b border-border/50">Simplex</td><td className="px-1.5 py-1 text-right border-b border-border/50">0.5W</td></tr>
                          <tr className="bg-muted/30"><td className="px-1.5 py-1 border-b border-border/50">9</td><td className="px-1.5 py-1 border-b border-border/50">467.5875</td><td className="px-1.5 py-1 border-b border-border/50">Simplex</td><td className="px-1.5 py-1 text-right border-b border-border/50">0.5W</td></tr>
                          <tr className="bg-muted/30"><td className="px-1.5 py-1 border-b border-border/50">10</td><td className="px-1.5 py-1 border-b border-border/50">467.6125</td><td className="px-1.5 py-1 border-b border-border/50">Simplex</td><td className="px-1.5 py-1 text-right border-b border-border/50">0.5W</td></tr>
                          <tr className="bg-muted/30"><td className="px-1.5 py-1 border-b border-border/50">11</td><td className="px-1.5 py-1 border-b border-border/50">467.6375</td><td className="px-1.5 py-1 border-b border-border/50">Simplex</td><td className="px-1.5 py-1 text-right border-b border-border/50">0.5W</td></tr>
                          <tr className="bg-muted/30"><td className="px-1.5 py-1 border-b border-border/50">12</td><td className="px-1.5 py-1 border-b border-border/50">467.6625</td><td className="px-1.5 py-1 border-b border-border/50">Simplex</td><td className="px-1.5 py-1 text-right border-b border-border/50">0.5W</td></tr>
                          <tr className="bg-muted/30"><td className="px-1.5 py-1 border-b border-border/50">13</td><td className="px-1.5 py-1 border-b border-border/50">467.6875</td><td className="px-1.5 py-1 border-b border-border/50">Simplex</td><td className="px-1.5 py-1 text-right border-b border-border/50">0.5W</td></tr>
                          <tr className="bg-muted/30"><td className="px-1.5 py-1 border-b border-border/50">14</td><td className="px-1.5 py-1 border-b border-border/50">467.7125</td><td className="px-1.5 py-1 border-b border-border/50">Simplex</td><td className="px-1.5 py-1 text-right border-b border-border/50">0.5W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1 border-b border-border/50">15</td><td className="px-1.5 py-1 border-b border-border/50">462.5500</td><td className="px-1.5 py-1 border-b border-border/50">Repeater</td><td className="px-1.5 py-1 text-right border-b border-border/50">50W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1 border-b border-border/50">16</td><td className="px-1.5 py-1 border-b border-border/50">462.5750</td><td className="px-1.5 py-1 border-b border-border/50">Repeater</td><td className="px-1.5 py-1 text-right border-b border-border/50">50W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1 border-b border-border/50">17</td><td className="px-1.5 py-1 border-b border-border/50">462.6000</td><td className="px-1.5 py-1 border-b border-border/50">Repeater</td><td className="px-1.5 py-1 text-right border-b border-border/50">50W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1 border-b border-border/50">18</td><td className="px-1.5 py-1 border-b border-border/50">462.6250</td><td className="px-1.5 py-1 border-b border-border/50">Repeater</td><td className="px-1.5 py-1 text-right border-b border-border/50">50W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1 border-b border-border/50">19</td><td className="px-1.5 py-1 border-b border-border/50">462.6500</td><td className="px-1.5 py-1 border-b border-border/50">Repeater</td><td className="px-1.5 py-1 text-right border-b border-border/50">50W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1 border-b border-border/50">20</td><td className="px-1.5 py-1 border-b border-border/50">462.6750</td><td className="px-1.5 py-1 border-b border-border/50">Repeater</td><td className="px-1.5 py-1 text-right border-b border-border/50">50W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1 border-b border-border/50">21</td><td className="px-1.5 py-1 border-b border-border/50">462.7000</td><td className="px-1.5 py-1 border-b border-border/50">Repeater</td><td className="px-1.5 py-1 text-right border-b border-border/50">50W</td></tr>
                          <tr className="bg-primary/10"><td className="px-1.5 py-1">22</td><td className="px-1.5 py-1">462.7250</td><td className="px-1.5 py-1">Repeater</td><td className="px-1.5 py-1 text-right">50W</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Channels 15-22 are GMRS-only and allow up to 50W power output. Repeater inputs are 5 MHz below the output frequencies.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
              {/* Mobile API Dialog */}
              <Dialog open={mobileApiDialogOpen} onOpenChange={setMobileApiDialogOpen}>
                <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto" aria-describedby="api-dialog-description-mobile">
                  <DialogHeader>
                    <DialogTitle>API Documentation</DialogTitle>
                    <DialogDescription id="api-dialog-description-mobile">
                      The KE8RXN APIs and data sources behind this site.
                    </DialogDescription>
                  </DialogHeader>
                  <ApiDocs />
                </DialogContent>
              </Dialog>
            </div>
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            <Dialog>
              <DialogTrigger asChild>
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="Learn about Amateur Radio">
                  Amateur Radio
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg" aria-describedby="amateur-dialog-description">
                <DialogHeader>
                  <DialogTitle>Amateur Radio</DialogTitle>
                  <DialogDescription id="amateur-dialog-description">
                    Learn about the amateur radio service.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm" role="region" aria-label="Amateur radio information">
                  <p>
                    Amateur radio, also known as ham radio, is a popular hobby and service that brings people, electronics, and communication together. Licensed operators can communicate across town, around the world, or even into space without using the internet or cell networks.
                  </p>
                  <p>
                    In the United States, the FCC issues three license classes with increasing privileges:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><strong className="text-foreground">Technician</strong> - Entry-level license with VHF/UHF privileges and limited HF access</li>
                    <li><strong className="text-foreground">General</strong> - Expanded HF privileges for worldwide communication</li>
                    <li><strong className="text-foreground">Extra</strong> - Full privileges on all amateur bands</li>
                  </ul>
                  <p className="text-muted-foreground">
                    Amateur radio operators contribute to emergency communications, scientific research, and international goodwill while enjoying the technical aspects of radio communication.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="Learn about GMRS">
                  GMRS
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby="gmrs-dialog-description">
                <DialogHeader>
                  <DialogTitle>General Mobile Radio Service (GMRS)</DialogTitle>
                  <DialogDescription id="gmrs-dialog-description">
                    Learn about the GMRS radio service and channel frequencies.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm" role="region" aria-label="GMRS information">
                  <p>
                    GMRS is a licensed radio service in the United States for short-distance two-way communication. Unlike amateur radio, no exam is required - simply apply for a license from the FCC. One license covers the holder and their immediate family members.
                  </p>
                  <p>
                    GMRS operates on 22 channels in the UHF band (462-467 MHz), with some channels shared with the unlicensed Family Radio Service (FRS).
                  </p>
                  <div>
                    <table className="w-full text-sm border border-border rounded-lg" aria-label="GMRS channel frequencies">
                      <thead>
                        <tr className="bg-muted">
                          <th scope="col" className="px-3 py-2 text-left font-medium border-b border-border text-foreground">Ch</th>
                          <th scope="col" className="px-3 py-2 text-left font-medium border-b border-border text-foreground">Frequency (MHz)</th>
                          <th scope="col" className="px-3 py-2 text-left font-medium border-b border-border text-foreground">Type/Usage</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium border-b border-border text-foreground">Max Power</th>
                        </tr>
                      </thead>
                      <tbody className="text-foreground">
                        <tr><td className="px-3 py-1.5 border-b border-border/50">1</td><td className="px-3 py-1.5 border-b border-border/50">462.5625</td><td className="px-3 py-1.5 border-b border-border/50">Simplex (FRS/GMRS)</td><td className="px-3 py-1.5 text-right border-b border-border/50">5W</td></tr>
                        <tr><td className="px-3 py-1.5 border-b border-border/50">2</td><td className="px-3 py-1.5 border-b border-border/50">462.5875</td><td className="px-3 py-1.5 border-b border-border/50">Simplex (FRS/GMRS)</td><td className="px-3 py-1.5 text-right border-b border-border/50">5W</td></tr>
                        <tr><td className="px-3 py-1.5 border-b border-border/50">3</td><td className="px-3 py-1.5 border-b border-border/50">462.6125</td><td className="px-3 py-1.5 border-b border-border/50">Simplex (FRS/GMRS)</td><td className="px-3 py-1.5 text-right border-b border-border/50">5W</td></tr>
                        <tr><td className="px-3 py-1.5 border-b border-border/50">4</td><td className="px-3 py-1.5 border-b border-border/50">462.6375</td><td className="px-3 py-1.5 border-b border-border/50">Simplex (FRS/GMRS)</td><td className="px-3 py-1.5 text-right border-b border-border/50">5W</td></tr>
                        <tr><td className="px-3 py-1.5 border-b border-border/50">5</td><td className="px-3 py-1.5 border-b border-border/50">462.6625</td><td className="px-3 py-1.5 border-b border-border/50">Simplex (FRS/GMRS)</td><td className="px-3 py-1.5 text-right border-b border-border/50">5W</td></tr>
                        <tr><td className="px-3 py-1.5 border-b border-border/50">6</td><td className="px-3 py-1.5 border-b border-border/50">462.6875</td><td className="px-3 py-1.5 border-b border-border/50">Simplex (FRS/GMRS)</td><td className="px-3 py-1.5 text-right border-b border-border/50">5W</td></tr>
                        <tr><td className="px-3 py-1.5 border-b border-border/50">7</td><td className="px-3 py-1.5 border-b border-border/50">462.7125</td><td className="px-3 py-1.5 border-b border-border/50">Simplex (FRS/GMRS)</td><td className="px-3 py-1.5 text-right border-b border-border/50">5W</td></tr>
                        <tr className="bg-muted/30"><td className="px-3 py-1.5 border-b border-border/50">8</td><td className="px-3 py-1.5 border-b border-border/50">467.5625</td><td className="px-3 py-1.5 border-b border-border/50">Simplex</td><td className="px-3 py-1.5 text-right border-b border-border/50">0.5W</td></tr>
                        <tr className="bg-muted/30"><td className="px-3 py-1.5 border-b border-border/50">9</td><td className="px-3 py-1.5 border-b border-border/50">467.5875</td><td className="px-3 py-1.5 border-b border-border/50">Simplex</td><td className="px-3 py-1.5 text-right border-b border-border/50">0.5W</td></tr>
                        <tr className="bg-muted/30"><td className="px-3 py-1.5 border-b border-border/50">10</td><td className="px-3 py-1.5 border-b border-border/50">467.6125</td><td className="px-3 py-1.5 border-b border-border/50">Simplex</td><td className="px-3 py-1.5 text-right border-b border-border/50">0.5W</td></tr>
                        <tr className="bg-muted/30"><td className="px-3 py-1.5 border-b border-border/50">11</td><td className="px-3 py-1.5 border-b border-border/50">467.6375</td><td className="px-3 py-1.5 border-b border-border/50">Simplex</td><td className="px-3 py-1.5 text-right border-b border-border/50">0.5W</td></tr>
                        <tr className="bg-muted/30"><td className="px-3 py-1.5 border-b border-border/50">12</td><td className="px-3 py-1.5 border-b border-border/50">467.6625</td><td className="px-3 py-1.5 border-b border-border/50">Simplex</td><td className="px-3 py-1.5 text-right border-b border-border/50">0.5W</td></tr>
                        <tr className="bg-muted/30"><td className="px-3 py-1.5 border-b border-border/50">13</td><td className="px-3 py-1.5 border-b border-border/50">467.6875</td><td className="px-3 py-1.5 border-b border-border/50">Simplex</td><td className="px-3 py-1.5 text-right border-b border-border/50">0.5W</td></tr>
                        <tr className="bg-muted/30"><td className="px-3 py-1.5 border-b border-border/50">14</td><td className="px-3 py-1.5 border-b border-border/50">467.7125</td><td className="px-3 py-1.5 border-b border-border/50">Simplex</td><td className="px-3 py-1.5 text-right border-b border-border/50">0.5W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5 border-b border-border/50">15</td><td className="px-3 py-1.5 border-b border-border/50">462.5500</td><td className="px-3 py-1.5 border-b border-border/50">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right border-b border-border/50">50W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5 border-b border-border/50">16</td><td className="px-3 py-1.5 border-b border-border/50">462.5750</td><td className="px-3 py-1.5 border-b border-border/50">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right border-b border-border/50">50W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5 border-b border-border/50">17</td><td className="px-3 py-1.5 border-b border-border/50">462.6000</td><td className="px-3 py-1.5 border-b border-border/50">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right border-b border-border/50">50W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5 border-b border-border/50">18</td><td className="px-3 py-1.5 border-b border-border/50">462.6250</td><td className="px-3 py-1.5 border-b border-border/50">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right border-b border-border/50">50W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5 border-b border-border/50">19</td><td className="px-3 py-1.5 border-b border-border/50">462.6500</td><td className="px-3 py-1.5 border-b border-border/50">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right border-b border-border/50">50W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5 border-b border-border/50">20</td><td className="px-3 py-1.5 border-b border-border/50">462.6750</td><td className="px-3 py-1.5 border-b border-border/50">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right border-b border-border/50">50W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5 border-b border-border/50">21</td><td className="px-3 py-1.5 border-b border-border/50">462.7000</td><td className="px-3 py-1.5 border-b border-border/50">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right border-b border-border/50">50W</td></tr>
                        <tr className="bg-primary/10"><td className="px-3 py-1.5">22</td><td className="px-3 py-1.5">462.7250</td><td className="px-3 py-1.5">Simplex / Repeater Output</td><td className="px-3 py-1.5 text-right">50W</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-sm">
                      Channels 15-22 are GMRS-only and allow up to 50W power output. Repeater inputs are 5 MHz below the output frequencies.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-4 shrink-0"
                      onClick={() => {
                        const csvContent = `Channel,Freq (MHz),Type,Power
1,462.5625,FRS/GMRS,5W
2,462.5875,FRS/GMRS,5W
3,462.6125,FRS/GMRS,5W
4,462.6375,FRS/GMRS,5W
5,462.6625,FRS/GMRS,5W
6,462.6875,FRS/GMRS,5W
7,462.7125,FRS/GMRS,5W
8,467.5625,Simplex,0.5W
9,467.5875,Simplex,0.5W
10,467.6125,Simplex,0.5W
11,467.6375,Simplex,0.5W
12,467.6625,Simplex,0.5W
13,467.6875,Simplex,0.5W
14,467.7125,Simplex,0.5W
15,462.5500,Repeater,50W
16,462.5750,Repeater,50W
17,462.6000,Repeater,50W
18,462.6250,Repeater,50W
19,462.6500,Repeater,50W
20,462.6750,Repeater,50W
21,462.7000,Repeater,50W
22,462.7250,Repeater,50W`
                        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
                        const url = URL.createObjectURL(blob)
                        const link = document.createElement("a")
                        link.href = url
                        link.download = "gmrs-channels.csv"
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download CSV
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="View API documentation">
                  API
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto" aria-describedby="api-dialog-description">
                <DialogHeader>
                  <DialogTitle>API Documentation</DialogTitle>
                  <DialogDescription id="api-dialog-description">
                    The KE8RXN APIs and data sources behind this site.
                  </DialogDescription>
                </DialogHeader>
                <ApiDocs />
              </DialogContent>
            </Dialog>
            </nav>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex flex-col">
        {view === "part90" ? (
          <div role="tabpanel" id="panel-part90" aria-labelledby="tab-part90" className="flex-1">
            <Part90Page />
          </div>
        ) : view === "advanced" ? (
          <div role="tabpanel" id="panel-advanced" aria-labelledby="tab-advanced" className="flex-1">
            <AdvancedSearchPage />
          </div>
        ) : (
        <div role="tabpanel" id="panel-callsign" aria-labelledby="tab-callsign" className="flex-1 flex flex-col">
        {/* Hero Section with Search */}
        <section className="py-6 md:py-14 bg-gradient-to-b from-card to-background" aria-labelledby="search-heading">
          <div className="container mx-auto px-3 md:px-4 text-center">
            <h1 id="search-heading" className="text-2xl md:text-5xl font-bold text-foreground mb-2 md:mb-4 text-balance">
              Callsign Lookup
            </h1>
            <p className="text-muted-foreground text-sm md:text-xl mb-1 md:mb-2 max-w-2xl mx-auto text-pretty">
              Search for single or multiple amateur radio or GMRS callsigns.
            </p>
            <p className="text-muted-foreground text-sm md:text-xl mb-4 md:mb-8 max-w-2xl mx-auto">
              Get license and location details instantly.
            </p>

            {error && (
              <div role="alert" className="max-w-xl mx-auto mb-4 md:mb-6 p-3 md:p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-xl mx-auto" role="search" aria-label="Callsign search">
              <div className="flex gap-1.5 md:gap-2">
                <div className="relative flex-1 md:flex-none md:w-[calc(100%-theme(spacing.32))]">
                  <label htmlFor="callsign-input" className="sr-only">Enter callsigns to search</label>
                  <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="callsign-input"
                    type="text"
                    placeholder="Enter callsigns"
                    value={callsign}
                    onChange={(e) => {
                      const newValue = e.target.value.toUpperCase()
                      setCallsign(newValue)
                      if (newValue.trim() === "") {
                        setSearchResults([])
                        setNotFound([])
                        setHasSearched(false)
                        setError(null)
                      }
                    }}
                    className="pl-8 md:pl-10 h-10 md:h-12 text-base md:text-lg !bg-input dark:!bg-input border-border text-foreground w-full"
                    aria-describedby="search-hint"
                  />
                  <span id="search-hint" className="sr-only">
                    Enter one or more callsigns separated by commas, semicolons, or spaces
                  </span>
                </div>
                <div className="flex gap-1.5 md:gap-2 shrink-0">
                  <Button type="submit" size="lg" className="h-10 md:h-12 px-4 md:px-8 text-sm md:text-base" disabled={isSearching} aria-busy={isSearching}>
                    {isSearching ? <><Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" aria-hidden="true" /><span className="sr-only">Searching</span></> : "Search"}
                  </Button>
                  {searchResults.length > 0 && (
                    <Button 
                      type="button" 
                      size="lg" 
                      className="h-10 md:h-12 px-3 md:px-4" 
                      onClick={exportToCSV}
                      aria-label="Download search results as CSV file"
                    >
                      <Download className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
                      <span className="sr-only md:not-sr-only md:ml-2">Download</span>
                    </Button>
                  )}
                </div>
              </div>
            </form>

            <div className="max-w-xl mx-auto mt-4 md:mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-start text-left gap-2 sm:gap-3 text-sm md:text-base text-muted-foreground">
              <span>Need to search by name, ZIP code, county, DMR ID, or FRN?</span>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 border-primary/50 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary"
                onClick={() => {
                  selectView("advanced")
                  window.scrollTo({ top: 0 })
                }}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Try Advanced Search
              </Button>
            </div>

            <div className="max-w-xl mx-auto mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-start text-left gap-2 sm:gap-3 text-sm md:text-base text-muted-foreground">
              <span>Looking for business or industrial (Part 90) radio licenses?</span>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 border-primary/50 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary"
                onClick={() => {
                  selectView("part90")
                  window.scrollTo({ top: 0 })
                }}
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Search Part 90 Licenses
              </Button>
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {isSearching
                ? "Searching..."
                : hasSearched
                  ? `${searchResults.length} ${searchResults.length === 1 ? "result" : "results"} found.${
                      notFound.length > 0 ? ` No results for ${notFound.join(", ")}.` : ""
                    }`
                  : ""}
            </p>

            {/* Search Results */}
            {hasSearched && !isSearching && (
              <section 
                aria-label="Search results" 
                className={`mx-auto mt-4 md:mt-8 grid gap-3 md:gap-4 ${
                  searchResults.length === 1 
                    ? "max-w-2xl grid-cols-1" 
                    : "max-w-6xl grid-cols-1 md:grid-cols-2"
                }`}
              >
                {searchResults.length > 0 && (
                  <p className="sr-only">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</p>
                )}
                {searchResults.map((searchResult) => {
                  // Use Amateur Radio record for address if available (more up-to-date)
                  const amateurRecord = searchResult.related.find(r => isAmateurRadio(r.service)) || searchResult.primary
                  return (
                    <Card key={searchResult.primary.callsign} className="bg-card border-border text-left" role="region" aria-labelledby={`result-name-${searchResult.primary.callsign}`}>
                      <CardHeader className="p-3 md:p-6">
                        <CardTitle id={`result-name-${searchResult.primary.callsign}`} className="text-2xl text-primary">
                          <span className="sr-only">Operator name: </span>
                          {formatName(amateurRecord.name)}
                        </CardTitle>
                        <address className="not-italic">
                          <CardDescription className="text-base">
                            {formatStreet(amateurRecord.street)}
                          </CardDescription>
                          <CardDescription className="text-lg">
                            {amateurRecord.city && amateurRecord.state 
                              ? `${amateurRecord.city}, ${amateurRecord.state} ${amateurRecord.zip || ""}`.trim()
                              : "Location not available"}
                          </CardDescription>
                        </address>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                        {(() => {
                          const amateurCall = searchResult.related.find(r => isAmateurRadio(r.service))
                          const gmrsCall = searchResult.related.find(r => r.service === "ZA")
                          return (
                            <div className="grid grid-cols-2 gap-2" aria-label="License and station information">
                              {/* Amateur callsign pill */}
                              {amateurCall && (
                                <div
                                  className={`px-3 py-2 md:px-4 md:py-2.5 rounded-lg flex items-center justify-between bg-muted ${
                                    amateurCall.callsign === searchResult.primary.callsign ? "border border-primary/50" : ""
                                  }`}
                                  aria-label={`Amateur Radio callsign: ${amateurCall.callsign}${amateurCall.class ? `, ${formatLicenseClass(amateurCall.class)} class` : ''}${amateurCall.callsign === searchResult.primary.callsign ? ', searched callsign' : ''}`}
                                >
                                  <span className="font-bold text-base text-foreground" aria-hidden="true">
                                    {amateurCall.callsign}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent" aria-hidden="true">
                                    Amateur{amateurCall.class && ` (${formatLicenseClass(amateurCall.class)})`}
                                  </span>
                                </div>
                              )}
                              {/* GMRS callsign pill - only show if exists */}
                              {gmrsCall && (
                                <div
                                  className={`px-3 py-2 md:px-4 md:py-2.5 rounded-lg flex items-center justify-between bg-muted ${
                                    gmrsCall.callsign === searchResult.primary.callsign ? "border border-primary/50" : ""
                                  }`}
                                  aria-label={`GMRS callsign: ${gmrsCall.callsign}${gmrsCall.callsign === searchResult.primary.callsign ? ', searched callsign' : ''}`}
                                >
                                  <span className="font-bold text-base text-foreground" aria-hidden="true">
                                    {gmrsCall.callsign}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent" aria-hidden="true">
                                    GMRS
                                  </span>
                                </div>
                              )}
                              {/* Empty placeholder if no GMRS to maintain grid */}
                              {!gmrsCall && amateurCall && <div aria-hidden="true" />}
                              {/* DMR ID pill - only show if DMR ID exists */}
                              {(() => {
                                const dmrId = amateurCall ? dmrIds[amateurCall.callsign] : null
                                if (!dmrId) return null
                                return (
                                  <div
                                    className="px-3 py-2 md:px-4 md:py-2.5 rounded-lg flex items-center justify-between bg-muted"
                                    aria-label={`DMR ID: ${dmrId}`}
                                  >
                                    <span className="font-bold text-base text-foreground" aria-hidden="true">{dmrId}</span>
                                    <span className="text-xs px-2 py-0.5 rounded bg-primary/30 text-foreground font-medium" aria-hidden="true">DMR ID</span>
                                  </div>
                                )
                              })()}
                              {/* Grid Square pill */}
                              {(() => {
                                const grid = gridSquares[searchResult.primary.callsign]
                                return (
                                  <div
                                    className="px-3 py-2 md:px-4 md:py-2.5 rounded-lg flex items-center justify-between bg-muted"
                                    aria-label={grid ? `Grid Square: ${grid}` : "Grid Square: Not available"}
                                  >
                                    <span className="font-bold text-base text-foreground" aria-hidden="true">{grid || "—"}</span>
                                    <span className="text-xs px-2 py-0.5 rounded bg-primary/30 text-foreground font-medium" aria-hidden="true">Grid</span>
                                  </div>
                                )
                              })()}
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  )
                })}
                
                {notFound.length > 0 && (
                  <Card className="bg-card border-border">
                    <CardContent className="py-4 md:py-6 text-center">
                      <p className="text-muted-foreground">No results found for: {notFound.join(", ")}</p>
                      <p className="text-sm text-muted-foreground mt-2">Make sure you entered valid US callsigns</p>
                    </CardContent>
                  </Card>
                )}

                {searchResults.length === 0 && notFound.length === 0 && (
                  <Card className="bg-card border-border">
                    <CardContent className="py-6 md:py-8 text-center">
                      <p className="text-muted-foreground">No results found</p>
                      <p className="text-sm text-muted-foreground mt-2">Make sure you entered valid US callsigns</p>
                    </CardContent>
                  </Card>
                )}
              </section>
            )}
          </div>
        </section>

        {/* Feature Cards */}
        <section className="py-8 md:py-16 bg-background" aria-labelledby="features-heading">
            <div className="container mx-auto px-3 md:px-4">
              <h2 id="features-heading" className="text-xl md:text-2xl font-semibold text-foreground text-center mb-6 md:mb-10">
                What You Can Find
              </h2>
              <div className="grid grid-cols-3 md:grid-cols-3 gap-2 md:gap-6" role="list">
                <Card className="bg-card border-border hover:shadow-lg hover:shadow-accent/10 transition-shadow" role="listitem">
                  <CardHeader className="p-3 md:p-6">
                    <div className="h-8 w-8 md:h-12 md:w-12 rounded-lg bg-accent/20 flex items-center justify-center mb-1 md:mb-2" aria-hidden="true">
                      <Users className="h-4 w-4 md:h-6 md:w-6 text-accent" />
                    </div>
                    <CardTitle className="text-sm md:text-lg">Associated Licenses</CardTitle>
                    <CardDescription className="text-sm hidden md:block">
                      View the operator&apos;s amateur radio and GMRS licenses
                    </CardDescription>
                    <span className="text-sm text-accent font-medium mt-1 md:mt-2 inline-block">Amateur + GMRS</span>
                  </CardHeader>
                </Card>

                <Card className="bg-card border-border hover:shadow-lg hover:shadow-primary/10 transition-shadow" role="listitem">
                  <CardHeader className="p-3 md:p-6">
                    <div className="h-8 w-8 md:h-12 md:w-12 rounded-lg bg-primary/20 flex items-center justify-center mb-1 md:mb-2" aria-hidden="true">
                      <Download className="h-4 w-4 md:h-6 md:w-6 text-primary" />
                    </div>
                    <CardTitle className="text-sm md:text-lg">Data Download</CardTitle>
                    <CardDescription className="text-sm hidden md:block">
                      Download your callsign queries instantly
                    </CardDescription>
                    <span className="text-sm text-primary font-medium mt-1 md:mt-2 inline-block">Amateur + GMRS</span>
                  </CardHeader>
                </Card>

                <Card className="bg-card border-border hover:shadow-lg hover:shadow-accent/10 transition-shadow" role="listitem">
                  <CardHeader className="p-3 md:p-6">
                    <div className="h-8 w-8 md:h-12 md:w-12 rounded-lg bg-accent/20 flex items-center justify-center mb-1 md:mb-2" aria-hidden="true">
                      <MapPin className="h-4 w-4 md:h-6 md:w-6 text-accent" />
                    </div>
                    <CardTitle className="text-sm md:text-lg">Location</CardTitle>
                    <CardDescription className="text-sm hidden md:block">
                      Find the operator&apos;s address, name, and state
                    </CardDescription>
                    <span className="text-sm text-accent font-medium mt-1 md:mt-2 inline-block">Amateur + GMRS</span>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </section>

        {/* Stats Section */}
        <section className="py-6 md:py-16 bg-card border-y border-border" aria-label="Service statistics">
          <div className="container mx-auto px-3 md:px-4">
            <div className="grid grid-cols-4 gap-2 md:gap-8 text-center" role="list">
              <div role="listitem">
                <p className="text-xl md:text-4xl font-bold text-primary" aria-label="Over 1 million US callsigns">1M+</p>
                <p className="text-sm text-muted-foreground mt-0.5 md:mt-1">US Callsigns</p>
              </div>
<div role="listitem">
  <a href="https://www.fcc.gov/wireless/universal-licensing-system" target="_blank" rel="noopener noreferrer" className="block rounded-md hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card" aria-label="FCC Database (opens in new window)">
  <p className="text-xl md:text-4xl font-bold text-primary" aria-hidden="true">FCC</p>
  <p className="text-sm text-muted-foreground mt-0.5 md:mt-1" aria-hidden="true">Database</p>
  </a>
  </div>
              <div role="listitem">
                <p className="text-xl md:text-4xl font-bold text-primary">Live</p>
                <p className="text-sm text-muted-foreground mt-0.5 md:mt-1">Lookup</p>
              </div>
              <div role="listitem">
                <p className="text-xl md:text-4xl font-bold text-primary">Free</p>
                <p className="text-sm text-muted-foreground mt-0.5 md:mt-1">To Use</p>
              </div>
            </div>
          </div>
        </section>
        </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 md:py-8 bg-card border-t border-border" role="contentinfo">
        <div className="container mx-auto px-3 md:px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 md:h-5 md:w-5 text-primary" aria-hidden="true" />
              <span className="font-semibold text-sm md:text-base text-foreground">KE8RXN</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} KE8RXN Callsign Lookup. <span aria-label="Best regards from">73 de</span> KE8RXN.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
