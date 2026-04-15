const DB_NAME = 'meeting-recorder-drafts'
const DB_VERSION = 1
const META_STORE = 'meta'
const CHUNK_STORE = 'chunks'
const ACTIVE_DRAFT_KEY = 'active'

let dbPromise = null

function isIndexedDbAvailable() {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openDb() {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'))
  }

  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }

      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

async function withStore(storeName, mode, callback) {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const request = callback(store)

    tx.oncomplete = () => resolve(request?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function withStores(storeNames, mode, callback) {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode)
    const stores = Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]))
    const result = callback(stores)

    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function getRecordingDraftMeta() {
  return withStore(META_STORE, 'readonly', store => store.get(ACTIVE_DRAFT_KEY))
}

export async function getRecordingDraftChunks() {
  return withStore(CHUNK_STORE, 'readonly', store => store.getAll())
}

export async function getRecordingDraft() {
  const [meta, chunks] = await Promise.all([
    getRecordingDraftMeta(),
    getRecordingDraftChunks(),
  ])

  const chunkRecords = chunks.filter(chunk => chunk.blob)

  return {
    meta: meta || null,
    chunkRecords,
    chunks: chunkRecords.map(chunk => chunk.blob),
    segments: groupChunksBySegment(chunkRecords),
  }
}

export async function startRecordingDraft({ mimeType, meetingTitle, meetingStartTime, elapsedSeconds = 0 }) {
  const now = new Date().toISOString()

  await withStores([META_STORE, CHUNK_STORE], 'readwrite', ({ meta, chunks }) => {
    meta.put({
      key: ACTIVE_DRAFT_KEY,
      mimeType,
      meetingTitle,
      meetingStartTime,
      meetingEndTime: null,
      elapsedSeconds,
      currentSegmentId: 1,
      segmentCount: 1,
      updatedAt: now,
      createdAt: now,
    })
    chunks.clear()
  })
}

export async function startNextRecordingDraftSegment({ mimeType, meetingTitle, meetingStartTime, elapsedSeconds = 0 }) {
  const current = await getRecordingDraftMeta()
  const nextSegmentId = Number(current?.segmentCount || current?.currentSegmentId || 1) + 1

  await withStore(META_STORE, 'readwrite', store => store.put({
    ...(current || { createdAt: new Date().toISOString() }),
    key: ACTIVE_DRAFT_KEY,
    mimeType,
    meetingTitle,
    meetingStartTime,
    meetingEndTime: null,
    elapsedSeconds,
    currentSegmentId: nextSegmentId,
    segmentCount: nextSegmentId,
    updatedAt: new Date().toISOString(),
  }))

  return nextSegmentId
}

export async function updateRecordingDraftMeta(patch) {
  const current = await getRecordingDraftMeta()
  if (!current) return

  await withStore(META_STORE, 'readwrite', store => store.put({
    ...current,
    ...patch,
    key: ACTIVE_DRAFT_KEY,
    updatedAt: new Date().toISOString(),
  }))
}

export async function appendRecordingDraftChunk(blob, { segmentId = 1 } = {}) {
  if (!blob?.size) return

  await withStore(CHUNK_STORE, 'readwrite', store => store.add({
    blob,
    segmentId,
    size: blob.size,
    createdAt: new Date().toISOString(),
  }))
}

export async function clearRecordingDraft() {
  await withStores([META_STORE, CHUNK_STORE], 'readwrite', ({ meta, chunks }) => {
    meta.delete(ACTIVE_DRAFT_KEY)
    chunks.clear()
  })
}

export function canUseRecordingDraftStore() {
  return isIndexedDbAvailable()
}

function groupChunksBySegment(chunks) {
  const segmentMap = new Map()

  chunks.forEach(chunk => {
    const segmentId = Number(chunk.segmentId || 1)
    if (!segmentMap.has(segmentId)) {
      segmentMap.set(segmentId, [])
    }
    segmentMap.get(segmentId).push(chunk.blob)
  })

  return Array.from(segmentMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([segmentId, blobs]) => ({ segmentId, blobs }))
}
