<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'
import {
  addProperNoun,
  deleteAllProperNouns,
  deleteProperNoun,
  importProperNounsFromFile,
  listProperNouns,
  updateProperNoun,
} from '../api/index.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const terms = ref([])
const loading = ref(false)
const searchQuery = ref('')
const showAddForm = ref(false)
const addingTerm = ref(false)
const newTerm = ref('')
const editingTerm = ref(null)
const editValue = ref('')
const savingTerm = ref(null)
const deletingTerm = ref(null)
const deletingAll = ref(false)
const importing = ref(false)
const fileInput = ref(null)

async function fetchTerms() {
  loading.value = true
  try {
    const data = await listProperNouns()
    terms.value = data.terms || []
  } catch (error) {
    emit('toast', { type: 'error', message: `載入專有名詞失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    loading.value = false
  }
}

const filteredTerms = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return terms.value
  return terms.value.filter(term => term.toLowerCase().includes(query))
})

function openAdd() {
  cancelEdit()
  showAddForm.value = true
  newTerm.value = ''
}

function cancelAdd() {
  showAddForm.value = false
  newTerm.value = ''
}

async function handleAdd() {
  const term = newTerm.value.trim()
  if (!term) {
    emit('toast', { type: 'error', message: '請先輸入詞彙' })
    return
  }

  addingTerm.value = true
  try {
    const data = await addProperNoun(term)
    terms.value = data.terms || []
    emit('toast', { type: 'success', message: `已新增「${term}」` })
    cancelAdd()
  } catch (error) {
    emit('toast', { type: 'error', message: `新增失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    addingTerm.value = false
  }
}

function startEdit(term) {
  cancelAdd()
  editingTerm.value = term
  editValue.value = term
}

function cancelEdit() {
  editingTerm.value = null
  editValue.value = ''
}

async function handleSave(originalTerm) {
  const nextTerm = editValue.value.trim()
  if (!nextTerm) {
    emit('toast', { type: 'error', message: '詞彙不可為空白' })
    return
  }

  if (nextTerm === originalTerm) {
    cancelEdit()
    return
  }

  savingTerm.value = originalTerm
  try {
    const data = await updateProperNoun(originalTerm, nextTerm)
    terms.value = data.terms || []
    emit('toast', { type: 'success', message: `已更新為「${nextTerm}」` })
    cancelEdit()
  } catch (error) {
    emit('toast', { type: 'error', message: `更新失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    savingTerm.value = null
  }
}

async function handleDelete(term) {
  deletingTerm.value = term
  try {
    const data = await deleteProperNoun(term)
    terms.value = data.terms || []
    emit('toast', { type: 'success', message: `已刪除「${term}」` })
    if (editingTerm.value === term) cancelEdit()
  } catch (error) {
    emit('toast', { type: 'error', message: `刪除失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    deletingTerm.value = null
  }
}

async function handleDeleteAll() {
  if (terms.value.length === 0 || deletingAll.value) return

  const confirmed = window.confirm(`確定要刪除全部 ${terms.value.length} 個專有名詞嗎？此操作無法復原。`)
  if (!confirmed) return

  deletingAll.value = true
  try {
    const data = await deleteAllProperNouns()
    terms.value = data.terms || []
    searchQuery.value = ''
    cancelAdd()
    cancelEdit()
    emit('toast', { type: 'success', message: '已刪除全部專有名詞' })
  } catch (error) {
    emit('toast', { type: 'error', message: `刪除全部失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    deletingAll.value = false
  }
}

function openImportPicker() {
  if (importing.value) return
  fileInput.value?.click()
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  if (!file) return

  importing.value = true
  try {
    const result = await importProperNounsFromFile(file)
    store.startConversation({
      sessionId: result.sessionId || null,
      context: result.conversationContext || null,
      initialMessages: [],
      draft: result.prompt || '',
    })
    emit('toast', { type: 'success', message: '檔案已上傳，已切換到 OpenClaw 對話並填入 prompt' })
  } catch (error) {
    emit('toast', { type: 'error', message: `檔案上傳失敗：${error.response?.data?.message || error.message}` })
  } finally {
    importing.value = false
    if (event.target) event.target.value = ''
  }
}

onMounted(fetchTerms)
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden lg:px-8 lg:py-8">
    <Transition name="import-overlay">
      <div
        v-if="importing"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 backdrop-blur-md"
        role="status"
        aria-live="polite"
        aria-label="Importing glossary file"
      >
        <div class="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900/95 p-7 text-center shadow-2xl shadow-black/40">
          <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
            <svg class="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <p class="text-lg font-semibold text-white">正在匯入詞彙檔案</p>
          <p class="mt-2 text-sm leading-6 text-white/60">
            系統正在上傳並準備 OpenClaw 處理內容，API 回應後會自動關閉此畫面。
          </p>
        </div>
      </div>
    </Transition>

    <div class="shrink-0 px-4 pb-3 pt-14 sm:px-6 lg:px-0 lg:max-w-5xl lg:pb-6 lg:pt-4">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-white">詞彙管理</h1>
          <p class="mt-0.5 text-sm text-white/50">{{ terms.length }} 個專有名詞</p>
        </div>
        <div class="flex items-center gap-2">
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            accept=".doc,.docx,.xls,.xlsx,.pdf,.csv,.txt,.tsv"
            @change="handleImport"
          >
          <button
            type="button"
            class="btn-primary btn-secondary px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
            :disabled="importing"
            @click="openImportPicker"
          >
            <span>{{ importing ? '...' : '↑' }}</span>
            {{ importing ? '上傳中…' : '檔案匯入' }}
          </button>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            :disabled="loading"
            @click="fetchTerms"
          >
            <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            type="button"
            class="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="deletingAll || terms.length === 0"
            @click="handleDeleteAll"
          >
            {{ deletingAll ? '刪除中...' : '全部刪除' }}
          </button>
          <button
            type="button"
            class="btn-primary px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
            @click="openAdd"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            新增
          </button>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-white/60">
        上傳 `Word`、`Excel`、`PDF` 或文字檔後，系統會先透過 FTP 傳到伺服器，並自動切到 OpenClaw 對話頁，把 `meeting-proper-noun-extractor` 的 prompt 填進草稿，等你確認後自行送出。
      </div>

      <div class="relative mt-4">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜尋詞彙…"
          class="w-full rounded-xl border border-white/20 bg-white/10 py-2 pl-9 pr-8 text-sm text-white placeholder-white/30 focus:border-blue-400/60 focus:outline-none transition-colors"
        >
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
          @click="searchQuery = ''"
        >
          ×
        </button>
      </div>

      <Transition name="expand">
        <div v-if="showAddForm" class="glass-card mt-3 rounded-2xl p-4">
          <p class="mb-3 text-sm font-semibold text-white">新增專有名詞</p>
          <input
            v-model="newTerm"
            type="text"
            placeholder="例如：OpenClaw"
            class="mb-3 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-blue-400/60 focus:outline-none transition-colors"
            @keydown.enter="handleAdd"
            @keydown.escape="cancelAdd"
          >
          <div class="flex gap-2">
            <button
              type="button"
              class="btn-primary flex-1 rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              :disabled="addingTerm"
              @click="handleAdd"
            >
              {{ addingTerm ? '儲存中…' : '儲存' }}
            </button>
            <button type="button" class="btn-secondary flex-1 rounded-xl py-2 text-sm font-medium" @click="cancelAdd">取消</button>
          </div>
        </div>
      </Transition>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-0 lg:max-w-6xl">
      <div v-if="loading && terms.length === 0" class="flex justify-center py-10">
        <svg class="w-6 h-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>

      <div v-else-if="terms.length === 0" class="flex h-40 flex-col items-center justify-center gap-2 text-sm text-white/30">
        <span class="text-3xl">詞</span>
        尚未建立專有名詞，或先透過檔案匯入
      </div>

      <div v-else-if="filteredTerms.length === 0" class="flex h-40 flex-col items-center justify-center gap-2 text-sm text-white/30">
        <span class="text-3xl">搜</span>
        找不到符合的詞彙
      </div>

      <ul v-else class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        <li
          v-for="term in filteredTerms"
          :key="term"
          class="glass-card rounded-2xl overflow-hidden"
        >
          <div v-if="editingTerm !== term" class="flex items-center gap-3 px-4 py-3">
            <p class="flex-1 truncate text-sm font-medium text-white">{{ term }}</p>
            <div class="flex shrink-0 gap-1">
              <button
                type="button"
                class="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-blue-300 transition-colors"
                title="編輯"
                @click="startEdit(term)"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
                </svg>
              </button>
              <button
                type="button"
                class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400/60 hover:bg-red-400/10 hover:text-red-400 transition-colors disabled:opacity-40"
                :disabled="deletingTerm === term"
                title="刪除"
                @click="handleDelete(term)"
              >
                <svg v-if="deletingTerm === term" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <div v-else class="px-4 py-3">
            <input
              v-model="editValue"
              type="text"
              class="mb-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-blue-400/60 focus:outline-none transition-colors"
              @keydown.enter="handleSave(term)"
              @keydown.escape="cancelEdit"
            >
            <div class="flex gap-2">
              <button
                type="button"
                class="btn-primary flex-1 rounded-xl py-1.5 text-sm font-medium disabled:opacity-50"
                :disabled="savingTerm === term"
                @click="handleSave(term)"
              >
                {{ savingTerm === term ? '儲存中…' : '儲存' }}
              </button>
              <button type="button" class="btn-secondary flex-1 rounded-xl py-1.5 text-sm font-medium" @click="cancelEdit">取消</button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 200px;
}

.import-overlay-enter-active,
.import-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.import-overlay-enter-from,
.import-overlay-leave-to {
  opacity: 0;
}
</style>
