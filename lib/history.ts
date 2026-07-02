import { PostRecord } from './types'
import { ensureFolderStructure, readJsonFile, writeJsonFile } from './drive'

export async function getHistory(accessToken: string): Promise<PostRecord[]> {
  const { rootId } = await ensureFolderStructure(accessToken)
  const history = await readJsonFile<PostRecord[]>(accessToken, rootId, 'history.json')
  return history ?? []
}

export async function addHistoryEntry(accessToken: string, entry: PostRecord): Promise<void> {
  const { rootId } = await ensureFolderStructure(accessToken)
  const history = await readJsonFile<PostRecord[]>(accessToken, rootId, 'history.json') ?? []
  history.unshift(entry)
  await writeJsonFile(accessToken, rootId, 'history.json', history)
}

export async function clearHistory(accessToken: string): Promise<void> {
  const { rootId } = await ensureFolderStructure(accessToken)
  await writeJsonFile(accessToken, rootId, 'history.json', [])
}
