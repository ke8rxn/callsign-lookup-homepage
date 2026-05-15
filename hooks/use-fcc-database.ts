"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import initSqlJs, { Database } from "sql.js"

export interface CallsignResult {
  callsign: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  licenseClass?: string
  grantDate?: string
  expireDate?: string
  frn?: string
  serviceType?: string
}

export function useFccDatabase() {
  const [db, setDb] = useState<Database | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const initializingRef = useRef(false)

  useEffect(() => {
    // Prevent double initialization in strict mode
    if (initializingRef.current) return
    initializingRef.current = true

    async function loadDatabase() {
      try {
        setIsLoading(true)
        setError(null)
        setLoadingProgress(10)

        // Initialize SQL.js with the WASM file from CDN
        // Using the full WASM URL to avoid sync/async fetching issues
        const SQL = await initSqlJs({
          locateFile: () => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/sql-wasm.wasm`,
        })
        setLoadingProgress(30)

        // Fetch the database file
        const response = await fetch("https://ke8rxnwx.net/data/fcc.db")
        if (!response.ok) {
          throw new Error(`Failed to fetch database: ${response.statusText}`)
        }
        setLoadingProgress(70)

        const arrayBuffer = await response.arrayBuffer()
        setLoadingProgress(90)

        // Create database from the buffer
        const database = new SQL.Database(new Uint8Array(arrayBuffer))
        setDb(database)
        setLoadingProgress(100)
      } catch (err) {
        console.error("[v0] Error loading FCC database:", err)
        setError(err instanceof Error ? err.message : "Failed to load database")
      } finally {
        setIsLoading(false)
      }
    }

    loadDatabase()

    return () => {
      // Cleanup on unmount
      if (db) {
        db.close()
      }
    }
  }, [])

  const searchCallsign = useCallback(
    (callsign: string): CallsignResult | null => {
      if (!db || !callsign.trim()) return null

      try {
        // Try to find the callsign - adjust query based on actual table structure
        // First, let's try a common FCC database structure
        const query = `
          SELECT * FROM licenses 
          WHERE callsign = ? 
          LIMIT 1
        `
        const result = db.exec(query, [callsign.toUpperCase().trim()])

        if (result.length === 0 || result[0].values.length === 0) {
          return null
        }

        const columns = result[0].columns
        const values = result[0].values[0]

        // Map the result to our interface
        const row: Record<string, string | number | null> = {}
        columns.forEach((col, i) => {
          row[col.toLowerCase()] = values[i] as string | number | null
        })

        return {
          callsign: String(row.callsign || row.call_sign || callsign),
          name: String(row.name || row.licensee_name || row.entity_name || ""),
          address: String(row.address || row.street_address || row.po_box || ""),
          city: String(row.city || ""),
          state: String(row.state || ""),
          zip: String(row.zip || row.zip_code || ""),
          licenseClass: row.license_class ? String(row.license_class) : row.operator_class ? String(row.operator_class) : undefined,
          grantDate: row.grant_date ? String(row.grant_date) : row.effective_date ? String(row.effective_date) : undefined,
          expireDate: row.expire_date ? String(row.expire_date) : row.expiration_date ? String(row.expiration_date) : undefined,
          frn: row.frn ? String(row.frn) : undefined,
          serviceType: row.service_type ? String(row.service_type) : row.radio_service_code ? String(row.radio_service_code) : undefined,
        }
      } catch (err) {
        console.error("[v0] Error querying database:", err)
        return null
      }
    },
    [db]
  )

  const getTableInfo = useCallback((): string[] => {
    if (!db) return []

    try {
      const result = db.exec("SELECT name FROM sqlite_master WHERE type='table'")
      if (result.length === 0) return []
      return result[0].values.map((v) => String(v[0]))
    } catch (err) {
      console.error("[v0] Error getting table info:", err)
      return []
    }
  }, [db])

  const getTableColumns = useCallback(
    (tableName: string): string[] => {
      if (!db) return []

      try {
        const result = db.exec(`PRAGMA table_info(${tableName})`)
        if (result.length === 0) return []
        return result[0].values.map((v) => String(v[1]))
      } catch (err) {
        console.error("[v0] Error getting columns:", err)
        return []
      }
    },
    [db]
  )

  const runQuery = useCallback(
    (query: string, params: (string | number)[] = []) => {
      if (!db) return null

      try {
        return db.exec(query, params)
      } catch (err) {
        console.error("[v0] Error running query:", err)
        return null
      }
    },
    [db]
  )

  return {
    db,
    isLoading,
    error,
    loadingProgress,
    searchCallsign,
    getTableInfo,
    getTableColumns,
    runQuery,
    isReady: !isLoading && !error && db !== null,
  }
}
