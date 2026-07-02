import { google } from 'googleapis'

const FOLDER_NAME = 'ContentOS'
const SUBFOLDERS = ['analysis', 'transcripts', 'temp']

type FolderCache = { rootId: string; analysisId: string; transcriptsId: string; tempId: string }
const folderCache = new Map<string, FolderCache>()

export function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

export async function ensureFolderStructure(accessToken: string): Promise<{
  rootId: string
  analysisId: string
  transcriptsId: string
  tempId: string
}> {
  const cached = folderCache.get(accessToken)
  if (cached) return cached

  const drive = getDriveClient(accessToken)

  // Find or create root ContentOS folder
  const rootSearch = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  })

  let rootId: string
  if (rootSearch.data.files?.length) {
    rootId = rootSearch.data.files[0].id!
  } else {
    const created = await drive.files.create({
      requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    })
    rootId = created.data.id!
  }

  // Find or create subfolders
  const ids: Record<string, string> = {}
  for (const sub of SUBFOLDERS) {
    const search = await drive.files.list({
      q: `name='${sub}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    })
    if (search.data.files?.length) {
      ids[sub] = search.data.files[0].id!
    } else {
      const created = await drive.files.create({
        requestBody: { name: sub, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] },
        fields: 'id',
      })
      ids[sub] = created.data.id!
    }
  }

  // Ensure history.json exists
  const historySearch = await drive.files.list({
    q: `name='history.json' and '${rootId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  if (!historySearch.data.files?.length) {
    await drive.files.create({
      requestBody: { name: 'history.json', parents: [rootId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body: '[]' },
    })
  }

  const result = { rootId, analysisId: ids.analysis, transcriptsId: ids.transcripts, tempId: ids.temp }
  folderCache.set(accessToken, result)
  return result
}

export async function readJsonFile<T>(accessToken: string, folderId: string, filename: string): Promise<T | null> {
  const drive = getDriveClient(accessToken)
  const search = await drive.files.list({
    q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  if (!search.data.files?.length) return null
  const fileId = search.data.files[0].id!
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
  return JSON.parse(res.data as string) as T
}

export async function writeJsonFile(accessToken: string, folderId: string, filename: string, data: unknown): Promise<string> {
  const drive = getDriveClient(accessToken)
  const body = JSON.stringify(data, null, 2)

  const search = await drive.files.list({
    q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  })

  if (search.data.files?.length) {
    const fileId = search.data.files[0].id!
    await drive.files.update({
      fileId,
      media: { mimeType: 'application/json', body },
    })
    return fileId
  } else {
    const created = await drive.files.create({
      requestBody: { name: filename, parents: [folderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body },
    })
    return created.data.id!
  }
}

export async function writeTextFile(accessToken: string, folderId: string, filename: string, text: string): Promise<string> {
  const drive = getDriveClient(accessToken)
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId], mimeType: 'text/plain' },
    media: { mimeType: 'text/plain', body: text },
  })
  return created.data.id!
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const drive = getDriveClient(accessToken)
  await drive.files.delete({ fileId })
}
