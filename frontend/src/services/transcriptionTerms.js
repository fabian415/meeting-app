import { getTranscribeTermsLimit } from '../api/index.js'

function normalizeTerms(terms = []) {
  return [...new Set(
    (terms || [])
      .map(term => String(term || '').trim())
      .filter(Boolean),
  )]
}

export async function selectTermsForTranscription(terms = []) {
  const normalizedTerms = normalizeTerms(terms)
  if (normalizedTerms.length === 0) {
    return { selectedTerms: [], maxTerms: 0 }
  }

  const limit = await getTranscribeTermsLimit()
  const maxTerms = Math.max(0, Number(limit?.max_terms) || 0)
  const selectedTerms = maxTerms > 0 ? normalizedTerms.slice(0, maxTerms) : []

  return {
    selectedTerms,
    maxTerms,
    warning: limit?.warning || '',
  }
}

export function buildTranscriptionPromptWithTerms(uploadResult, selectedTerms = []) {
  const basePrompt = uploadResult?.suggestedPrompt || ''
  const normalizedTerms = normalizeTerms(selectedTerms)

  if (normalizedTerms.length === 0) return basePrompt

  return [
    basePrompt,
    '',
    '本次轉錄請帶入以下專有名詞 terms，以提升辨識品質。呼叫 POST /transcribe 時，請把這些詞彙放入 terms 欄位：',
    normalizedTerms.join(', '),
  ].join('\n')
}

export function buildTranscriptionContext(uploadResult, selectedTerms = []) {
  const context = uploadResult?.conversationContext || {}
  const normalizedTerms = normalizeTerms(selectedTerms)

  return {
    ...context,
    skill: 'meeting-transcription',
    transcribeTerms: normalizedTerms,
    terms: normalizedTerms,
  }
}

export function startUploadedTranscriptionConversation(store, selectedTerms = [], uploadResultOverride = null) {
  const uploadResult = uploadResultOverride || store.uploadResult
  const normalizedTerms = normalizeTerms(selectedTerms)

  store.uploadResult = uploadResult
  store.setSelectedTerms(normalizedTerms)
  store.startConversation({
    sessionId: uploadResult?.conversationContext?.sessionId || null,
    context: buildTranscriptionContext(uploadResult, normalizedTerms),
    initialMessages: [],
    draft: buildTranscriptionPromptWithTerms(uploadResult, normalizedTerms),
  })
}
