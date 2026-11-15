"use client"

import useSWR from "swr"
import { part90Fetcher, type Part90Meta } from "@/lib/part90"

function count(n: number | undefined) {
  return n === undefined ? null : n.toLocaleString()
}

export function Part90DatasetInfo() {
  const { data } = useSWR<Part90Meta>("/api/part90/meta", part90Fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  if (!data) return null

  const built = data.built_at
    ? new Date(data.built_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
    : null
  const items: [string, string][] = []
  if (built) items.push(["Last updated", built])
  if (count(data.counts?.licenses)) items.push(["Licenses", count(data.counts?.licenses)!])
  if (count(data.service_counts?.IG)) items.push(["IG conventional", count(data.service_counts?.IG)!])
  if (count(data.service_counts?.YG)) items.push(["YG trunked", count(data.service_counts?.YG)!])
  if (count(data.counts?.locations)) items.push(["Licensed locations", count(data.counts?.locations)!])
  if (count(data.counts?.frequencies)) items.push(["Frequency records", count(data.counts?.frequencies)!])

  return (
    <aside aria-labelledby="p90-data-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 md:p-4">
      <h2 id="p90-data-heading" className="text-base font-semibold text-foreground">
        About this data
      </h2>
      {items.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {items.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium text-foreground tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
        Source: {data.dataset ?? "FCC ULS"}, refreshed weekly.{" "}
        {data.license_status === "A" ? "Only active licenses are included. " : ""}
        {data.emissions_included === false ? "Emission designators are not included." : ""}
      </p>
    </aside>
  )
}
