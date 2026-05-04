<script setup>
import { computed, ref } from 'vue'
import { importProperNounsFromFile } from '../api/index.js'
import { selectTermsForTranscription, startUploadedTranscriptionConversation } from '../services/transcriptionTerms.js'
import { useMeetingStore } from '../stores/meeting.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const terms = ref([...store.selectedTerms])
const searchQuery = ref('')
const showAddForm = ref(false)
const newTerm = ref('')
const editingTerm = ref(null)
const editValue = ref('')
const importing = ref(false)
const continuing = ref(false)
const fileInput = ref(null)

const filteredTerms = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return terms.value
  return terms.value.filter(term => term.toLowerCase().includes(query))
})

function syncTerms(nextTerms) {
  terms.value = [...new Set(
    (nextTerms || [])
      .map(term => String(term || '').trim())
      .filter(Boolean),
  )]
  store.setSelectedTerms(terms.value)
}

function openAdd() {
  cancelEdit()
  showAddForm.value = true
  newTerm.value = ''
}

function cancelAdd() {
  showAddForm.value = false
  newTerm.value = ''
}

function handleAdd() {
  const term = newTerm.value.trim()
  if (!term) {
    emit('toast', { type: 'error', message: '請先輸入詞彙' })
    return
  }

  syncTerms([...terms.value, term])
  emit('toast', { type: 'success', message: `已加入「${term}」` })
  cancelAdd()
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

function handleSave(originalTerm) {
  const nextTerm = editValue.value.trim()
  if (!nextTerm) {
    emit('toast', { type: 'error', message: '詞彙不可為空白' })
    return
  }

  syncTerms(terms.value.map(term => term === originalTerm ? nextTerm : term))
  emit('toast', { type: 'success', message: `已更新為「${nextTerm}」` })
  cancelEdit()
}

function handleDelete(term) {
  syncTerms(terms.value.filter(item => item !== term))
  if (editingTerm.value === term) cancelEdit()
}

function openImportPicker() {
  if (importing.value) return
  fileInput.value?.click()
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!store.uploadResult) {
    emit('toast', { type: 'error', message: '請先上傳錄音檔，再匯入本次轉錄詞彙' })
    if (event.target) event.target.value = ''
    return
  }

  importing.value = true
  try {
    const result = await importProperNounsFromFile(file)
    store.startConversation({
      sessionId: result.sessionId || null,
      context: {
        ...(result.conversationContext || {}),
        returnToTranscription: true,
        transcriptionUploadResult: store.uploadResult,
      },
      initialMessages: [],
      draft: result.prompt || '',
    })
    emit('toast', { type: 'success', message: '檔案已上傳，請在 OpenClaw 送出草稿並等待詞彙輸出' })
  } catch (error) {
    emit('toast', { type: 'error', message: `檔案上傳失敗：${error.response?.data?.message || error.message}` })
  } finally {
    importing.value = false
    if (event.target) event.target.value = ''
  }
}

async function continueToOpenClaw() {
  if (continuing.value) return
  if (!store.uploadResult) {
    emit('toast', { type: 'error', message: '請先上傳錄音檔，再開始轉錄流程' })
    return
  }
  continuing.value = true
  try {
    const { selectedTerms, maxTerms } = await selectTermsForTranscription(terms.value)
    startUploadedTranscriptionConversation(store, selectedTerms)
    const skippedCount = Math.max(0, terms.value.length - selectedTerms.length)
    emit('toast', {
      type: 'success',
      message: skippedCount > 0
        ? `已依上限 ${maxTerms} 筆選用前 ${selectedTerms.length} 個詞彙`
        : `已帶入 ${selectedTerms.length} 個專有名詞`,
    })
  } catch (error) {
    emit('toast', { type: 'error', message: `無法取得 terms 上限：${error.response?.data?.detail || error.message}` })
  } finally {
    continuing.value = false
  }
}

