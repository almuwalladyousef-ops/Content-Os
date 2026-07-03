import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

/**
 * Google Drive JSON database — the app's only "database".
 *
 * One Drive file per section (e.g. `schedule`, `dm`), owned by a service
 * account and living in Yousef's Drive folder (`DRIVE_DB_FOLDER_ID`).
 * Generalized from triggerdm's lib/driveDB.js so every part of the suite
 * shares one implementation.
 *
 * File resolution order for a section:
 *   1. env `DRIVE_DB_<SECTION>_FILE_ID` (e.g. DRIVE_DB_SCHEDULE_FILE_ID)
 *   2. legacy `GOOGLE_DRIVE_FILE_ID` for the `dm` section (triggerdm's db.json)
 *   3. find-or-create `<section>.json` inside DRIVE_DB_FOLDER_ID
 *
 * Dev fallback: when the service-account envs are missing, docs are stored in
 * `.dev-db/<section>.json` so everything runs locally with zero credentials.
 */

const SCOPES = ['https://www.googleapis.com/auth/drive']

function hasDriveCreds(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
}

function driveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  })
  return google.drive({ version: 'v3', auth })
}

const fileIdCache = new Map<string, string>()

async function resolveFileId(section: string): Promise<string> {
  const cached = fileIdCache.get(section)
  if (cached) return cached

  const envId = process.env[`DRIVE_DB_${section.toUpperCase().replace(/-/g, '_')}_FILE_ID`]
    || (section === 'dm' ? process.env.GOOGLE_DRIVE_FILE_ID : undefined)
  if (envId) {
    fileIdCache.set(section, envId)
    return envId
  }

  const folderId = process.env.DRIVE_DB_FOLDER_ID
  if (!folderId) {
    throw new Error(
      `drive-db: no file id for section "${section}" — set DRIVE_DB_${section.toUpperCase()}_FILE_ID or DRIVE_DB_FOLDER_ID`
    )
  }

  const drive = driveClient()
  const name = `${section}.json`
  const found = await drive.files.list({
    q: `'${folderId}' in parents and name = '${name}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  let id = found.data.files?.[0]?.id ?? undefined
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name, parents: [folderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body: 'null' },
      fields: 'id',
    })
    id = created.data.id ?? undefined
  }
  if (!id) throw new Error(`drive-db: could not find or create ${name} in folder ${folderId}`)
  fileIdCache.set(section, id)
  return id
}

// ── Dev fallback (no credentials): local JSON files ──────────────────────────

function devPath(section: string): string {
  return path.join(process.cwd(), '.dev-db', `${section}.json`)
}

function devRead(section: string): unknown {
  try { return JSON.parse(fs.readFileSync(devPath(section), 'utf8')) } catch { return null }
}

function devWrite(section: string, data: unknown): void {
  if (process.env.VERCEL) {
    // Serverless filesystems are read-only — a local-file fallback can never
    // work there, so fail with the actual problem instead of an fs error.
    throw new Error(
      'Drive DB is not configured: set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and DRIVE_DB_FOLDER_ID (or per-section DRIVE_DB_*_FILE_ID) in your Vercel project settings.'
    )
  }
  const p = devPath(section)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Reads a section's document. Returns null when empty/missing. */
export async function readDoc<T = unknown>(section: string): Promise<T | null> {
  if (!hasDriveCreds()) return devRead(section) as T | null
  const drive = driveClient()
  const fileId = await resolveFileId(section)
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
  try {
    return JSON.parse(res.data as unknown as string) as T
  } catch {
    return null
  }
}

/** Overwrites a section's document. */
export async function writeDoc(section: string, data: unknown): Promise<void> {
  if (!hasDriveCreds()) return devWrite(section, data)
  const drive = driveClient()
  const fileId = await resolveFileId(section)
  await drive.files.update({
    fileId,
    media: { mimeType: 'application/json', body: JSON.stringify(data, null, 2) },
  })
}

/** Read-modify-write helper (last write wins; fine for a single-user app). */
export async function updateDoc<T>(
  section: string,
  fallback: T,
  mutate: (current: T) => T | Promise<T>
): Promise<T> {
  const current = ((await readDoc<T>(section)) ?? fallback) as T
  const next = await mutate(current)
  await writeDoc(section, next)
  return next
}
