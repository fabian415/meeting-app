import * as ftp from 'basic-ftp'
import { Writable } from 'node:stream'

function createClient() {
  const client = new ftp.Client()
  client.ftp.verbose = false
  return client
}

async function connectClient(client) {
  await client.access({
    host: process.env.FTP_HOST,
    port: parseInt(process.env.FTP_PORT || '21', 10),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    secure: process.env.FTP_SECURE === 'true',
  })
}

export function getDefaultFtpRemoteDir() {
  return process.env.FTP_REMOTE_DIR || '/meetings'
}

export async function uploadFilesToFTP(files, remoteDir = getDefaultFtpRemoteDir()) {
  const client = createClient()

  try {
    await connectClient(client)
    await client.ensureDir(remoteDir)
    await client.cd(remoteDir)

    const results = []

    for (const file of files) {
      const { Readable } = await import('stream')
      const readable = Readable.from(file.buffer)

      await client.uploadFrom(readable, file.remoteName)
      results.push({
        name: file.remoteName,
        size: file.buffer.length,
        status: 'success',
      })
    }

    return { success: true, files: results }
  } catch (error) {
    throw new Error(`FTP 上傳失敗: ${error.message}`)
  } finally {
    client.close()
  }
}

export async function fileExistsOnFTP(remotePath) {
  const client = createClient()

  try {
    await connectClient(client)
    return await client.exists(remotePath)
  } catch (error) {
    throw new Error(`FTP 檢查檔案失敗: ${error.message}`)
  } finally {
    client.close()
  }
}

export async function downloadFileFromFTP(remotePath) {
  const client = createClient()

  try {
    await connectClient(client)
    const chunks = []

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })

    await client.downloadTo(writable, remotePath)

    return Buffer.concat(chunks)
  } catch (error) {
    throw new Error(`FTP 下載失敗: ${error.message}`)
  } finally {
    client.close()
  }
}
