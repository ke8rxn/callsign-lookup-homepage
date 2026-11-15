"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Building2, Loader2 } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Part90SearchForm } from "@/components/part90/part90-search-form"
import { Part90Results, rangeLabel } from "@/components/part90/part90-results"
import { Part90DetailView } from "@/components/part90/part90-detail"
import { Part90DatasetInfo } from "@/components/part90/part90-dataset-info"
import {
  FIELD_KEYS,
  MODES,
  NO_MATCHES_MESSAGE,
  buildDetailUrl,
  buildListUrl,
  criteriaSummary,
  normalizeCriteria,
  part90Fetcher,
  validateCriteria,
  type Criteria,
  type FieldKey,
  type Paged,
  type Part90Detail,
  type Part90Error,
  type Part90Mode,
  type ResultRow,
  type ValidationError,
} from "@/lib/part90"

interface UrlState {
  mode: Part90Mode
  criteria: Criteria
  offset: number
  submitted: boolean
  detail: string | null
}

const EMPTY: UrlState = { mode: "callsign", criteria: {}, offset: 0, submitted: false, detail: null }

function readUrl(): UrlState {
  const sp = new URLSearchParams(window.location.search)
  const modeParam = sp.get("mode")
  const mode = MODES.some((m) => m.value === modeParam) ? (modeParam as Part90Mode) : "callsign"
  const criteria: Criteria = {}
  for (const key of FIELD_KEYS) {
    const v = sp.get(key)
    if (v) criteria[key] = v
  }
  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0)
  const detail = sp.get("detail")?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null
  return { mode, criteria: normalizeCriteria(mode, criteria), offset, submitted: sp.get("q") === "1", detail }
}

function toSearch(s: UrlState) {
  const sp = new URLSearchParams({ view: "part90", mode: s.mode })
  for (const [k, v] of Object.entries(s.criteria)) if (v) sp.set(k, v)
  if (s.submitted) sp.set("q", "1")
  if (s.offset > 0) sp.set("offset", String(s.offset))
  if (s.detail) sp.set("detail", s.detail)
  return `?${sp.toString()}`
}

const SWR_OPTIONS = { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: false }

