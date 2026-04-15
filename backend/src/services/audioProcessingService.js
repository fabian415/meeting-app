import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'

function getExtensionFromMime(mimeType = '') {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

function getOutputConfig(format = 'webm') {
  if (format === 'mp3') {
    return {
      extension: 'mp3',
      mimeType: 'audio/mpeg',
      args: ['-vn', '-c:a', 'libmp3lame', '-b:a', process.env.FFMPEG_AUDIO_BITRATE || '64k'],
    }
  }

  return {
    extension: 'webm',
    mimeType: 'audio/webm',
    args: ['-vn', '-c:a', 'libopus', '-b:a', process.env.FFMPEG_AUDIO_BITRATE || '64k'],
  }
}

function toConcatPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

function runFfmpeg(args) {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => reject(error))
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`ffmpeg failed with exit code ${code}: ${stderr.trim()}`))
    })
  })
}

export async function transcodeAudioSegments({ files, segmentMimeType, outputFormat = 'webm' }) {
  if (!files?.length) {
    throw new Error('未提供可合併的錄音片段')
  }

  const config = getOutputConfig(outputFormat)
  const inputExt = getExtensionFromMime(segmentMimeType || files[0].mimetype)
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'meeting-recorder-'))

  try {
    const inputPaths = []

    for (let index = 0; index < files.length; index += 1) {
      const inputPath = path.join(tempDir, `segment-${String(index + 1).padStart(3, '0')}.${inputExt}`)
      await writeFile(inputPath, files[index].buffer)
      inputPaths.push(inputPath)
    }

    const concatListPath = path.join(tempDir, 'segments.txt')
    const concatList = inputPaths.map(inputPath => `file '${toConcatPath(inputPath)}'`).join('\n')
    await writeFile(concatListPath, concatList, 'utf-8')

    const outputPath = path.join(tempDir, `recording.${config.extension}`)

    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      ...config.args,
      outputPath,
    ])

    const buffer = await readFile(outputPath)

    return {
      buffer,
      mimetype: config.mimeType,
      originalname: `recording.${config.extension}`,
      converted: true,
      sourceSegmentCount: files.length,
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
