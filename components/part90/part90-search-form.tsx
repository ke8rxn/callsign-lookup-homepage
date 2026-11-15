"use client"

import type { FormEvent } from "react"
import { Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { US_STATES } from "@/lib/us-states"
import {
  FIELD_META,
  MODE_FIELDS,
  MODES,
  REQUIRED_FIELDS,
  SERVICE_LABELS,
  type Criteria,
  type FieldKey,
  type Part90Mode,
  type ValidationError,
} from "@/lib/part90"

const ADVANCED_GROUPS: { legend: string; fields: FieldKey[] }[] = [
  { legend: "License", fields: ["callsign", "name", "frn", "service"] },
  { legend: "FCC licensed location", fields: ["state", "county", "city", "zip"] },
  { legend: "Frequency", fields: ["frequency", "min", "max", "station_class"] },
]

interface Props {
  mode: Part90Mode
  draft: Criteria
  error: ValidationError | null
  isLoading: boolean
  onChange: (key: FieldKey, value: string) => void
  onSubmit: () => void
  onClear: () => void
}

export function Part90SearchForm({ mode, draft, error, isLoading, onChange, onSubmit, onClear }: Props) {
  const required = new Set(REQUIRED_FIELDS[mode] ?? [])
  const modeLabel = MODES.find((m) => m.value === mode)?.label ?? ""
  const hasInput = Object.values(draft).some((v) => v && v !== "any")

  const renderField = (key: FieldKey) => {
    const meta = FIELD_META[key]
    const id = `p90-${key}`
    const isRequired = required.has(key)
    const invalid = error?.field === key
    const describedBy = [meta.hint ? `${id}-hint` : null, invalid ? "p90-form-error" : null].filter(Boolean).join(" ") || undefined
    const label = (
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {meta.label}
        {isRequired && mode !== "callsign" && mode !== "frn" && (
          <span className="font-normal text-muted-foreground"> (required)</span>
        )}
      </label>
    )

    let control
    if (key === "state" || key === "service") {
      const options =
        key === "state"
          ? US_STATES.map((s) => ({ value: s.abbr, label: s.name }))
          : (["IG", "YG"] as const).map((s) => ({ value: s, label: `${s}: ${SERVICE_LABELS[s]}` }))
      const anyLabel = key === "state" ? "Any state" : "IG and YG"
      control = (
        <Select value={draft[key] || (isRequired ? "" : "any")} onValueChange={(v) => onChange(key, v)}>
          <SelectTrigger
            id={id}
            className="w-full"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            aria-required={isRequired || undefined}
          >
            <SelectValue placeholder={key === "state" ? "Select a state" : anyLabel} />
          </SelectTrigger>
          <SelectContent>
            {!isRequired && <SelectItem value="any">{anyLabel}</SelectItem>}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    } else {
      control = (
        <Input
          id={id}
          value={draft[key] ?? ""}
          onChange={(e) => onChange(key, e.target.value)}
          placeholder={meta.placeholder ? `e.g. ${meta.placeholder}` : undefined}
          inputMode={meta.inputMode}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={isRequired || undefined}
          className={["callsign", "frn", "frequency", "min", "max", "zip", "station_class"].includes(key) ? "font-mono" : ""}
        />
      )
    }

    return (
      <div key={key} className="flex min-w-0 flex-col gap-1.5">
        {label}
        {control}
        {meta.hint && (
          <p id={`${id}-hint`} className="text-sm text-muted-foreground leading-relaxed">
            {meta.hint}
          </p>
        )}
      </div>
    )
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label={`Part 90 ${modeLabel} search`}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-3 md:p-5"
    >
      {mode === "advanced" ? (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Combine any of the criteria below. County and city require a state. Use an exact frequency or a range,
            not both.
          </p>
          {ADVANCED_GROUPS.map((group) => (
            <fieldset key={group.legend} className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-semibold text-foreground">{group.legend}</legend>
              <div className="grid gap-3 sm:grid-cols-2">{group.fields.map(renderField)}</div>
            </fieldset>
          ))}
        </>
      ) : (
        <div className={`grid gap-3 ${MODE_FIELDS[mode].length > 1 ? "sm:grid-cols-2" : ""}`}>
          {MODE_FIELDS[mode].map(renderField)}
        </div>
      )}

      {error && (
        <p
          id="p90-form-error"
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading} className="gap-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Search
        </Button>
        {hasInput && (
          <Button type="button" variant="ghost" onClick={onClear} disabled={isLoading}>
            Clear
          </Button>
        )}
      </div>
    </form>
  )
}
