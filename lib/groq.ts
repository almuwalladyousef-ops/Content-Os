import Groq from 'groq-sdk'

export async function transcribeAudio(audioBuffer: Buffer, filename: string, apiKey: string): Promise<string> {
  const client = new Groq({ apiKey })

  // Copy buffer to ensure clean ArrayBuffer backing
  const arrayBuf: ArrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength
  ) as ArrayBuffer
  const blob = new Blob([arrayBuf], { type: filename.endsWith('.wav') ? 'audio/wav' : 'video/mp4' })
  const file = new File([blob], filename, { type: blob.type })

  const response = await client.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    response_format: 'text',
  })

  return response as unknown as string
}
