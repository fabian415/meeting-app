import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

const whisperApi = axios.create({
  baseURL: '/whisper',
  timeout: 60000,
})

function getAudioFilename(audioBlob, fallbackName = '') {
  if (fallbackName) return fallbackName

  const audioExt = audioBlob.type.includes('webm') ? 'webm'
    : audioBlob.type.includes('ogg') ? 'ogg'
    : audioBlob.type.includes('mp4') ? 'mp4'
    : 'wav'

  return `recording.${audioExt}`
}

export async function uploadMeeting({ audioBlob, audioFileName, meetingTitle, meetingStartTime, meetingEndTime, audioDuration }) {
  const form = new FormData()

  form.append('audio', audioBlob, getAudioFilename(audioBlob, audioFileName))
  form.append('meetingTitle', meetingTitle || '未命名會議')
  form.append('meetingStartTime', meetingStartTime || '')
  form.append('meetingEndTime', meetingEndTime || '')
  form.append('audioDuration', String(audioDuration || 0))

  const res = await api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function chatWithOpenClaw({ message, sessionId = null, context = {} }) {
  const res = await api.post('/openclaw/chat', {
    message,
    sessionId,
    context,
  })
  return res.data
}

export async function getOpenClawHistory(sessionId = null) {
  const res = await api.get('/openclaw/history', {
    params: sessionId ? { sessionId } : {},
  })
  return res.data
}

export async function listSpeakers() {
  const res = await whisperApi.get('/speakers')
  return res.data
}

export async function enrollSpeaker({ name, audioBlob, device = 'auto' }) {
  const form = new FormData()
  const audioExt = audioBlob.type.includes('webm') ? 'webm'
    : audioBlob.type.includes('ogg') ? 'ogg'
    : audioBlob.type.includes('mp4') ? 'mp4'
    : 'wav'
  form.append('audio', audioBlob, `${name}_sample.${audioExt}`)
  form.append('name', name)
  form.append('device', device)
  const res = await whisperApi.post('/speakers/enroll', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function deleteSpeaker(name) {
  const res = await whisperApi.delete(`/speakers/${encodeURIComponent(name)}`)
  return res.data
}

export async function listProperNouns() {
  const res = await whisperApi.get('/proper-nouns')
  return res.data
}

export async function addProperNoun(term) {
  const res = await whisperApi.post('/proper-nouns', { term })
  return res.data
}

export async function updateProperNoun(term, newTerm) {
  const res = await whisperApi.put(`/proper-nouns/${encodeURIComponent(term)}`, { new_term: newTerm })
  return res.data
}

export async function deleteProperNoun(term) {
  const res = await whisperApi.delete(`/proper-nouns/${encodeURIComponent(term)}`)
  return res.data
}

export async function importProperNounsFromFile(file) {
  const form = new FormData()
  form.append('sourceFile', file, file.name)

  const res = await api.post('/glossary/prepare-import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 240000,
  })

  return res.data
}

export async function finalizeProperNounImport(outputRemotePath) {
  const res = await api.post('/glossary/finalize-import', {
    outputRemotePath,
  })

  return res.data
}
