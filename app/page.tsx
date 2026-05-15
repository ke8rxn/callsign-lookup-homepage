"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, Radio, MapPin, Calendar, Moon, Sun, Loader2, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface CallsignRecord {
  callsign: string
  callsign_lc: string
  full_name: string
  full_address: string
  service: string
  frn: string
}

interface SearchResult {
  primary: CallsignRecord
  related: CallsignRecord[]
}

export default function CallsignLookup() {
  const [callsign, setCallsign] = useState("")
  const [isDark, setIsDark] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
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

    try {
      const response = await fetch(`/api/fcc-search?callsign=${encodeURIComponent(callsign.trim())}`)
      const data = await response.json()
      
      if (response.ok) {
        setSearchResult(data)
      } else if (response.status === 404) {
        setSearchResult(null)
      } else {
        setError(data.error || "Search failed")
        setSearchResult(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
      setSearchResult(null)
    } finally {
      setIsSearching(false)
    }
  }, [callsign])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Radio className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">KE8RXN</h1>
              <p className="text-xs text-muted-foreground">Callsign Lookup</p>
            </div>
          </div>
          <nav className="flex items-center gap-6">
            <a href="#" className="hidden md:block text-sm text-muted-foreground hover:text-foreground transition-colors">
              Home
            </a>
            <a href="#" className="hidden md:block text-sm text-muted-foreground hover:text-foreground transition-colors">
              About
            </a>
            <a href="#" className="hidden md:block text-sm text-muted-foreground hover:text-foreground transition-colors">
              API
            </a>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Hero Section with Search */}
        <section className="py-16 md:py-24 bg-gradient-to-b from-card to-background">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">
              Callsign Lookup
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl mb-10 max-w-2xl mx-auto text-pretty">
              Search for any amateur radio or GMRS operator. Get license details, location, and contact information instantly.
            </p>

            {error && (
              <div className="max-w-xl mx-auto mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-xl mx-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Enter callsign (e.g., KE8RXN)"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                    className="pl-10 h-12 text-lg bg-card border-border"
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 px-8" disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : "Search"}
                </Button>
              </div>
            </form>

            {/* Search Results */}
            {hasSearched && !isSearching && (
              <div className="max-w-2xl mx-auto mt-8">
                {searchResult ? (
                  <Card className="bg-card border-border text-left">
                    <CardHeader>
                      <div>
                        <CardTitle className="text-2xl text-primary">{searchResult.primary.full_name || "Name not available"}</CardTitle>
                        <CardDescription className="text-lg">
                          {searchResult.primary.full_address && searchResult.primary.full_address !== ", ," 
                            ? searchResult.primary.full_address 
                            : "Address not available"}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* All Callsigns for this FRN */}
                      <div>
                        <p className="text-sm text-muted-foreground mb-3">Associated Callsigns</p>
                        <div className="flex flex-wrap gap-2">
                          {searchResult.related.map((record) => (
                            <div
                              key={record.callsign}
                              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                                record.callsign === searchResult.primary.callsign
                                  ? "bg-primary/20 border border-primary/30"
                                  : "bg-muted"
                              }`}
                            >
                              <span className={`font-bold ${
                                record.callsign === searchResult.primary.callsign
                                  ? "text-primary"
                                  : "text-foreground"
                              }`}>
                                {record.callsign}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                record.service === "Amateur Radio"
                                  ? "bg-accent/20 text-accent"
                                  : "bg-primary/20 text-primary"
                              }`}>
                                {record.service === "Amateur Radio" ? "HAM" : "GMRS"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-card border-border">
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No results found for &quot;{callsign}&quot;</p>
                      <p className="text-sm text-muted-foreground mt-2">Make sure you entered a valid US callsign</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Feature Cards */}
        <section className="py-16 bg-background">
            <div className="container mx-auto px-4">
              <h3 className="text-2xl font-semibold text-foreground text-center mb-10">
                What You Can Find
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-card border-border hover:shadow-lg hover:shadow-primary/10 transition-shadow">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center mb-2">
                      <Award className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">License Class</CardTitle>
                    <CardDescription>
                      View the operator&apos;s license class and privileges
                    </CardDescription>
                    <span className="text-xs text-primary font-medium mt-2 inline-block">Amateur Radio Only</span>
                  </CardHeader>
                </Card>

                <Card className="bg-card border-border hover:shadow-lg hover:shadow-accent/10 transition-shadow">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-accent/20 flex items-center justify-center mb-2">
                      <MapPin className="h-6 w-6 text-accent" />
                    </div>
                    <CardTitle className="text-lg">Location</CardTitle>
                    <CardDescription>
                      Find the operator&apos;s address and grid square
                    </CardDescription>
                    <span className="text-xs text-accent font-medium mt-2 inline-block">Amateur Radio + GMRS</span>
                  </CardHeader>
                </Card>

                <Card className="bg-card border-border hover:shadow-lg hover:shadow-primary/10 transition-shadow">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center mb-2">
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
        <section className="py-16 bg-card border-y border-border">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <p className="text-3xl md:text-4xl font-bold text-primary">1M+</p>
                <p className="text-sm text-muted-foreground mt-1">US Callsigns</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-primary">FCC</p>
                <p className="text-sm text-muted-foreground mt-1">Database</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-primary">Real-time</p>
                <p className="text-sm text-muted-foreground mt-1">Lookup</p>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-primary">Free</p>
                <p className="text-sm text-muted-foreground mt-1">To Use</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">KE8RXN</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} KE8RXN Callsign Lookup. 73 de KE8RXN.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
