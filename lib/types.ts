export interface PostRecord {
  id: string
  date: string
  video_name: string
  platforms: ('youtube' | 'instagram' | 'tiktok')[]
  youtube_url?: string
  instagram_url?: string
  tiktok_url?: string
  caption: string
  analysis_file_id?: string
  transcript_file_id?: string
}

export interface VideoAnalysis {
  hook: {
    category: string
    template: string
    strength: 'strong' | 'medium' | 'weak'
    assessment: string
  }
  format: string
  narrative_structure: {
    opening: string
    middle: string
    closing: string
    pacing: string
  }
  main_topic: string
  subtopics: string[]
  virality_factors: string[]
  retention_risk: {
    risk_level: 'high' | 'medium' | 'low'
    drop_off_points: string[]
    reasoning: string
  }
  suggested_improvements: string[]
  overall_assessment: string
}

export interface PlatformMetricsData {
  platform: 'instagram' | 'youtube' | 'tiktok'
  mediaType?: string
  plays?: number
  views?: number
  likes?: number
  comments?: number
  saves?: number
  shares?: number
  reach?: number
  avgWatchTimeMs?: number
  videoDurationSec?: number
  retentionCurve?: number[]
  avgRetentionPct?: number
  followers?: number
}

export interface PlatformPost {
  id: string
  title?: string
  caption?: string
  timestamp: string
  permalink?: string
  thumbnail?: string
  metrics: PlatformMetricsData
}

export type PostStatus = 'idle' | 'uploading' | 'success' | 'failed' | 'skipped'

export interface PlatformStatus {
  youtube: { state: PostStatus; message: string }
  instagram: { state: PostStatus; message: string }
  tiktok: { state: PostStatus; message: string }
}
