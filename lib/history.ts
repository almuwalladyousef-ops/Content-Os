import { PostRecord } from './types'
import { ensureFolderStructure, readJsonFile, writeJsonFile } from './drive'

const PLATFORMS = ['youtube', 'instagram', 'tiktok'] as const

function normalizeEntry(entry: PostRecord): PostRecord {
  return {
    id: entry.id,
    date: entry.date,
    video_name: entry.video_name,
    platforms: entry.platforms.filter((platform): platform is PostRecord['platforms'][number] => PLATFORMS.includes(platform)),
    youtube_url: entry.youtube_url,
    instagram_url: entry.instagram_url,
    tiktok_url: entry.tiktok_url,
    caption: entry.caption,
    analysis_file_id: entry.analysis_file_id,
    transcript_file_id: entry.transcript_file_id,
  }
}

export async function getHistory(accessToken: string): Promise<PostRecord[]> {
  const { rootId } = await ensureFolderStructure(accessToken)
  const history = await readJsonFile<PostRecord[]>(accessToken, rootId, 'history.json')
  return (history ?? []).map(normalizeEntry)
}

export async function addHistoryEntry(accessToken: string, entry: PostRecord): Promise<void> {
  const { rootId } = await ensureFolderStructure(accessToken)
  const history = (await readJsonFile<PostRecord[]>(accessToken, rootId, 'history.json') ?? []).map(normalizeEntry)
  history.unshift(normalizeEntry(entry))
  await writeJsonFile(accessToken, rootId, 'history.json', history)
}

export async function clearHistory(accessToken: string): Promise<void> {
  const { rootId } = await ensureFolderStructure(accessToken)
  await writeJsonFile(accessToken, rootId, 'history.json', [])
}
