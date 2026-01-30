<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

// 强制刷新标记
const forceParam = ref('');

// 使用 lazy + server:false 让页面快速渲染，避免 SSR hydration mismatch
const { data, pending: loading, error: fetchError, refresh } = useFetch<any>(
  () => `/api/codes${forceParam.value}`,
  {
    lazy: true,
    server: false, // 仅在客户端获取数据，避免 hydration mismatch
    watch: false, // 关闭自动监听，由我们手动控制
  }
);

const codes = computed(() => data.value?.codes || []);
const lastUpdated = ref('');
const isRefreshing = ref(false);
const isCached = computed(() => data.value?.cached === true);

// 错误处理优化
const error = computed(() => fetchError.value ? '网络错误，请稍后再试' : (data.value?.success === false ? '获取数据失败' : null));

// 手动刷新 - 强制获取最新数据
const fetchCodes = async (force = true) => {
  isRefreshing.value = true;
  try {
    // 强制刷新时添加参数绕过缓存
    forceParam.value = force ? `?force=true&t=${Date.now()}` : `?t=${Date.now()}`;
    await refresh();
    lastUpdated.value = new Date().toLocaleTimeString();
  } finally {
    isRefreshing.value = false;
  }
};

// 客户端初始化和定时刷新
onMounted(() => {
  lastUpdated.value = new Date().toLocaleTimeString();
  // 定时刷新使用缓存（不强制），节省资源
  const interval = setInterval(() => fetchCodes(false), 30000);
  onUnmounted(() => clearInterval(interval));
});

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  alert('已复制到剪贴板');
};
</script>

<template>
  <div class="min-h-screen p-4 md:p-12 flex flex-col items-center bg-[radial-gradient(circle_at_50%_50%,#1a1a1a_0%,#0a0a0a_100%)] text-white font-sans">
    <div class="max-w-3xl w-full space-y-6">
      <!-- Header -->
      <div class="text-center space-y-3">
        <h1 class="text-3xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          验证码接收终端
        </h1>
        <p class="text-gray-400 text-base">
          实时从您的主邮箱同步验证邮件
        </p>
      </div>

      <!-- Controls -->
      <div class="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/10 backdrop-blur-md">
        <div class="text-sm text-gray-400">
          {{ lastUpdated ? `最近更新: ${lastUpdated}` : '正在同步...' }}
        </div>
        <button
          @click="() => fetchCodes(true)"
          :disabled="loading || isRefreshing"
          class="px-5 py-2 text-sm rounded-xl transition-all glow-btn"
          :class="(loading || isRefreshing) ? 'bg-gray-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]'"
        >
          {{ (loading || isRefreshing) ? '刷新中...' : '立即刷新' }}
        </button>
      </div>

      <div v-if="error" class="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-center text-sm">
        {{ error }}
      </div>

      <!-- Loading Skeleton -->
      <div v-if="loading && codes.length === 0" class="flex flex-col gap-4">
        <div v-for="i in 3" :key="i" class="glass-card p-5 rounded-2xl space-y-3 animate-pulse">
          <div class="flex justify-between items-center">
            <div class="h-4 w-16 bg-white/10 rounded"></div>
            <div class="h-4 w-32 bg-white/10 rounded"></div>
          </div>
          <div class="flex items-center justify-between">
            <div class="h-10 w-40 bg-white/10 rounded"></div>
            <div class="h-8 w-8 bg-white/10 rounded"></div>
          </div>
          <div class="border-t border-white/5 pt-3">
            <div class="h-4 w-48 bg-white/10 rounded mb-2"></div>
            <div class="h-3 w-32 bg-white/10 rounded"></div>
          </div>
        </div>
      </div>

      <!-- Code List (Single Column) -->
      <div v-else class="flex flex-col gap-2 md:gap-3">
        <template v-if="codes.length > 0">
          <div 
            v-for="(item, idx) in codes" 
            :key="idx" 
            class="glass-card p-3 md:p-4 rounded-xl space-y-2 transition-all hover:bg-white/5"
            :class="{ 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]': idx === 0 }"
          >
            <!-- Compact Meta Row -->
            <div class="flex justify-between items-center gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <span v-if="idx === 0" class="text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-sm">LATEST</span>
                <div class="flex items-center gap-2 text-[10px] text-gray-500 min-w-0">
                  <span class="truncate text-gray-400">收件: {{ item.recipient }}</span>
                  <span class="hidden sm:inline opacity-20 text-[8px]">|</span>
                  <span class="truncate italic hidden sm:inline">自: {{ item.sender }}</span>
                </div>
              </div>
              <span class="text-[10px] text-gray-600 font-mono whitespace-nowrap">
                {{ new Date(item.date).toLocaleString() }}
              </span>
            </div>
            
            <!-- Main Content Row -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4 min-w-0">
                <div class="text-3xl font-mono font-bold text-white tracking-[0.1em]">
                  {{ item.code }}
                </div>
                <div class="text-xs text-gray-500 truncate mt-1 hidden md:block">
                  {{ item.subject }}
                </div>
              </div>
              
              <button 
                @click="copyToClipboard(item.code)"
                class="p-2 hover:bg-white/10 rounded-lg transition-colors text-emerald-400 group relative"
                title="复制验证码"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
            </div>
          </div>
        </template>
        <template v-else-if="!loading">
          <div class="py-12 text-center text-gray-500 glass-card rounded-2xl text-sm">
            暂无匹配的验证码邮件
          </div>
        </template>
      </div>

      <!-- Footer info -->
      <div class="mt-12 text-center text-xs text-gray-600 space-y-2">
        <p>数据实时同步，请确保您的主邮箱 IMAP 服务已开启</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}

@keyframes pulse-glow {
  0% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.2); }
  50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
  100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.2); }
}

.active-code {
  animation: pulse-glow 2s infinite;
}
</style>
