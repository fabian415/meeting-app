<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  addProperNoun,
  deleteProperNoun,
  importProperNounsFromFile,
  listProperNouns,
  updateProperNoun,
} from '../api/index.js'

const emit = defineEmits(['toast'])

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

function openImportPicker() {
  fileInput.value?.click()
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  if (!file) return

  importing.value = true
  try {
    const result = await importProperNounsFromFile(file)
    terms.value = result.terms || []
    emit('toast', {
      type: 'success',
      message: `匯入完成，新增 ${result.addedCount || 0} 筆、更新 ${result.updatedCount || 0} 筆`,
    })
  } catch (error) {
    emit('toast', { type: 'error', message: `檔案匯入失敗：${error.response?.data?.message || error.message}` })
  } finally {
    importing.value = false
    if (event.target) event.target.value = ''
  }
}

onMounted(fetchTerms)
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden lg:px-8 lg:py-8">
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
            {{ importing ? '匯入中…' : '檔案匯入' }}
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
        支援上傳 `Word`、`Excel`、`PDF`、`CSV`、`TXT`。
        系統會先透過 FTP 上傳檔案，交給 `meeting-proper-noun-extractor` skill 產生 `term,count,contexts` 檔，再自動擷取 `term` 欄位匯入資料庫。
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
</style>