export function Part90Page() {
  const [state, setState] = useState<UrlState>(EMPTY)
  const [draft, setDraft] = useState<Criteria>({})
  const [formError, setFormError] = useState<ValidationError | null>(null)
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef<"results" | "detail" | null>(null)

  const syncFromUrl = useCallback(() => {
    const next = readUrl()
    const invalid = next.submitted ? validateCriteria(next.mode, next.criteria) : null
    setState(invalid ? { ...next, submitted: false } : next)
    setDraft(next.criteria)
    setFormError(invalid)
  }, [])

  useEffect(() => {
    syncFromUrl()
    window.addEventListener("popstate", syncFromUrl)
    return () => window.removeEventListener("popstate", syncFromUrl)
  }, [syncFromUrl])

  const navigate = useCallback((next: UrlState, push = true) => {
    const url = `${window.location.pathname}${toSearch(next)}`
    if (push) window.history.pushState({ p90Detail: Boolean(next.detail) }, "", url)
    else window.history.replaceState(window.history.state, "", url)
    setState(next)
  }, [])

  const listKey = state.submitted && !state.detail ? buildListUrl(state.mode, state.criteria, state.offset) : null
  const detailKey = state.detail ? buildDetailUrl(state.detail) : null
  const list = useSWR<Paged<ResultRow>, Part90Error>(listKey, part90Fetcher, SWR_OPTIONS)
  const detail = useSWR<Part90Detail, Part90Error>(detailKey, part90Fetcher, SWR_OPTIONS)

  useEffect(() => {
    if (pendingFocus.current === "results" && (list.data || list.error)) {
      resultsHeadingRef.current?.focus()
      pendingFocus.current = null
    }
    if (pendingFocus.current === "detail" && detail.data) {
      detailHeadingRef.current?.focus()
      pendingFocus.current = null
    }
  }, [list.data, list.error, detail.data])

  const changeMode = (value: string) => {
    if (!value || value === state.mode) return
    setDraft({})
    setFormError(null)
    navigate({ ...EMPTY, mode: value as Part90Mode }, false)
  }

  const updateDraft = (key: FieldKey, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (formError?.field === key) setFormError(null)
  }

  const submit = () => {
    const criteria = normalizeCriteria(state.mode, draft)
    const error = validateCriteria(state.mode, criteria)
    if (error) {
      setFormError(error)
      if (error.field) document.getElementById(`p90-${error.field}`)?.focus()
      return
    }
    setFormError(null)
    if (state.mode === "callsign") {
      pendingFocus.current = "detail"
      navigate({ mode: "callsign", criteria, offset: 0, submitted: false, detail: criteria.callsign! })
    } else {
      pendingFocus.current = "results"
      navigate({ mode: state.mode, criteria, offset: 0, submitted: true, detail: null })
    }
  }

  const clear = () => {
    setDraft({})
    setFormError(null)
    navigate({ ...EMPTY, mode: state.mode }, false)
  }

  const openDetail = (callsign: string) => {
    pendingFocus.current = "detail"
    navigate({ ...state, detail: callsign })
    window.scrollTo({ top: 0 })
  }

  const closeDetail = () => {
    if (state.submitted) pendingFocus.current = "results"
    if (window.history.state?.p90Detail) window.history.back()
    else navigate({ ...state, detail: null })
  }

  const goToPage = (offset: number) => {
    pendingFocus.current = "results"
    navigate({ ...state, offset })
  }

  const summary = criteriaSummary(state.mode, state.criteria)
  const isLoading = (listKey !== null && list.isLoading) || (detailKey !== null && detail.isLoading)

  let announcement = ""
  if (state.detail) {
    if (detail.isLoading) announcement = `Loading license ${state.detail}.`
    else if (detail.error)
      announcement =
        detail.error.status === 404
          ? `No active IG/YG license was found for callsign ${state.detail}.`
          : detail.error.message
    else if (detail.data)
      announcement = `License ${detail.data.license.callsign} loaded, ${detail.data.locations.length} licensed location${
        detail.data.locations.length === 1 ? "" : "s"
      }.`
  } else if (listKey) {
    if (list.isLoading) announcement = "Searching."
    else if (list.error) announcement = list.error.message
    else if (list.data) announcement = list.data.total === 0 ? NO_MATCHES_MESSAGE : `${rangeLabel(list.data)}.`
  }

  const renderContent = () => {
    if (state.detail) {
      if (detail.isLoading) return <LoadingState label={`Loading license ${state.detail}…`} />
      if (detail.error)
        return (
          <MessageState
            tone={detail.error.status === 404 ? "neutral" : "error"}
            title={detail.error.status === 404 ? "License not found" : "Something went wrong"}
            message={
              detail.error.status === 404
                ? `No active IG/YG license was found for callsign ${state.detail}. Check the callsign and try again.`
                : detail.error.message
            }
          />
        )
      if (detail.data)
        return (
          <Part90DetailView
            data={detail.data}
            headingRef={detailHeadingRef}
            backLabel={state.submitted ? "Back to results" : "New search"}
            onBack={closeDetail}
          />
        )
      return null
    }
    if (listKey) {
      if (list.isLoading) return <LoadingState label="Searching the Part 90 database…" />
      if (list.error)
        return (
          <MessageState
            tone={list.error.status === 404 ? "neutral" : "error"}
            title={list.error.status === 404 ? "No matches" : "Search couldn't be completed"}
            message={list.error.message}
            headingRef={resultsHeadingRef}
          />
        )
      if (list.data && list.data.total === 0)
        return <MessageState tone="neutral" title="No matches" message={NO_MATCHES_MESSAGE} headingRef={resultsHeadingRef} />
      if (list.data)
        return (
          <Part90Results
            data={list.data}
            summary={summary}
            headingRef={resultsHeadingRef}
            detailHref={(cs) => toSearch({ ...state, detail: cs })}
            onOpenDetail={openDetail}
            onPage={goToPage}
          />
        )
    }
    return (
      <div className="py-10 text-center text-muted-foreground">
        <Building2 className="mx-auto mb-3 h-10 w-10 opacity-40" aria-hidden="true" />
        <p>Choose a search type above to find active Industrial/Business licenses.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-3 md:px-4 py-6 md:py-10">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-5xl font-bold text-foreground mb-2 md:mb-4 text-balance">
          Part 90 Industrial/Business Search
        </h1>
        <p className="text-muted-foreground text-sm md:text-xl max-w-2xl mx-auto text-pretty">
          Search active FCC Industrial/Business Pool licenses, licensed locations, and frequencies.
        </p>
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto text-left text-pretty">
          Covers IG (conventional) and YG (trunked) licenses only. Expired, cancelled, and terminated licenses are
          not included.
        </p>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span id="p90-mode-label" className="text-sm font-medium text-foreground">
              Search by
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              value={state.mode}
              onValueChange={changeMode}
              aria-labelledby="p90-mode-label"
              className="grid w-full grid-cols-2 sm:grid-cols-4"
            >
              {MODES.map((m) => (
                <ToggleGroupItem
                  key={m.value}
                  value={m.value}
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {m.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Part90SearchForm
            mode={state.mode}
            draft={draft}
            error={formError}
            isLoading={isLoading}
            onChange={updateDraft}
            onSubmit={submit}
            onClear={clear}
          />
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        <div aria-busy={isLoading}>{renderContent()}</div>

        <Part90DatasetInfo />
      </div>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

function MessageState({
  tone,
  title,
  message,
  headingRef,
}: {
  tone: "neutral" | "error"
  title: string
  message: string
  headingRef?: React.RefObject<HTMLHeadingElement | null>
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-6 text-center ${
        tone === "error" ? "border-destructive/20 bg-destructive/10" : "border-border bg-card"
      }`}
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className={`text-base font-semibold focus:outline-none ${tone === "error" ? "text-destructive" : "text-foreground"}`}
      >
        {title}
      </h2>
      <p className={tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message}</p>
    </div>
  )
}
