import express from 'express'
import multer from 'multer'
import { uploadFilesToFTP } from '../services/ftpService.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
})

function formatDuration(seconds) {
  const s = parseInt(seconds) || 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatLocalTime(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function buildMetadata({ meetingTitle, meetingStartTime, meetingEndTime, audioDuration }) {
  return [
    `# 會議元資料`,
    ``,
    `- **會議名稱**：${meetingTitle || '未命名會議'}`,
    `- **開始時間**：${formatLocalTime(meetingStartTime)}`,
    `- **結束時間**：${formatLocalTime(meetingEndTime)}`,
    `- **錄音時長**：${formatDuration(audioDuration)}`,
  ].join('\n')
}

router.post('/', upload.fields([
  { name: 'audio', maxCount: 1 },
]), async (req, res) => {
  try {
    const audioFile = req.files?.audio?.[0]

    if (!audioFile) {
      return res.status(400).json({ success: false, message: '未提供錄音檔案' })
    }

    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const rawTitle = req.body.meetingTitle || '未命名會議'
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 50)
    const baseName = `${safeTitle}_${timestamp}`

    const audioExt = audioFile.mimetype.includes('webm') ? 'webm'
      : audioFile.mimetype.includes('ogg') ? 'ogg'
      : audioFile.mimetype.includes('mp4') ? 'mp4'
      : 'wav'

    const metaContent = buildMetadata({
      meetingTitle: rawTitle,
      meetingStartTime: req.body.meetingStartTime,
      meetingEndTime: req.body.meetingEndTime,
      audioDuration: req.body.audioDuration,
    })

    const filesToUpload = [
      {
        buffer: audioFile.buffer,
        remoteName: `${baseName}.${audioExt}`,
      },
      {
        buffer: Buffer.from(metaContent, 'utf-8'),
        remoteName: `${baseName}_meta.md`,
      },
    ]

    const result = await uploadFilesToFTP(filesToUpload)

    res.json({
      success: true,
      message: '檔案已成功上傳至伺服器',
      files: result.files,
      uploadedAt: now.toISOString(),
    })
  } catch (err) {
    console.error('[Upload Error]', err.message)
    res.status(500).json({
      success: false,
      message: err.message || '上傳過程發生錯誤，請稍後再試',
    })
  }
})

export default router
