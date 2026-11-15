"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MapPinned,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  type CallsignRecord,
  formatLicenseClass,
  formatName,
  formatStreet,
  isAmateurRadio,
} from "@/lib/license-format"
import { US_STATES } from "@/lib/us-states"
import { type CountyMatcher, isInSelectedCounties } from "@/lib/county-match"

type SearchType = "callsign" | "frn" | "name" | "zipcode"
type ZipMode = "manual" | "county"
type SortKey = "amateur" | "gmrs" | "name" | "class" | "city" | "state" | "zip" | "frn"
type ServiceFilter = "all" | "amateur" | "gmrs"

interface LicenseeRow {
  key: string
  primary: CallsignRecord
  amateur: CallsignRecord[]
  gmrs: CallsignRecord[]
  records: CallsignRecord[]
  outside: boolean
}

interface County {
  fips: string
  name: string
  zipCount: number
}

interface SearchTypeConfig {
  label: string
  placeholder: string
  hint: string
  maxQueries: number
  split: (input: string) => string[]
  validate: (value: string) => boolean
  invalidMessage: string
}

const SEARCH_TYPES: Record<SearchType, SearchTypeConfig> = {
  callsign: {
    label: "Callsign",
    placeholder: "KC8EST, K8OEC, W8SAT",
    hint: "Separate multiple callsigns with commas, spaces, or new lines. Up to 25 at a time.",
    maxQueries: 25,
    split: (input) => input.split(/[,;\s]+/),
    validate: (v) => /^[A-Z0-9]{3,7}$/i.test(v),
    invalidMessage: "Callsigns must be 3-7 letters and numbers.",
  },
  frn: {
    label: "FRN",
    placeholder: "0036850956",
    hint: "Enter FCC Registration Numbers, separated by commas, spaces, or new lines. Up to 25 at a time.",
    maxQueries: 25,
    split: (input) => input.split(/[,;\s]+/),
    validate: (v) => /^\d{1,10}$/.test(v),
    invalidMessage: "FRNs must be up to 10 digits.",
  },
  name: {
    label: "Name",
    placeholder: "Smith, John\nDoe, Jane",
    hint: "Enter a last name, or \"Last, First\". Put each name on its own line or separate with semicolons. Up to 10 at a time.",
    maxQueries: 10,
    split: (input) => input.split(/[;\n]+/),
    validate: (v) => /^[\p{L}\p{M}' .,-]{2,60}$/u.test(v),
    invalidMessage: "Names must be 2-60 letters and may include commas, periods, hyphens, and apostrophes.",
  },
  zipcode: {
    label: "Location",
    placeholder: "49544, 49335",
    hint: "Separate multiple 5-digit ZIP codes with commas, spaces, or new lines. Up to 50 at a time.",
    maxQueries: 50,
    split: (input) => input.split(/[,;\s]+/),
    validate: (v) => /^\d{5}$/.test(v),
    invalidMessage: "ZIP codes must be 5 digits.",
  },
}

const COUNTY_ZIP_LIMIT = 300
const CONCURRENCY = 6
const PAGE_SIZE = 50

const STATUS_LABELS: Record<string, string> = {
  E: "Expired",
  C: "Cancelled",
  T: "Terminated",
}

const activeFirst = (a: CallsignRecord, b: CallsignRecord) =>
  Number(b.status === "A") - Number(a.status === "A") || a.callsign.localeCompare(b.callsign)

// One row per licensee: records sharing an FRN (or, without one, the same name and address) are merged
// so a person holding both Amateur and GMRS licenses appears once.
function groupLicensees(records: CallsignRecord[], outsideIds: Set<string>): LicenseeRow[] {
  const groups = new Map<string, CallsignRecord[]>()
  for (const r of records) {
    const key = r.frn
      ? `frn:${r.frn}`
      : `addr:${(r.name || "").toLowerCase()}|${(r.street || "").toLowerCase()}|${r.zip || ""}`
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }
  return Array.from(groups, ([key, list]) => {
    const amateur = list.filter((r) => isAmateurRadio(r.service)).sort(activeFirst)
    const gmrs = list.filter((r) => !isAmateurRadio(r.service)).sort(activeFirst)
    const primary =
      amateur.find((r) => r.status === "A") ?? gmrs.find((r) => r.status === "A") ?? amateur[0] ?? gmrs[0]
    return { key, primary, amateur, gmrs, records: list, outside: list.every((r) => outsideIds.has(r.usid)) }
  })
}

function rowSortValue(row: LicenseeRow, key: SortKey): string {
  switch (key) {
    case "amateur":
      return row.amateur[0]?.callsign ?? ""
    case "gmrs":
      return row.gmrs[0]?.callsign ?? ""
    case "class":
      return row.amateur[0] ? formatLicenseClass(row.amateur[0].class) : ""
    case "name":
      return formatName(row.primary.name)
    default:
      return (row.primary[key] as string) || ""
  }
}

function callsignList(records: CallsignRecord[]): string {
  return records
    .map((r) => (r.status && r.status !== "A" ? `${r.callsign} (${STATUS_LABELS[r.status] || r.status})` : r.callsign))
    .join("; ")
}

function CallsignCell({ records }: { records: CallsignRecord[] }) {
  if (records.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col gap-1">
      {records.map((r) => (
        <span key={r.usid} className="whitespace-nowrap font-semibold text-foreground">
          {r.callsign}
          {r.status && r.status !== "A" && (
            <span className="ml-1.5 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-normal text-destructive">
              {STATUS_LABELS[r.status] || r.status}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

export function AdvancedSearchPage() {
  const [searchType, setSearchType] = useState<SearchType>("callsign")
  const [zipMode, setZipMode] = useState<ZipMode>("manual")
  const [input, setInput] = useState("")
  const [inputError, setInputError] = useState<string | null>(null)

  // State & county picker
  const [stateAbbr, setStateAbbr] = useState("")
  const [counties, setCounties] = useState<County[]>([])
  const [countiesLoading, setCountiesLoading] = useState(false)
  const [countyFilter, setCountyFilter] = useState("")
  const [selectedCounties, setSelectedCounties] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [pendingZips, setPendingZips] = useState<string[] | null>(null)
  const [pendingMatch, setPendingMatch] = useState<CountyMatcher | null>(null)
  const [countyMatch, setCountyMatch] = useState<{ matcher: CountyMatcher; label: string } | null>(null)
  const [showOutside, setShowOutside] = useState(false)
  const [pickerCollapsed, setPickerCollapsed] = useState(false)

  // Search execution & results
  const [isSearching, setIsSearching] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [hasSearched, setHasSearched] = useState(false)
  const [results, setResults] = useState<CallsignRecord[]>([])
  const [notFound, setNotFound] = useState<string[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [truncated, setTruncated] = useState<string[]>([])
  const [lastSearchLabel, setLastSearchLabel] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  // Result table controls
  const [filterText, setFilterText] = useState("")
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("amateur")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)

  const config = SEARCH_TYPES[searchType]

  const runQueries = useCallback(async (type: SearchType, values: string[], label: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsSearching(true)
    setHasSearched(true)
    setResults([])
    setNotFound([])
    setFailed([])
    setTruncated([])
    setPage(1)
    setLastSearchLabel(label)
    setProgress({ done: 0, total: values.length })

    const byId = new Map<string, CallsignRecord>()
    const missing: string[] = []
    const errors: string[] = []
    const capped: string[] = []
    let cursor = 0
    let done = 0

    const worker = async () => {
      while (cursor < values.length && !controller.signal.aborted) {
        const value = values[cursor++]
        try {
          const response = await fetch(
            `/api/license-search?type=${type}&q=${encodeURIComponent(value)}`,
            { signal: controller.signal },
          )
          const data = await response.json()
          if (!response.ok) {
            errors.push(value)
          } else if (data.results.length === 0) {
            missing.push(value)
          } else {
            for (const record of data.results as CallsignRecord[]) byId.set(record.usid, record)
            if (data.truncated) capped.push(`${value} (${data.total.toLocaleString()} matches)`)
          }
        } catch {
          if (controller.signal.aborted) return
          errors.push(value)
        }
        done++
        setProgress({ done, total: values.length })
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, worker))
    if (controller.signal.aborted) return

    setResults(Array.from(byId.values()))
    setNotFound(missing)
    setFailed(errors)
    setTruncated(capped)
    setIsSearching(false)
  }, [])

  const cancelSearch = useCallback(() => {
    abortRef.current?.abort()
    setIsSearching(false)
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const values = Array.from(
        new Set(
          config
            .split(input)
            .map((v) => v.trim())
            .filter(Boolean)
            .map((v) => (searchType === "callsign" ? v.toUpperCase() : v)),
        ),
      )
      if (values.length === 0) {
        setInputError(`Enter at least one ${config.label.toLowerCase()}.`)
        return
      }
      if (values.length > config.maxQueries) {
        setInputError(`Enter no more than ${config.maxQueries} at a time (you entered ${values.length}).`)
        return
      }
      const invalid = values.filter((v) => !config.validate(v))
      if (invalid.length > 0) {
        setInputError(`Invalid: ${invalid.join(", ")}. ${config.invalidMessage}`)
        return
      }
      setInputError(null)
      setCountyMatch(null)
      const summaryNoun = searchType === "zipcode" ? "ZIP code" : config.label.toLowerCase()
    runQueries(searchType, values, `${values.length} ${summaryNoun}${values.length === 1 ? "" : searchType === "zipcode" ? "s" : " queries"}`)
    },
    [config, input, runQueries, searchType],
  )

  const handleStateChange = useCallback(async (abbr: string) => {
    setStateAbbr(abbr)
    setSelectedCounties(new Set())
    setCountyFilter("")
    setPendingZips(null)
    setCounties([])
    setCountiesLoading(true)
    setInputError(null)
    try {
      const response = await fetch(`/api/counties?state=${abbr}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setCounties(data.counties)
    } catch {
      setInputError("Couldn't load counties for that state. Please try again.")
    } finally {
      setCountiesLoading(false)
    }
  }, [])

  const toggleCounty = useCallback((fips: string, checked: boolean) => {
    setPendingZips(null)
    setSelectedCounties((prev) => {
      const next = new Set(prev)
      if (checked) next.add(fips)
      else next.delete(fips)
      return next
    })
  }, [])

  const visibleCounties = useMemo(() => {
    const q = countyFilter.trim().toLowerCase()
    return q ? counties.filter((c) => c.name.toLowerCase().includes(q)) : counties
  }, [counties, countyFilter])

  const selectedCountyNames = useMemo(
    () => counties.filter((c) => selectedCounties.has(c.fips)).map((c) => c.name),
    [counties, selectedCounties],
  )

  const generateZips = useCallback(async () => {
    if (selectedCounties.size === 0) return
    setGenerating(true)
    setInputError(null)
    try {
      const response = await fetch(`/api/counties?counties=${Array.from(selectedCounties).join(",")}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setPendingZips(data.zips)
      setPendingMatch(data.match)
    } catch {
      setInputError("Couldn't generate ZIP codes for those counties. Please try again.")
    } finally {
      setGenerating(false)
    }
  }, [selectedCounties])

  const confirmZipQuery = useCallback(() => {
    if (!pendingZips || pendingZips.length === 0) return
    const zips = pendingZips.slice(0, COUNTY_ZIP_LIMIT)
    const stateName = US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr
    const countyLabel =
      selectedCountyNames.length <= 3 ? selectedCountyNames.join(", ") : `${selectedCountyNames.length} counties`
    setPendingZips(null)
    setCountyMatch(pendingMatch ? { matcher: pendingMatch, label: countyLabel } : null)
    setShowOutside(false)
    setPickerCollapsed(true)
    runQueries("zipcode", zips, `${zips.length} ZIP codes in ${countyLabel}, ${stateName}`)
  }, [pendingMatch, pendingZips, runQueries, selectedCountyNames, stateAbbr])

  const outsideIds = useMemo(() => {
    const ids = new Set<string>()
    if (!countyMatch) return ids
    for (const r of results) {
      if (!isInSelectedCounties(r, countyMatch.matcher)) ids.add(r.usid)
    }
    return ids
  }, [results, countyMatch])

  const rows = useMemo(() => groupLicensees(results, outsideIds), [results, outsideIds])
  const outsideRowCount = useMemo(() => rows.filter((r) => r.outside).length, [rows])

  const filteredResults = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      if (!showOutside && row.outside) return false
      if (serviceFilter === "amateur" && row.amateur.length === 0) return false
      if (serviceFilter === "gmrs" && row.gmrs.length === 0) return false
      if (!q) return true
      const p = row.primary
      return [...row.records.map((r) => r.callsign), p.name, formatName(p.name), p.city, p.state, p.zip, p.frn]
        .some((field) => field?.toLowerCase().includes(q))
    })
    return filtered.sort((a, b) => {
      const av = rowSortValue(a, sortKey)
      const bv = rowSortValue(b, sortKey)
      if (!av !== !bv) return av ? -1 : 1
      const cmp = av.localeCompare(bv, undefined, { numeric: true })
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [rows, filterText, serviceFilter, sortKey, sortDir, showOutside])

  const pageCount = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageResults = filteredResults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortKey(key)
        setSortDir("asc")
      }
      setPage(1)
    },
    [sortKey],
  )

  const exportToCSV = useCallback(() => {
    if (filteredResults.length === 0) return
    const headers = [
      "Amateur Callsign",
      "GMRS Callsign",
      "Name",
      "License Class",
      "Street",
      "City",
      "State",
      "ZIP",
      "FRN",
    ]
    const escapeCSV = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
    const csvRows = filteredResults.map((row) => {
      const p = row.primary
      return [
        callsignList(row.amateur),
        callsignList(row.gmrs),
        formatName(p.name),
        row.amateur[0] ? formatLicenseClass(row.amateur[0].class) : "",
        p.street ? formatStreet(p.street) : "",
        p.city || "",
        p.state || "",
        p.zip || "",
        p.frn || "",
      ]
    })
    const csv = [headers.join(","), ...csvRows.map((row) => row.map(escapeCSV).join(","))].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    const iso = new Date().toISOString()
    link.href = url
    link.download = `advanced-search-${iso.split("T")[0]}-${iso.split("T")[1].split(".")[0].replace(/:/g, "")}UTC.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [filteredResults])

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => {
    const active = sortKey === sortKeyName
    return (
      <th
        scope="col"
        className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap"
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => toggleSort(sortKeyName)}
          className="inline-flex items-center gap-1 rounded-sm hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
          )}
          <span className="sr-only">
            {active ? `, sorted ${sortDir === "asc" ? "ascending" : "descending"}` : ", activate to sort"}
          </span>
        </button>
      </th>
    )
  }

  const showCountyPicker = searchType === "zipcode" && zipMode === "county"
  const zipsOverLimit = pendingZips !== null && pendingZips.length > COUNTY_ZIP_LIMIT

  return (
    <div className="container mx-auto px-3 md:px-4 py-6 md:py-10">
      <div className="text-center mb-6 md:mb-8">
        <h2 className="text-2xl md:text-5xl font-bold text-foreground mb-2 md:mb-4 text-balance">Advanced Search</h2>
        <p className="text-muted-foreground text-sm md:text-xl max-w-2xl mx-auto text-pretty">
          Look up FCC amateur and GMRS licenses by callsign, FRN, name, or location (ZIP code or state and county), one at a time or in bulk.
        </p>
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto text-left text-pretty">
          Only active FCC amateur radio and GMRS licenses are searched. Expired, cancelled, and terminated licenses are not included.
        </p>
      </div>

      <div className={`${showCountyPicker ? "max-w-6xl" : "max-w-2xl"} mx-auto flex flex-col gap-4`}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          <span id="search-type-label" className="text-sm font-medium text-foreground">
            Search by
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={searchType}
            onValueChange={(v) => {
              if (!v) return
              setSearchType(v as SearchType)
              setInput("")
              setInputError(null)
              setPendingZips(null)
            }}
            aria-labelledby="search-type-label"
            className="grid w-full grid-cols-2 sm:grid-cols-4"
          >
            {(Object.keys(SEARCH_TYPES) as SearchType[]).map((type) => (
              <ToggleGroupItem
                key={type}
                value={type}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {SEARCH_TYPES[type].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {searchType === "zipcode" && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
            <span id="zip-mode-label" className="text-sm font-medium text-foreground">
                Search location by
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={zipMode}
              onValueChange={(v) => {
                if (!v) return
                setZipMode(v as ZipMode)
                setInputError(null)
                setPendingZips(null)
              }}
              aria-labelledby="zip-mode-label"
              className="grid w-full grid-cols-2"
            >
              <ToggleGroupItem value="county" className="data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground">
                State &amp; county
              </ToggleGroupItem>
              <ToggleGroupItem value="manual" className="data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground">
                Enter ZIP codes
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {!showCountyPicker ? (
          <form onSubmit={handleSubmit} role="search" aria-label={`${config.label} search`} className="flex flex-col gap-2">
            <label htmlFor="advanced-search-input" className="text-sm font-medium text-foreground">
              {searchType === "zipcode" ? "ZIP codes" : `${config.label}s`}
            </label>
            <Textarea
              id="advanced-search-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={config.placeholder}
              rows={3}
              aria-describedby="advanced-search-hint"
              aria-invalid={inputError ? true : undefined}
              className="font-mono"
            />
            <p id="advanced-search-hint" className="text-sm text-muted-foreground leading-relaxed">
              {config.hint} Press Ctrl+Enter to search.
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSearching} className="gap-2">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
                Search
              </Button>
              {input && (
                <Button type="button" variant="ghost" onClick={() => setInput("")} disabled={isSearching}>
                  Clear
                </Button>
              )}
            </div>
          </form>
        ) : pickerCollapsed ? (
          <div
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            role="group"
            aria-label="Selected state and counties"
          >
            <p className="line-clamp-2 text-sm text-muted-foreground text-pretty">
              <span className="font-medium text-foreground">
                {US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? stateAbbr}:
              </span>{" "}
              {selectedCountyNames.join(", ")}
            </p>
            <Button
              type="button"
                  size="sm"
                  className="shrink-0"
                  aria-expanded={false}
              aria-controls="county-picker"
              onClick={() => setPickerCollapsed(false)}
            >
              Change counties
            </Button>
          </div>
        ) : (
          <div id="county-picker" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 md:p-4" role="group" aria-label="Find ZIP codes by state and county">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="county-state" className="text-sm font-medium text-foreground">
                State
              </label>
              <Select value={stateAbbr} onValueChange={handleStateChange}>
                <SelectTrigger id="county-state" className="w-full">
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s.abbr} value={s.abbr}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {countiesLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading counties...
              </p>
            )}

            {counties.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-medium text-foreground">
                  Counties{" "}
                  <span className="font-normal text-muted-foreground">({selectedCounties.size} selected)</span>
                </legend>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label htmlFor="county-filter" className="sr-only">
                    Filter counties
                  </label>
  <div className="relative flex-1">
  <Search
  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
  aria-hidden="true"
  />
  <Input
  id="county-filter"
  type="search"
  value={countyFilter}
  onChange={(e) => setCountyFilter(e.target.value)}
  placeholder="Filter counties"
  className="h-10 border-muted-foreground/50 bg-background pl-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/40 dark:bg-background"
  />
  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        setPendingZips(null)
                        setSelectedCounties((prev) => {
                          const next = new Set(prev)
                          visibleCounties.forEach((c) => next.add(c.fips))
                          return next
                        })
                      }}
                    >
                      Select {countyFilter ? "shown" : "all"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={selectedCounties.size === 0}
                      onClick={() => {
                        setPendingZips(null)
                        setSelectedCounties(new Set())
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <ul className="max-h-96 overflow-y-auto rounded-md border border-border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {visibleCounties.map((c) => {
                    const id = `county-${c.fips}`
                    return (
                      <li key={c.fips} className="flex items-center gap-2 px-3 py-2 hover:bg-muted">
                        <Checkbox
                          id={id}
                          checked={selectedCounties.has(c.fips)}
                          onCheckedChange={(checked) => toggleCounty(c.fips, checked === true)}
                          className="border-foreground/70 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
                        />
                        <label htmlFor={id} className="flex-1 cursor-pointer text-sm text-foreground">
                          {c.name}{" "}
                          <span className="text-sm text-muted-foreground">
                            ({c.zipCount} ZIP{c.zipCount === 1 ? "" : "s"})
                          </span>
                        </label>
                      </li>
                    )
                  })}
                  {visibleCounties.length === 0 && (
                    <li className="px-3 py-4 text-sm text-muted-foreground">No counties match that filter.</li>
                  )}
                </ul>
                <div>
                  <Button
                    type="button"
                    onClick={generateZips}
                    disabled={selectedCounties.size === 0 || generating || isSearching}
                    className="gap-2"
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <MapPinned className="h-4 w-4" aria-hidden="true" />
                    )}
                    Generate ZIP codes
                  </Button>
                </div>
              </fieldset>
            )}

            <div aria-live="polite">
              {pendingZips && (
                <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-3" role="region" aria-labelledby="zip-confirm-heading">
                  <h3 id="zip-confirm-heading" className="text-sm font-semibold text-foreground text-pretty">
                    {pendingZips.length === 0
                      ? "No ZIP codes were found for the selected counties."
                      : `Found ${pendingZips.length} ZIP code${pendingZips.length === 1 ? "" : "s"} in ${selectedCountyNames.join(", ")}. Would you like to query ${pendingZips.length === 1 ? "it" : "them"}?`}
                  </h3>
                  {pendingZips.length > 0 && (
                    <>
                      <p className="max-h-24 overflow-y-auto font-mono text-sm text-muted-foreground leading-relaxed break-words">
                        {pendingZips.join(", ")}
                      </p>
                      {zipsOverLimit && (
                        <p className="text-sm text-destructive">
                          Only the first {COUNTY_ZIP_LIMIT} ZIP codes will be queried. Select fewer counties to search
                          the rest.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={confirmZipQuery} className="gap-2">
                          <Search className="h-4 w-4" aria-hidden="true" />
                          Yes, query {Math.min(pendingZips.length, COUNTY_ZIP_LIMIT)} ZIP codes
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setPendingZips(null)}>
                          No, cancel
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {inputError && (
          <p className="text-sm text-destructive" role="alert">
            {inputError}
          </p>
        )}
      </div>

      <div className="max-w-6xl mx-auto mt-6" aria-live="polite" aria-busy={isSearching}>
        {isSearching && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-8" role="status">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Searching {progress.done} of {progress.total}...
            </p>
            <Progress
              value={progress.total ? (progress.done / progress.total) * 100 : 0}
              aria-label="Search progress"
              className="w-full"
            />
            <Button type="button" variant="ghost" size="sm" onClick={cancelSearch} className="gap-1">
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        )}

        {!isSearching && hasSearched && (
          <div className="flex flex-col gap-3">
            {(notFound.length > 0 || failed.length > 0 || truncated.length > 0) && (
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
                {notFound.length > 0 && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">No records for: </span>
                    {notFound.join(", ")}
                  </p>
                )}
                {failed.length > 0 && (
                  <p className="text-destructive">
                    <span className="font-medium">Lookup failed for: </span>
                    {failed.join(", ")}
                  </p>
                )}
                {truncated.length > 0 && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Showing the first 1,000 matches for: </span>
                    {truncated.join(", ")}. Try a more specific name like &quot;Last, First&quot;.
                  </p>
                )}
              </div>
            )}

            {results.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No licenses found for {lastSearchLabel}.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="sr-only">Search results: </span>
                    Showing {filteredResults.length.toLocaleString()} of {rows.length.toLocaleString()} licensee
                    {rows.length === 1 ? "" : "s"} ({results.length.toLocaleString()} license
                    {results.length === 1 ? "" : "s"}) from {lastSearchLabel}.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div>
                      <label htmlFor="results-filter" className="sr-only">
                        Filter results
                      </label>
                      <Input
                        id="results-filter"
                        value={filterText}
                        onChange={(e) => {
                          setFilterText(e.target.value)
                          setPage(1)
                        }}
                        placeholder="Filter by callsign, name, city..."
                        className="sm:w-64"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={serviceFilter}
                        onValueChange={(v) => {
                          setServiceFilter(v as ServiceFilter)
                          setPage(1)
                        }}
                      >
                        <SelectTrigger className="flex-1 sm:w-36" aria-label="Filter by service">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All services</SelectItem>
                          <SelectItem value="amateur">Amateur</SelectItem>
                          <SelectItem value="gmrs">GMRS</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={exportToCSV}
                        disabled={filteredResults.length === 0}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Download<span className="sr-only"> {filteredResults.length} results as CSV</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {countyMatch && outsideRowCount > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-pretty">
                      <span className="font-medium text-foreground">
                        {outsideRowCount.toLocaleString()} licensee{outsideRowCount === 1 ? "" : "s"}
                      </span>{" "}
                      {outsideRowCount === 1 ? "has" : "have"} a city outside {countyMatch.label}, from ZIP codes that
                      cross county lines.{" "}
                      {showOutside ? "They are marked below." : "They are hidden."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      aria-pressed={showOutside}
                      onClick={() => {
                        setShowOutside((v) => !v)
                        setPage(1)
                      }}
                    >
                      {showOutside ? "Hide outside licenses" : "Show outside licenses"}
                    </Button>
                  </div>
                )}

                {filteredResults.length === 0 ? (
                  <p className="rounded-lg border border-border py-8 text-center text-muted-foreground">
                    No results match your filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="License results table, scrollable">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        License search results, page {currentPage} of {pageCount}. Column headers are sortable.
                      </caption>
                      <thead>
                        <tr className="bg-muted">
                          <SortHeader label="Amateur Callsign" sortKeyName="amateur" />
                          <SortHeader label="GMRS Callsign" sortKeyName="gmrs" />
                          <SortHeader label="Name" sortKeyName="name" />
                          <SortHeader label="Class" sortKeyName="class" />
                          <th scope="col" className="px-3 py-2 text-left font-medium text-foreground">
                            Street
                          </th>
                          <SortHeader label="City" sortKeyName="city" />
                          <SortHeader label="State" sortKeyName="state" />
                          <SortHeader label="ZIP" sortKeyName="zip" />
                          <SortHeader label="FRN" sortKeyName="frn" />
                        </tr>
                      </thead>
                      <tbody>
                        {pageResults.map((row) => {
                          const r = row.primary
                          return (
                            <tr key={row.key} className="border-t border-border align-top">
                              <td className="px-3 py-2">
                                <CallsignCell records={row.amateur} />
                              </td>
                              <td className="px-3 py-2">
                                <CallsignCell records={row.gmrs} />
                              </td>
                              <th scope="row" className="px-3 py-2 text-left font-normal text-foreground whitespace-nowrap">
                                {formatName(r.name)}
                              </th>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {row.amateur[0] ? formatLicenseClass(row.amateur[0].class) || "—" : "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {r.street ? formatStreet(r.street) : "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {r.city || "—"}
                                {row.outside && (
                                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                                    Outside county
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{r.state || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{r.zip || "—"}</td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.frn || "—"}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {pageCount > 1 && (
                  <nav className="flex items-center justify-between gap-2" aria-label="Results pages">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1"
                      onClick={() => setPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground" aria-current="page">
                      Page {currentPage} of {pageCount}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1"
                      onClick={() => setPage(currentPage + 1)}
                      disabled={currentPage === pageCount}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </nav>
                )}
              </>
            )}
          </div>
        )}

        {!isSearching && !hasSearched && (
          <div className="py-10 text-center text-muted-foreground">
            <Search className="mx-auto mb-3 h-10 w-10 opacity-40" aria-hidden="true" />
            <p>Choose a search type above to look up licenses.</p>
          </div>
        )}
      </div>
    </div>
  )
}
