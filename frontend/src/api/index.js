import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min for large audio files
})

export async function uploadMeeting({ audioBlob, meetingTitle, meetingStartTime, meetingEndTime, audioDuration }) {
  const form = new FormData()

  const audioExt = audioBlob.type.includes('webm') ? 'webm'
    : audioBlob.type.includes('ogg') ? 'ogg'
    : audioBlob.type.includes('mp4') ? 'mp4'
    : 'wav'

  form.append('audio', audioBlob, `recording.${audioExt}`)
  form.append('meetingTitle', meetingTitle || '未命名會議')
  form.append('meetingStartTime', meetingStartTime || '')
  form.append('meetingEndTime', meetingEndTime || '')
  form.append('audioDuration', String(audioDuration || 0))

  const res = await api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total) {
        return Math.round((e.loaded / e.total) * 100)
      }
    },
  })
  return res.data
}
