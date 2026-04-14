import express from 'express'
import { downloadFileFromFTP, fileExistsOnFTP } from '../services/ftpTransferServiceV2.js'
import { upsertProperNouns } from '../services/properNounService.js'

const router = express.Router()

function splitDelimitedLine(line, delimiter) {
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

function parseTermsFromOutputFile(fileBuffer) {
  const content = fileBuffer.toString('utf8').replace(/^\uFEFF/, '')
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = splitDelimitedLine(lines[0], delimiter).map(header => header.trim().toLowerCase())
  const termIndex = headers.indexOf('term')

  if (termIndex === -1) {
    throw new Error('proper noun 輸出檔缺少 term 欄位')
  }

  return [...new Set(
    lines
      .slice(1)
      .map(line => splitDelimitedLine(line, delimiter)[termIndex] || '')
      .map(term => term.trim())
      .filter(Boolean),
  )]
}

router.post('/finalize-import', async (req, res) => {
  try {
    const outputRemotePath = String(req.body?.outputRemotePath || '').trim()

    if (!outputRemotePath) {
      return res.status(400).json({ success: false, message: '缺少 outputRemotePath' })
    }

    const fileReady = await fileExistsOnFTP(outputRemotePath)
    if (!fileReady) {
      return res.status(404).json({
        success: false,
        message: '找不到 OpenClaw 產生的輸出檔案，請先確認 agent 已完成處理',
      })
    }

    const outputBuffer = await downloadFileFromFTP(outputRemotePath)
    const terms = parseTermsFromOutputFile(outputBuffer)
    const importResult = await upsertProperNouns(terms)

    return res.json({
      success: true,
      message: '專有名詞已匯入資料庫',
      outputRemotePath,
      extractedCount: terms.length,
      ...importResult,
    })
  } catch (error) {
    console.error('[Glossary Finalize Error]', error.message)
    return res.status(500).json({
      success: false,
      message: error.message || '匯入 OpenClaw 產出檔案時發生錯誤',
    })
  }
})

export default router
