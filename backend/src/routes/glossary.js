import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { createScopedSessionId, initializeOpenClawSession, sendOpenClawMessage } from '../services/openclawService.js'
import { downloadFileFromFTP, fileExistsOnFTP, getDefaultFtpRemoteDir, uploadFilesToFTP } from '../services/ftpTransferService.js'
import { upsertProperNouns } from '../services/properNounService.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

const IMPORT_WAIT_TIMEOUT_MS = parseInt(process.env.GLOSSARY_IMPORT_TIMEOUT_MS || '180000', 10)
const IMPORT_POLL_INTERVAL_MS = parseInt(process.env.GLOSSARY_IMPORT_POLL_INTERVAL_MS || '3000', 10)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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
    '請透過 meeting-proper-noun-extractor skill 處理我上傳的檔案。',
    `來源檔案路徑：${inputPath}`,
    `來源檔案名稱：${originalName}`,
    `輸出檔案路徑：${outputPath}`,
    '請直接讀取來源檔案並產生 UTF-8 CSV 檔案。',
    '欄位請固定為：term,count,contexts',
    '如果無法抽出專有名詞，仍請產生只有表頭的 CSV。',
    '完成後請明確回覆已產生輸出檔案。',
  ].join('\n')
}

function splitCsvLine(line, delimiter) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells.map(cell => cell.trim())
}

function parseProperNounTerms(fileBuffer) {
  const content = fileBuffer.toString('utf8').replace(/^\uFEFF/, '')
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = splitCsvLine(lines[0], delimiter).map(header => header.trim().toLowerCase())
  const termIndex = headers.indexOf('term')

  if (termIndex === -1) {
    throw new Error('proper noun 檔案缺少 term 欄位')
  }

  return [...new Set(
    lines
      .slice(1)
      .map(line => splitCsvLine(line, delimiter)[termIndex] || '')
      .map(term => term.trim())
      .filter(Boolean),
  )]
}

async function waitForOutputFile(remotePath) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < IMPORT_WAIT_TIMEOUT_MS) {
    if (await fileExistsOnFTP(remotePath)) return true
    await sleep(IMPORT_POLL_INTERVAL_MS)
  }

  return false
}

router.post(
  '/import',
  upload.single('sourceFile'),
  async (req, res) => {
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

      await uploadFilesToFTP(
        [{ buffer: sourceFile.buffer, remoteName: inputRemoteName }],
        directories.remoteInputDir,
      )

      const inputPath = `${directories.workspaceInputDir}/${inputRemoteName}`
      const outputPath = `${directories.workspaceOutputDir}/${outputRemoteName}`
      const outputRemotePath = `${directories.remoteOutputDir}/${outputRemoteName}`
      const sessionId = createScopedSessionId('proper-noun-import')

      await initializeOpenClawSession({ sessionId })
      const prompt = buildPrompt({
        inputPath,
        outputPath,
        originalName: sourceFile.originalname,
      })

      const openclawResult = await sendOpenClawMessage({
        message: prompt,
        sessionId,
        context: {
          sessionId,
          skill: 'meeting-proper-noun-extractor',
          sourceFilePath: inputPath,
          outputFilePath: outputPath,
        },
      })

      const outputReady = await waitForOutputFile(outputRemotePath)
      if (!outputReady) {
        return res.status(504).json({
          success: false,
          message: 'OpenClaw 已收到請求，但在等待 proper noun 輸出檔案時逾時',
          sessionId,
          prompt,
          openclawReply: openclawResult.reply || '',
          sourceFilePath: inputPath,
          outputFilePath: outputPath,
        })
      }

      const outputBuffer = await downloadFileFromFTP(outputRemotePath)
      const terms = parseProperNounTerms(outputBuffer)
      const importResult = await upsertProperNouns(terms)

      return res.json({
        success: true,
        message: '專有名詞已從檔案匯入',
        sessionId,
        prompt,
        sourceFilePath: inputPath,
        outputFilePath: outputPath,
        outputRemotePath,
        openclawReply: openclawResult.reply || '',
        extractedCount: terms.length,
        ...importResult,
      })
    } catch (error) {
      console.error('[Glossary Import Error]', error.message)
      return res.status(500).json({
        success: false,
        message: error.message || '檔案匯入專有名詞時發生錯誤',
      })
    }
  },
)

export default router
