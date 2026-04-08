<script setup>
import { ref, computed, onMounted } from 'vue'
import { listProperNouns, addProperNoun, updateProperNoun, deleteProperNoun } from '../api/index.js'

const emit = defineEmits(['toast'])

// State
const terms = ref([])          // string[]
const loading = ref(false)
const searchQuery = ref('')
const showAddForm = ref(false)
const addingTerm = ref(false)
const newTerm = ref('')

// Edit state
const editingTerm = ref(null)  // original term string being edited
const editValue = ref('')
const savingTerm = ref(null)
const deletingTerm = ref(null)

// --- Fetch ---
async function fetchTerms() {
  loading.value = true
  try {
    const data = await listProperNouns()
    terms.value = data.terms || []
  } catch (e) {
    emit('toast', { type: 'error', message: '無法載入專有名詞：' + (e.response?.data?.detail || e.message) })
  } finally {
    loading.value = false
  }
}

// --- Filtered list ---
const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return terms.value
  return terms.value.filter(t => t.toLowerCase().includes(q))
})

// --- Add ---
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
    emit('toast', { type: 'error', message: '請輸入專有名詞' })
    return
  }
  addingTerm.value = true
  try {
    const data = await addProperNoun(term)
    terms.value = data.terms || []
    emit('toast', { type: 'success', message: `已新增「${term}」` })
    cancelAdd()
  } catch (e) {
    const msg = e.response?.data?.detail || e.message
    emit('toast', { type: 'error', message: '新增失敗：' + msg })
  } finally {
    addingTerm.value = false
  }
}

// --- Edit ---
function startEdit(term) {
  cancelAdd()
  editingTerm.value = term
  editValue.value = term
}

function cancelEdit() {
  editingTerm.value = null
  editValue.value = ''
}

async function handleSave(original) {
  const newVal = editValue.value.trim()
  if (!newVal) {
    emit('toast', { type: 'error', message: '名詞不能為空' })
    return
  }
  if (newVal === original) { cancelEdit(); return }
  savingTerm.value = original
  try {
    const data = await updateProperNoun(original, newVal)
    terms.value = data.terms || []
    emit('toast', { type: 'success', message: `已更新為「${newVal}」` })
    cancelEdit()
  } catch (e) {
    const msg = e.response?.data?.detail || e.message
    emit('toast', { type: 'error', message: '更新失敗：' + msg })
  } finally {
    savingTerm.value = null
  }
}

// --- Delete ---
async function handleDelete(term) {
  deletingTerm.value = term
  try {
    const data = await deleteProperNoun(term)
    terms.value = data.terms || []
    emit('toast', { type: 'success', message: `已刪除「${term}」` })
    if (editingTerm.value === term) cancelEdit()
  } catch (e) {
    const msg = e.response?.data?.detail || e.message
    emit('toast', { type: 'error', message: '刪除失敗：' + msg })
  } finally {
    deletingTerm.value = null
  }
}

onMounted(fetchTerms)
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden lg:px-8 lg:py-8">

    <!-- Fixed top area -->
    <div class="shrink-0 px-4 pt-14 pb-3 sm:px-6 lg:px-0 lg:pt-4 lg:pb-6 lg:max-w-5xl">
      <!-- Header row -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-2xl font-bold text-white">專有名詞</h1>
          <p class="text-sm text-white/50 mt-0.5">{{ terms.length }} 個詞彙</p>
        </div>
        <div class="flex items-center gap-2">
          <button @click="fetchTerms" :disabled="loading" class="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors">
            <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
          <button
            @click="openAdd"
            class="btn-primary px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            新增
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜尋詞彙…"
          class="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-8 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/60 transition-colors"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">✕</button>
      </div>

      <!-- Add form -->
      <Transition name="expand">
        <div v-if="showAddForm" class="glass-card rounded-2xl p-4 mt-3">
          <p class="text-sm font-semibold text-white mb-3">新增專有名詞</p>
          <input
            v-model="newTerm"
            type="text"
            placeholder="例如：WhisperX"
            @keydown.enter="handleAdd"
            @keydown.escape="cancelAdd"
            class="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/60 transition-colors mb-3"
          />
          <div class="flex gap-2">
            <button
              @click="handleAdd"
              :disabled="addingTerm"
              class="btn-primary flex-1 rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <svg v-if="addingTerm" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              {{ addingTerm ? '新增中…' : '儲存' }}
            </button>
            <button @click="cancelAdd" class="btn-secondary flex-1 rounded-xl py-2 text-sm font-medium">取消</button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Scrollable list -->
    <div class="flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-0 lg:max-w-6xl">

      <!-- Loading -->
      <div v-if="loading && terms.length === 0" class="flex justify-center py-10">
        <svg class="w-6 h-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>

      <!-- Empty state -->
      <div v-else-if="terms.length === 0" class="flex flex-col items-center justify-center h-40 text-white/30 text-sm gap-2">
        <span class="text-3xl">📖</span>
        尚無專有名詞，點擊右上角新增
      </div>
      <div v-else-if="filtered.length === 0" class="flex flex-col items-center justify-center h-40 text-white/30 text-sm gap-2">
        <span class="text-3xl">🔍</span>
        找不到符合的詞彙
      </div>

      <ul v-else class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        <li
          v-for="term in filtered"
          :key="term"
          class="glass-card rounded-2xl overflow-hidden"
        >
          <!-- View mode -->
          <div v-if="editingTerm !== term" class="flex items-center gap-3 px-4 py-3">
            <p class="flex-1 text-white text-sm font-medium truncate">{{ term }}</p>
            <div class="flex gap-1 shrink-0">
              <button
                @click="startEdit(term)"
                class="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-blue-300 hover:bg-white/10 transition-colors"
                title="編輯"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z"/>
                </svg>
              </button>
              <button
                @click="handleDelete(term)"
                :disabled="deletingTerm === term"
                class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                title="刪除"
              >
                <svg v-if="deletingTerm === term" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Edit mode -->
          <div v-else class="px-4 py-3">
            <input
              v-model="editValue"
              type="text"
              @keydown.enter="handleSave(term)"
              @keydown.escape="cancelEdit"
              class="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400/60 transition-colors mb-2"
            />
            <div class="flex gap-2">
              <button
                @click="handleSave(term)"
                :disabled="savingTerm === term"
                class="btn-primary flex-1 rounded-xl py-1.5 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <svg v-if="savingTerm === term" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                {{ savingTerm === term ? '儲存中…' : '儲存' }}
              </button>
              <button @click="cancelEdit" class="btn-secondary flex-1 rounded-xl py-1.5 text-sm font-medium">取消</button>
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
