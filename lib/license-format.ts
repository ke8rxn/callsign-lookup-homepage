export interface CallsignRecord {
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

// Convert "Last, First" to "First Last"
export function formatName(name: string): string {
  if (!name) return "Name not available"
  const parts = name.split(",").map(part => part.trim())
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`
  }
  return name
}

// Check if service code is Amateur Radio (HA = Amateur, HV = Vanity)
export function isAmateurRadio(service: string): boolean {
  return service === "HA" || service === "HV"
}

// Convert license class abbreviation to full name
export function formatLicenseClass(classAbbr: string | null): string {
  if (!classAbbr) return ""
  const classMap: Record<string, string> = {
    "E": "Extra",
    "G": "General",
    "T": "Tech",
    "A": "Advanced",
    "N": "Novice",
    "P": "Tech Plus",
  }
  return classMap[classAbbr.toUpperCase()] || classAbbr
}

// Format concatenated street address: "3869NordicAve" -> "3869 Nordic Ave"
export function formatStreet(street: string): string {
  if (!street) return "Street not available"
  
  // If street is only digits, it's a PO Box (FCC strips "PO BOX" prefix)
  if (/^\d+$/.test(street.trim())) {
    return `PO Box ${street.trim()}`
  }
  
  // If street already has spaces, return as-is (properly formatted)
  if (street.includes(" ")) return street
  
  // Directions that appear at the end (check these first, before suffixes)
  const directions = ["NW", "NE", "SW", "SE"]
  const singleDirections = ["N", "S", "E", "W"]
  
  let formatted = street
  let trailingDirection = ""
  
  // Step 1: Extract direction from end first (before any other processing)
  for (const dir of directions) {
    const regex = new RegExp(`(${dir})$`, "i")
    if (regex.test(formatted)) {
      trailingDirection = dir.toUpperCase()
      formatted = formatted.replace(regex, "")
      break
    }
  }
  if (!trailingDirection) {
    // Check single directions only if no multi-char direction found
    for (const dir of singleDirections) {
      const regex = new RegExp(`([a-z])(${dir})$`, "")
      if (regex.test(formatted)) {
        trailingDirection = dir
        formatted = formatted.replace(new RegExp(`${dir}$`), "")
        break
      }
    }
  }
  
  // Step 2: Handle ordinal street names (e.g., "1241140thAve" -> "1241 140th Ave")
  // Look for ordinal pattern: digits followed by st/nd/rd/th, then an UPPERCASE letter (new word)
  // This prevents matching "th" in words like "Thornapple"
  const ordinalMatch = formatted.match(/^(\d+?)(\d{1,3})(st|nd|rd|th)([A-Z].*)$/i)
  if (ordinalMatch) {
    const [, houseNum, streetNum, ordinalSuffix, rest] = ordinalMatch
    // Only treat as ordinal if the suffix is followed by uppercase (new word like "Ave")
    if (/^[A-Z]/.test(rest)) {
      formatted = `${houseNum} ${streetNum}${ordinalSuffix.toLowerCase()}${rest}`
    } else {
      // Not actually an ordinal, just add space after house number
      formatted = formatted.replace(/^(\d+)([A-Za-z])/, "$1 $2")
    }
  } else {
    // Step 3: Add space between number and first letter (only if no ordinal)
    formatted = formatted.replace(/^(\d+)([A-Za-z])/, "$1 $2")
  }
  
  // Step 4: Find and isolate street suffix
  // These must match as complete suffix words, not within other words
  // Order matters: check longer suffixes first to avoid partial matches
  const suffixPatterns = [
    "Avenue", "Boulevard", "Parkway", "Highway", "Terrace", "Circle", "Street", "Drive", "Place", "Trail", "Court", "Lane", "Road", "Loop", "Way",
    "Blvd", "Pkwy", "Hwy", "Ter", "Cir", "Ave", "Trl", "Ct", "Ln", "Rd", "St", "Dr", "Pl"
  ]
  
  for (const suffix of suffixPatterns) {
    // Match suffix at end of string (after direction removed) that follows lowercase
    // The suffix must be at the end or followed by nothing (since we stripped direction)
    const regex = new RegExp(`([a-z])(${suffix})$`, "i")
    const match = formatted.match(regex)
    if (match) {
      // Capitalize suffix properly
      const properSuffix = suffix.charAt(0).toUpperCase() + suffix.slice(1).toLowerCase()
      formatted = formatted.replace(regex, `$1 ${properSuffix}`)
      break
    }
  }
  
  // Step 5: Now split remaining concatenated words
  // Only split on lowercase-to-uppercase transitions
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2")
  
  // Step 6: Add space between "Suite" and the number (e.g., "Suite110" -> "Suite 110")
  formatted = formatted.replace(/\b(Suite)(\d)/gi, "$1 $2")
  
  // Step 7: Add back the trailing direction
  if (trailingDirection) {
    formatted = formatted + " " + trailingDirection
  }
  
  // Clean up extra spaces
  return formatted.trim().replace(/\s+/g, " ")
}