function goBack() {
  store.currentView = 'terms-choice'
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden lg:px-8 lg:py-8">
    <div class="shrink-0 px-4 pb-3 pt-14 sm:px-6 lg:px-0 lg:max-w-5xl lg:pb-6 lg:pt-4">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-cyan-300">本次轉錄專用</p>
          <h1 class="mt-1 text-2xl font-bold text-white">專有名詞詞彙</h1>
          <p class="mt-0.5 text-sm text-white/50">{{ terms.length }} 個詞彙，送出前會依 API 上限自動取前面的項目</p>
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
            class="btn-primary btn-secondary rounded-xl px-4 py-2 text-sm font-medium"
            :disabled="importing"
            @click="openImportPicker"
          >
            {{ importing ? '上傳中...' : '檔案匯入' }}
          </button>
          <button
            type="button"
            class="btn-primary rounded-xl px-4 py-2 text-sm font-medium"
            @click="openAdd"
          >
            新增
          </button>
        </div>
      </div>

      <div class="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-white/60">
        可手動新增詞彙，或上傳 Word、Excel、PDF、CSV、TXT 讓 OpenClaw 擷取。詞彙只會套用到這一次 transcribe job。
      </div>

      <div class="relative mt-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜尋詞彙..."
          class="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 pr-8 text-sm text-white placeholder-white/30 transition-colors focus:border-blue-400/60 focus:outline-none"
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
        <div v-if="showAddForm" class="glass-card mt-3 rounded-lg p-4">
          <p class="mb-3 text-sm font-semibold text-white">新增專有名詞</p>
          <input
            v-model="newTerm"
            type="text"
            placeholder="例如：OpenClaw"
            class="mb-3 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 transition-colors focus:border-blue-400/60 focus:outline-none"
            @keydown.enter="handleAdd"
            @keydown.escape="cancelAdd"
          >
          <div class="flex gap-2">
            <button type="button" class="btn-primary flex-1 rounded-xl py-2 text-sm font-medium" @click="handleAdd">儲存</button>
            <button type="button" class="btn-secondary flex-1 rounded-xl py-2 text-sm font-medium" @click="cancelAdd">取消</button>
          </div>
        </div>
      </Transition>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-28 sm:px-6 lg:px-0 lg:max-w-6xl">
      <div v-if="terms.length === 0" class="flex h-40 flex-col items-center justify-center gap-2 text-sm text-white/30">
        <span class="text-3xl">詞</span>
        尚未加入詞彙，可直接繼續或先新增
      </div>

      <div v-else-if="filteredTerms.length === 0" class="flex h-40 flex-col items-center justify-center gap-2 text-sm text-white/30">
        找不到符合的詞彙
      </div>

      <ul v-else class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        <li
          v-for="term in filteredTerms"
          :key="term"
          class="glass-card overflow-hidden rounded-lg"
        >
          <div v-if="editingTerm !== term" class="flex items-center gap-3 px-4 py-3">
            <p class="flex-1 truncate text-sm font-medium text-white">{{ term }}</p>
            <div class="flex shrink-0 gap-1">
              <button type="button" class="h-7 rounded-lg px-2 text-xs text-white/50 hover:bg-white/10 hover:text-blue-300" @click="startEdit(term)">編輯</button>
              <button type="button" class="h-7 rounded-lg px-2 text-xs text-red-300/70 hover:bg-red-400/10 hover:text-red-300" @click="handleDelete(term)">刪除</button>
            </div>
          </div>

          <div v-else class="px-4 py-3">
            <input
              v-model="editValue"
              type="text"
              class="mb-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white transition-colors focus:border-blue-400/60 focus:outline-none"
              @keydown.enter="handleSave(term)"
              @keydown.escape="cancelEdit"
            >
            <div class="flex gap-2">
              <button type="button" class="btn-primary flex-1 rounded-xl py-1.5 text-sm font-medium" @click="handleSave(term)">儲存</button>
              <button type="button" class="btn-secondary flex-1 rounded-xl py-1.5 text-sm font-medium" @click="cancelEdit">取消</button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="shrink-0 border-t border-white/10 bg-slate-950/70 px-4 py-4 sm:px-6 lg:px-0">
      <div class="flex max-w-5xl flex-col gap-3 sm:flex-row">
        <button type="button" class="btn-secondary rounded-xl px-4 py-3 text-sm font-medium" @click="goBack">返回</button>
        <button
          type="button"
          class="btn-primary rounded-xl px-4 py-3 text-sm font-medium sm:flex-1"
          :disabled="continuing"
          @click="continueToOpenClaw"
        >
          {{ continuing ? '準備中...' : '確認詞彙並前往 OpenClaw' }}
        </button>
      </div>
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
</style>
