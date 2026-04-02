import * as ftp from 'basic-ftp'

export async function uploadFilesToFTP(files) {
  const client = new ftp.Client()
  client.ftp.verbose = false

  try {
    await client.access({
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT || '21'),
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === 'true',
    })

    const remoteDir = process.env.FTP_REMOTE_DIR || '/meetings'
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
  } catch (err) {
    throw new Error(`FTP 上傳失敗: ${err.message}`)
  } finally {
    client.close()
  }
}
