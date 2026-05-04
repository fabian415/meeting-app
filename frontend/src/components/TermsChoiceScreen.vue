<script setup>
import { ref } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'
import { startUploadedTranscriptionConversation } from '../services/transcriptionTerms.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()
const starting = ref(false)

function goToTermsImport() {
  store.currentView = 'glossary-import'
}

function skipTerms() {
  if (starting.value) return
  starting.value = true
  store.setSelectedTerms([])
  startUploadedTranscriptionConversation(store, [])
  emit('toast', { type: 'success', message: '已略過專有名詞，前往 OpenClaw 對話' })
}
</script>

<template>
  <div class="flex h-full flex-col lg:px-8 lg:py-8">
    <div class="flex flex-1 items-center justify-center px-6 py-10">
      <div class="w-full max-w-3xl">
        <div class="mb-6 text-center">
          <p class="text-sm font-medium text-emerald-300">音檔已上傳完成</p>
          <h1 class="mt-2 text-2xl font-bold text-white">要加入專有名詞來增強轉錄品質嗎？</h1>
          <p class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            專有名詞會跟著這次 transcribe job 一起送出，不再存進全域詞彙庫。若有產品名、人名、公司名或縮寫，可以先整理詞彙再開始轉錄。
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            class="rounded-lg border border-cyan-300/30 bg-cyan-400/10 p-5 text-left transition-colors hover:bg-cyan-400/15"
            @click="goToTermsImport"
          >
            <span class="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-300/15 text-lg text-cyan-100">詞</span>
            <h2 class="mt-4 text-lg font-semibold text-white">需要，先加入詞彙</h2>
            <p class="mt-2 text-sm leading-6 text-slate-400">
              前往詞彙頁，上傳文件讓 OpenClaw 擷取，或手動補上本次要用的 terms。
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border border-white/10 bg-white/5 p-5 text-left transition-colors hover:bg-white/10 disabled:opacity-60"
            :disabled="starting"
            @click="skipTerms"
          >
            <span class="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg text-slate-200">→</span>
            <h2 class="mt-4 text-lg font-semibold text-white">不需要，直接轉錄</h2>
            <p class="mt-2 text-sm leading-6 text-slate-400">
              直接跳到 OpenClaw 對話，沿用剛剛上傳的錄音檔開始轉錄流程。
            </p>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
