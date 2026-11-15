"use client"

import { useCallback, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"

const API_BASE = "https://api.ke8rxnwx.net"

const ENDPOINTS = [
  {
    path: "/crossref/",
    example: "KE8RXN",
    description: "Callsign plus all amateur and GMRS callsigns tied to the same FRN.",
  },
  { path: "/callsign/", example: "KC8EST", description: "License record for a single callsign." },
  { path: "/frn/", example: "0036850956", description: "All licenses held under an FCC Registration Number." },
  { path: "/name/", example: "Smith, John", description: "Licenses matching a licensee name (Last, First)." },
  { path: "/zipcode/", example: "49544", description: "All licenses with a mailing address in a ZIP code." },
]

const DATA_SOURCES = [
  { name: "RadioID.net", href: "https://radioid.net", use: "DMR ID lookups" },
  { name: "HearHam", href: "https://hearham.com", use: "Repeater directory" },
  { name: "US Census Bureau", href: "https://www.census.gov/geographies/reference-files.html", use: "ZIP-to-county and city data" },
  { name: "Zippopotam.us", href: "https://zippopotam.us", use: "ZIP code coordinates" },
  { name: "ipapi", href: "https://ipapi.co", use: "Approximate location for repeater search" },
]

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for when the clipboard API is blocked inside dialogs
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand("copy")
    document.body.removeChild(textarea)
  }
}

export function ApiDocs() {
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const copy = useCallback(async (path: string) => {
    await writeClipboard(`${API_BASE}${path}`)
    setCopiedPath(path)
    setTimeout(() => setCopiedPath((current) => (current === path ? null : current)), 2000)
  }, [])

  return (
    <div className="flex flex-col gap-5" role="region" aria-label="API details">
      <section className="flex flex-col gap-2" aria-labelledby="api-endpoints-heading">
        <h4 id="api-endpoints-heading" className="text-sm font-medium text-foreground">
          KE8RXN endpoints
        </h4>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Free, no key required. Send a GET request with the value appended to the endpoint. Responses are JSON with
          name, address, license class, and status for active FCC amateur and GMRS licenses.
        </p>
        <ul className="flex flex-col gap-2">
          {ENDPOINTS.map((endpoint) => (
            <li key={endpoint.path} className="flex flex-col gap-1 rounded-md bg-muted p-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all font-mono text-sm text-foreground">
                  {API_BASE}
                  {endpoint.path}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => copy(endpoint.path)}
                  aria-label={`Copy ${endpoint.path} endpoint to clipboard`}
                >
                  {copiedPath === endpoint.path ? (
                    <Check className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {endpoint.description}{" "}
                <span className="font-mono">
                  e.g. {endpoint.path}
                  {encodeURIComponent(endpoint.example)}
                </span>
              </p>
            </li>
          ))}
        </ul>
        <span className="sr-only" role="status" aria-live="polite">
          {copiedPath ? "API endpoint copied to clipboard" : ""}
        </span>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="api-sources-heading">
        <h4 id="api-sources-heading" className="text-sm font-medium text-foreground">
          Third-party data sources
        </h4>
        <ul className="flex flex-col gap-1 text-sm">
          {DATA_SOURCES.map((source) => (
            <li key={source.name} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <a
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline-offset-4 hover:underline"
              >
                {source.name}
                <span className="sr-only"> (opens in new window)</span>
              </a>
              <span className="text-sm text-muted-foreground">{source.use}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
