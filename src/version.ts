/** The build's public/version.json (written by scripts/version.mjs), for the About card. */
export interface VersionInfo {
  version: string | null
  commit: string | null
  committed: string | null
  dirty: boolean
  built: string | null
}

/** Rows of the About card, label then value; anything the build could not tell is left out. */
export function versionRows(info: Partial<VersionInfo> | null, locale?: string): [string, string][] {
  const date = (iso: string | null | undefined): string | null => {
    const d = iso ? new Date(iso) : null
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : null
  }
  const rows: [string, string | null][] = [
    ['Version', info?.version ?? null],
    ['Commit', info?.commit ? info.commit + (info.dirty ? ' + local changes' : '') : null],
    ['Committed', date(info?.committed)],
    ['Built', date(info?.built)],
  ]
  const known = rows.filter((row): row is [string, string] => row[1] !== null)
  return known.length ? known : [['Version', 'unknown']]
}

/** Fetches version.json; null when offline or when the build has none. */
export async function loadVersion(): Promise<Partial<VersionInfo> | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-cache' })
    return response.ok ? ((await response.json()) as Partial<VersionInfo>) : null
  } catch {
    return null
  }
}
