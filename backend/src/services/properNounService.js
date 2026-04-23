function getWhisperApiBaseUrl() {
  const baseUrl = (process.env.WHISPER_API_BASE_URL || 'http://172.22.12.162:8787').trim()
  return baseUrl.replace(/\/+$/, '')
}

async function requestWhisper(path, options = {}) {
  const response = await fetch(`${getWhisperApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const detail = typeof payload === 'string'
      ? payload
      : payload?.detail || payload?.message || JSON.stringify(payload)
    throw new Error(detail || `Whisper API request failed with status ${response.status}`)
  }

  return payload
}

export async function listProperNouns() {
  return await requestWhisper('/proper-nouns', { method: 'GET' })
}

export async function addProperNoun(term) {
  return await requestWhisper('/proper-nouns', {
    method: 'POST',
    body: JSON.stringify({ term }),
  })
}

export async function updateProperNoun(term, newTerm) {
  return await requestWhisper(`/proper-nouns/${encodeURIComponent(term)}`, {
    method: 'PUT',
    body: JSON.stringify({ new_term: newTerm }),
  })
}

export async function upsertProperNouns(inputTerms) {
  const incomingTerms = [...new Set(
    (inputTerms || [])
      .map(term => String(term || '').trim())
      .filter(Boolean),
  )]

  if (incomingTerms.length === 0) {
    return {
      success: true,
      importedCount: 0,
      addedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      terms: [],
    }
  }

  const current = await listProperNouns()
  const existingTerms = current?.terms || []
  const existingMap = new Map(existingTerms.map(term => [term.toLowerCase(), term]))

  let addedCount = 0
  let updatedCount = 0
  let skippedCount = 0

  for (const term of incomingTerms) {
    const key = term.toLowerCase()
    const existingTerm = existingMap.get(key)

    try {
      if (!existingTerm) {
        await addProperNoun(term)
        existingMap.set(key, term)
        addedCount += 1
        continue
      }

      if (existingTerm === term) {
        skippedCount += 1
        continue
      }

      await updateProperNoun(existingTerm, term)
      existingMap.set(key, term)
      updatedCount += 1
    } catch {
      skippedCount += 1
    }
  }

  let latest = null
  try {
    latest = await listProperNouns()
  } catch {
    latest = { terms: [...existingMap.values()] }
  }

  return {
    success: true,
    importedCount: incomingTerms.length,
    addedCount,
    updatedCount,
    skippedCount,
    terms: latest?.terms || [],
  }
}
