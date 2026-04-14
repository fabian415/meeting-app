import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { createScopedSessionId, initializeOpenClawSession } from '../services/openclawService.js'
import { getDefaultFtpRemoteDir, uploadFilesToFTP } from '../services/ftpTransferServiceV2.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

function sanitizeName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getImportDirectories() {
  const baseRemoteDir = (process.env.FTP_GLOSSARY_REMOTE_DIR || `${getDefaultFtpRemoteDir()}/proper-noun-imports`)
    .replace(/\/+$/, '')
  const workspaceBase = (process.env.OPENCLAW_GLOSSARY_WORKSPACE_BASE_PATH || process.env.OPENCLAW_MEDIA_BASE_PATH || '/tmp')
    .replace(/\/+$/, '')

  return {
    remoteInputDir: `${baseRemoteDir}/input`,
    remoteOutputDir: `${baseRemoteDir}/output`,
    workspaceInputDir: `${workspaceBase}/proper-noun-imports/input`,
    workspaceOutputDir: `${workspaceBase}/proper-noun-imports/output`,
  }
}

function buildPrompt({ inputPath, outputPath, originalName }) {
  return [
    '請透過 meeting-proper-noun-extractor skill，處理我剛上傳的檔案。',
    `來源檔案路徑：${inputPath}`,
    `來源檔案名稱：${originalName}`,
    `輸出檔案路徑：${outputPath}`,
    '請產出 UTF-8 CSV 檔案。',
    '欄位格式固定為：term,count,contexts',
    '完成後請明確回覆輸出檔案已建立。',
  ].join('\n')
}

router.post('/prepare-import', upload.single('sourceFile'), async (req, res) => {
  try {
    const sourceFile = req.file

    if (!sourceFile) {
      return res.status(400).json({ success: false, message: '未提供要匯入的檔案' })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const inputExtension = sourceFile.originalname.includes('.')
      ? sourceFile.originalname.slice(sourceFile.originalname.lastIndexOf('.'))
      : ''
    const baseName = sanitizeName(sourceFile.originalname.replace(/\.[^.]+$/, '')) || `proper_noun_${randomUUID().slice(0, 8)}`
    const jobName = `${baseName}_${timestamp}`
    const inputRemoteName = `${jobName}${inputExtension}`
    const outputRemoteName = `${jobName}_proper_nouns.csv`
    const directories = getImportDirectories()

    const uploadResult = await uploadFilesToFTP(
      [{ buffer: sourceFile.buffer, remoteName: inputRemoteName }],
      directories.remoteInputDir,
    )

    const sourceFilePath = `${directories.workspaceInputDir}/${inputRemoteName}`
    const outputFilePath = `${directories.workspaceOutputDir}/${outputRemoteName}`
    const outputRemotePath = `${directories.remoteOutputDir}/${outputRemoteName}`
    const sessionId = createScopedSessionId('proper-noun-import')
    const session = await initializeOpenClawSession({ sessionId })
    const prompt = buildPrompt({
      inputPath: sourceFilePath,
      outputPath: outputFilePath,
      originalName: sourceFile.originalname,
    })

    return res.json({
      success: true,
      message: '檔案已上傳完成，請前往 OpenClaw 對話送出 prompt',
      files: uploadResult.files,
      sessionId,
      prompt,
      conversationContext: {
        sessionId,
        skill: 'meeting-proper-noun-extractor',
        sourceFilePath,
        outputFilePath,
        outputRemotePath,
        hiddenMessageIds: session.hiddenMessageIds || [],
      },
    })
  } catch (error) {
    console.error('[Glossary Prepare Error]', error.message)
    return res.status(500).json({
      success: false,
      message: error.message || '準備詞彙匯入時發生錯誤',
    })
  }
})

export default router
