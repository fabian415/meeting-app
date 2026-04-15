import express from 'express'
import multer from 'multer'
import { uploadFilesToFTP } from '../services/ftpTransferServiceV2.js'
import { getDefaultSessionId } from '../services/openclawService.js'
import { transcodeAudioSegments } from '../services/audioProcessingService.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
})

function formatDuration(seconds) {
  const totalSeconds = Number.parseInt(seconds, 10) || 0
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatLocalTime(isoString) {
  if (!isoString) return '未提供'

  return new Date(isoString).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function buildMetadata({ meetingTitle, meetingStartTime, meetingEndTime, audioDuration }) {
  return [
    '# 會議錄音資訊',
    '',
    `- **會議名稱**：${meetingTitle || '未命名會議'}`,
    `- **開始時間**：${formatLocalTime(meetingStartTime)}`,
    `- **結束時間**：${formatLocalTime(meetingEndTime)}`,
    `- **錄音長度**：${formatDuration(audioDuration)}`,
  ].join('\n')
}

function getAudioExtension(audioFile) {
  if (audioFile.originalname?.includes('.')) {
    return audioFile.originalname.split('.').pop().toLowerCase()
  }

  if (audioFile.mimetype.includes('webm')) return 'webm'
  if (audioFile.mimetype.includes('ogg')) return 'ogg'
  if (audioFile.mimetype.includes('mp4')) return 'm4a'
  if (audioFile.mimetype.includes('mpeg')) return 'mp3'
  return 'wav'
}

function buildAudioPath(remoteName) {
  const mediaBasePath = process.env.OPENCLAW_MEDIA_BASE_PATH?.trim()
  const ftpRemoteDir = process.env.FTP_REMOTE_DIR?.trim() || '/'

  if (mediaBasePath) {
    return `${mediaBasePath.replace(/\/+$/, '')}/${remoteName}`
  }

  const normalizedRemoteDir = ftpRemoteDir.startsWith('/') ? ftpRemoteDir : `/${ftpRemoteDir}`
  return `${normalizedRemoteDir.replace(/\/+$/, '') || '/'}${normalizedRemoteDir === '/' ? '' : '/'}${remoteName}`
}

function buildOpenClawPrompt({ audioPath, notifyEmail, meetingTitle }) {
  return [
    '我已經上傳完音檔。',
    `音檔位置：${audioPath}`,
    `音檔檔名：${audioPath.split('/').pop()}`,
    `會議名稱：${meetingTitle || '未命名會議'}`,
    '請透過本地模式進行轉錄。',
    '請使用 meeting-transcription 的 skill。',
    `完成後請發信給 ${notifyEmail}。`,
  ].join('\n')
}

router.post(
  '/',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'audioSegments', maxCount: 100 },
  ]),
  async (req, res) => {
    try {
      const uploadedAudioFile = req.files?.audio?.[0]
      const audioSegments = req.files?.audioSegments || []
      const shouldTranscodeSegments = audioSegments.length > 1
      const audioFile = shouldTranscodeSegments
        ? await transcodeAudioSegments({
            files: audioSegments,
            segmentMimeType: req.body.segmentMimeType,
            outputFormat: req.body.outputAudioFormat || process.env.OUTPUT_AUDIO_FORMAT || 'webm',
          })
        : uploadedAudioFile

      if (!audioFile) {
        return res.status(400).json({ success: false, message: '未提供錄音檔案' })
      }

      const now = new Date()
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const rawTitle = req.body.meetingTitle || '未命名會議'
      const safeTitle = rawTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 50) || 'meeting'
      const audioExt = getAudioExtension(audioFile)
      const baseName = `${safeTitle}_${timestamp}`
      const audioRemoteName = `${baseName}.${audioExt}`

      const metaContent = buildMetadata({
        meetingTitle: rawTitle,
        meetingStartTime: req.body.meetingStartTime,
        meetingEndTime: req.body.meetingEndTime,
        audioDuration: req.body.audioDuration,
      })

      const filesToUpload = [
        { buffer: audioFile.buffer, remoteName: audioRemoteName },
        { buffer: Buffer.from(metaContent, 'utf-8'), remoteName: `${baseName}_meta.md` },
      ]

      const uploadResult = await uploadFilesToFTP(filesToUpload)
      const audioPath = buildAudioPath(audioRemoteName)
      const notifyEmail = req.body.notifyEmail || process.env.OPENCLAW_NOTIFY_EMAIL || 'fabian.chung@advantech.com.tw'
      const conversationContext = {
        meetingTitle: rawTitle,
        uploadedAt: now.toISOString(),
        audioFileName: audioRemoteName,
        audioPath,
        notifyEmail,
        sessionId: getDefaultSessionId(),
        mode: 'local',
        skill: 'meeting-transcription',
        audioConverted: !!audioFile.converted,
        sourceSegmentCount: audioFile.sourceSegmentCount || 1,
      }

      const suggestedPrompt = buildOpenClawPrompt({
        audioPath,
        notifyEmail,
        meetingTitle: rawTitle,
      })

      return res.json({
        success: true,
        message: '檔案已成功上傳至伺服器',
        files: uploadResult.files,
        uploadedAt: now.toISOString(),
        conversationContext,
        suggestedPrompt,
      })
    } catch (error) {
      console.error('[Upload Error]', error.message)
      return res.status(500).json({
        success: false,
        message: error.message || '上傳過程發生錯誤，請稍後再試',
      })
    }
  },
)

export default router
