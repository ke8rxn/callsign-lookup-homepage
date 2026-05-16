"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, Radio, MapPin, Calendar, Moon, Sun, Loader2, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface CallsignRecord {
  usid: string
  callsign: string
  status: string
  service: string // "HA"/"HV" = Amateur Radio, "ZA" = GMRS
  name: string
  street: string
  city: string
  state: string
  zip: string
  frn: string
  class: string | null // License class (E, G, T, etc.) - only for Amateur
  prevcall: string | null
}

interface SearchResult {
  primary: CallsignRecord
  related: CallsignRecord[]
}

// Convert "Last, First" to "First Last"
function formatName(name: string): string {
  if (!name) return "Name not available"
  const parts = name.split(",").map(part => part.trim())
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`
  }
  return name
}

// Check if service code is Amateur Radio (HA = Amateur, HV = Vanity)
function isAmateurRadio(service: string): boolean {
  return service === "HA" || service === "HV"
}

// Convert license class abbreviation to full name
function formatLicenseClass(classAbbr: string | null): string {
  if (!classAbbr) return ""
  const classMap: Record<string, string> = {
    "E": "Amateur Extra",
    "G": "General",
    "T": "Technician",
    "A": "Advanced",
    "N": "Novice",
    "P": "Technician Plus",
  }
  return classMap[classAbbr.toUpperCase()] || classAbbr
}

// Format concatenated street address: "3831CasperAveNW" -> "3831 Casper Ave NW"
function formatStreet(street: string): string {
  if (!street) return "Street not available"
  
  // Common street suffixes and directions
  const suffixes = ["Ave", "St", "Dr", "Blvd", "Rd", "Ln", "Ct", "Pl", "Way", "Cir", "Pkwy", "Ter", "Trl"]
  const directions = ["NW", "NE", "SW", "SE", "N", "S", "E", "W"]
  
  let formatted = street
  
  // Add space before direction suffixes at the end
  for (const dir of directions) {
    const regex = new RegExp(`(${dir})$`, "i")
    if (regex.test(formatted)) {
      formatted = formatted.replace(regex, ` ${dir}`)
      break
    }
  }
  
  // Add space before and after street suffixes
  for (const suffix of suffixes) {
    const regex = new RegExp(`([a-z])(${suffix})([A-Z]|\\s|$)`, "i")
    formatted = formatted.replace(regex, `$1 ${suffix} $3`)
  }
  
  // Add space between number and first letter
  formatted = formatted.replace(/^(\d+)([A-Za-z])/, "$1 $2")
  
  // Add space before capital letters in the middle of words (for street names)
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2")
  
  return formatted.trim().replace(/\s+/g, " ")
}

export default function CallsignLookup() {
  const [callsign, setCallsign] = useState("")
  const [isDark, setIsDark] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [notFound, setNotFound] = useState<string[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!callsign.trim()) return

    setIsSearching(true)
    setHasSearched(true)
    setError(null)
    setSearchResults([])
    setNotFound([])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setIsSearching(false)
    }
  }, [callsign])

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
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center" aria-hidden="true">
              <Radio className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">KE8RXN</h1>
              <p className="text-xs text-muted-foreground">Callsign Lookup</p>
            </div>
          </div>
          <nav className="flex items-center gap-6" aria-label="Main navigation">
            <a href="#" className="hidden md:block text-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="Home page">
              Home
            </a>
            <a href="#" className="hidden md:block text-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="About this service">
              About
            </a>
            <a href="#" className="hidden md:block text-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="API documentation">
              API
            </a>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex flex-col">
        {/* Hero Section with Search */}
        <section className="py-10 md:py-14 bg-gradient-to-b from-card to-background" aria-labelledby="search-heading">
          <div className="container mx-auto px-4 text-center">
            <h2 id="search-heading" className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">
              Callsign Lookup
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl mb-8 max-w-2xl mx-auto text-pretty">
              Search for single or multiple amateur radio or GMRS callsigns. Get license and location details instantly.
            </p>

            {error && (
              <div role="alert" className="max-w-xl mx-auto mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-xl mx-auto" role="search" aria-label="Callsign search">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <label htmlFor="callsign-input" className="sr-only">Enter callsigns to search</label>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="callsign-input"
                    type="text"
                    placeholder="Enter callsigns"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                    className="pl-10 h-12 text-lg bg-card border-border"
                    aria-describedby="search-hint"
                  />
                  <span id="search-hint" className="sr-only">
                    Enter one or more callsigns separated by commas, semicolons, or spaces
                  </span>
                </div>
                <Button type="submit" size="lg" className="h-12 px-8" disabled={isSearching} aria-busy={isSearching}>
                  {isSearching ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /><span className="sr-only">Searching</span></> : "Search"}
                </Button>
              </div>
            </form>

            {/* Search Results */}
            {hasSearched && !isSearching && (
              <section 
                aria-label="Search results" 
                aria-live="polite"
                className={`mx-auto mt-8 grid gap-4 ${
                  searchResults.length === 1 
                    ? "max-w-2xl grid-cols-1" 
                    : "max-w-6xl grid-cols-1 md:grid-cols-2"
                }`}
              >
                {searchResults.length > 0 && (
                  <p className="sr-only">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</p>
                )}
                {searchResults.map((searchResult) => (
                  <Card key={searchResult.primary.callsign} className="bg-card border-border text-left" role="article" aria-label={`Results for ${searchResult.primary.callsign}`}>
                    <CardHeader>
                      {(() => {
                        // Use Amateur Radio record for address if available (more up-to-date)
                        const amateurRecord = searchResult.related.find(r => isAmateurRadio(r.service)) || searchResult.primary
                        return (
                          <div>
                            <CardTitle className="text-2xl text-primary">{formatName(amateurRecord.name)}</CardTitle>
                            <CardDescription className="text-base">
                              {formatStreet(amateurRecord.street)}
                            </CardDescription>
                            <CardDescription className="text-lg">
                              {amateurRecord.city && amateurRecord.state 
                                ? `${amateurRecord.city}, ${amateurRecord.state} ${amateurRecord.zip || ""}`.trim()
                                : "Location not available"}
                            </CardDescription>
                          </div>
                        )
                      })()}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* All Callsigns for this FRN */}
                      <div>
                        <p className="text-sm text-muted-foreground mb-3">Associated Callsigns</p>
                        <div className="flex flex-wrap gap-2">
                          {searchResult.related.map((record) => (
                            <div
                              key={record.callsign}
                              className={`px-4 py-2 rounded-lg flex items-center gap-2 bg-muted ${
                                record.callsign === searchResult.primary.callsign
                                  ? "border border-primary/50"
                                  : ""
                              }`}
                            >
                              <span className="font-bold text-foreground">
                                {record.callsign}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent">
                                {isAmateurRadio(record.service) ? "Amateur" : "GMRS"}
                                {isAmateurRadio(record.service) && record.class && ` (${formatLicenseClass(record.class)})`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {notFound.length > 0 && (
                  <Card className="bg-card border-border" role="alert">
                    <CardContent className="py-6 text-center">
                      <p className="text-muted-foreground">No results found for: {notFound.join(", ")}</p>
                      <p className="text-sm text-muted-foreground mt-2">Make sure you entered valid US callsigns</p>
                    </CardContent>
                  </Card>
                )}

                {searchResults.length === 0 && notFound.length === 0 && (
                  <Card className="bg-card border-border" role="alert">
                    <CardContent className="py-8 text-center">
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
        <section className="py-16 bg-background" aria-labelledby="features-heading">
            <div className="container mx-auto px-4">
              <h3 id="features-heading" className="text-2xl font-semibold text-foreground text-center mb-10">
                What You Can Find
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6" role="list">
                <Card className="bg-card border-border hover:shadow-lg hover:shadow-primary/10 transition-shadow" role="listitem">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center mb-2" aria-hidden="true">
                      <Award className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">License Class</CardTitle>
                    <CardDescription>
                      View the operator&apos;s license class and privileges
                    </CardDescription>
                    <span className="text-xs text-primary font-medium mt-2 inline-block">Amateur Radio Only</span>
                  </CardHeader>
                </Card>

                <Card className="bg-card border-border hover:shadow-lg hover:shadow-accent/10 transition-shadow" role="listitem">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-accent/20 flex items-center justify-center mb-2" aria-hidden="true">
                      <MapPin className="h-6 w-6 text-accent" />
                    </div>
                    <CardTitle className="text-lg">Location</CardTitle>
                    <CardDescription>
                      Find the operator&apos;s address and grid square
                    </CardDescription>
                    <span className="text-xs text-accent font-medium mt-2 inline-block">Amateur Radio + GMRS</span>
                  </CardHeader>
                </Card>

                <Card className="bg-card border-border hover:shadow-lg hover:shadow-primary/10 transition-shadow" role="listitem">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center mb-2" aria-hidden="true">
                      <Calendar className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">License Dates</CardTitle>
                    <CardDescription>
                      Check issue date and expiration information
                    </CardDescription>
                    <span className="text-xs text-accent font-medium mt-2 inline-block">Amateur Radio + GMRS</span>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </section>

        {/* Stats Section */}
        <section className="py-16 bg-card border-y border-border" aria-label="Service statistics">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center" role="list">
              <div role="listitem">
                <p className="text-3xl md:text-4xl font-bold text-primary" aria-label="Over 1 million US callsigns">1M+</p>
                <p className="text-sm text-muted-foreground mt-1">US Callsigns</p>
              </div>
              <div role="listitem">
                <p className="text-3xl md:text-4xl font-bold text-primary">FCC</p>
                <p className="text-sm text-muted-foreground mt-1">Database</p>
              </div>
              <div role="listitem">
                <p className="text-3xl md:text-4xl font-bold text-primary">Real-time</p>
                <p className="text-sm text-muted-foreground mt-1">Lookup</p>
              </div>
              <div role="listitem">
                <p className="text-3xl md:text-4xl font-bold text-primary">Free</p>
                <p className="text-sm text-muted-foreground mt-1">To Use</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 bg-card border-t border-border" role="contentinfo">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="font-semibold text-foreground">KE8RXN</span>
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
