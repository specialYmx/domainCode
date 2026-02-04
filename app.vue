<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";

const data = ref<any>({ success: true, codes: [] });
const loading = ref(false);
const fetchError = ref<any>(null);

const codes = computed(() => data.value?.codes || []);
const lastUpdated = ref("");
const isRefreshing = ref(false);
const refreshCooldown = ref(0);
const cooldownTimer = ref<NodeJS.Timeout | null>(null);
const sseConnected = ref(false);
const authLoading = ref(true);
const isAuthenticated = ref(false);
const tenantName = ref("");
const accessKey = ref("");
const loginLoading = ref(false);
const loginError = ref("");
let eventSource: EventSource | null = null;
let pollTimer: NodeJS.Timeout | null = null;

const error = computed(() => {
  if (!isAuthenticated.value || authLoading.value) return null;
  if (loading.value || isRefreshing.value) return null;
  if (fetchError.value) {
    const statusCode = (fetchError.value as any)?.statusCode;
    if (statusCode === 401) return "会话已失效，请重新输入访问码";
    return "网络错误，请稍后再试";
  }
  if (data.value?.success === false) return "获取数据失败";
  return null;
});

const stopRealtime = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  sseConnected.value = false;
};

const startRealtime = () => {
  stopRealtime();
  eventSource = new EventSource("/api/stream");
  eventSource.onopen = () => {
    sseConnected.value = true;
  };
  eventSource.onerror = () => {
    sseConnected.value = false;
  };
  eventSource.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      if (payload?.type === "codes" && payload.data) {
        data.value = {
          success: true,
          codes: payload.data.codes || [],
          cached: true,
        };
        lastUpdated.value = new Date().toLocaleTimeString();
      }
    } catch {
      // ignore malformed payloads
    }
  };

  pollTimer = setInterval(() => {
    fetchCodes(false);
  }, 10000);
};

const fetchCodes = async (force = true) => {
  if (!isAuthenticated.value) return;
  if (isRefreshing.value) return;
  if (force && refreshCooldown.value > 0) return;

  isRefreshing.value = true;
  loading.value = true;
  fetchError.value = null;
  try {
    const query = force ? `?force=true&t=${Date.now()}` : `?t=${Date.now()}`;
    data.value = await $fetch<any>(`/api/codes${query}`, {
      timeout: 12000,
    });
    lastUpdated.value = new Date().toLocaleTimeString();

    if (force) {
      refreshCooldown.value = 1;
      if (cooldownTimer.value) clearInterval(cooldownTimer.value);
      cooldownTimer.value = setInterval(() => {
        if (refreshCooldown.value > 0) {
          refreshCooldown.value--;
        } else if (cooldownTimer.value) {
          clearInterval(cooldownTimer.value);
        }
      }, 1000);
    }
  } catch (err: any) {
    fetchError.value = err;
  } finally {
    loading.value = false;
    isRefreshing.value = false;
  }
};

const checkSession = async () => {
  authLoading.value = true;
  try {
    const profile = await $fetch<any>("/api/access/me");
    if (profile?.authenticated) {
      isAuthenticated.value = true;
      tenantName.value = profile?.displayName || profile?.tenantId || "";
      startRealtime();
      void fetchCodes(false);
    } else {
      isAuthenticated.value = false;
      tenantName.value = "";
      stopRealtime();
      data.value = { success: true, codes: [] };
      fetchError.value = null;
      loading.value = false;
      isRefreshing.value = false;
    }
  } catch {
    isAuthenticated.value = false;
    tenantName.value = "";
    stopRealtime();
    data.value = { success: true, codes: [] };
    fetchError.value = null;
    loading.value = false;
    isRefreshing.value = false;
  } finally {
    authLoading.value = false;
  }
};

const submitAccessKey = async () => {
  if (!accessKey.value.trim() || loginLoading.value) return;
  loginError.value = "";
  loginLoading.value = true;
  try {
    const res = await $fetch<any>("/api/access/login", {
      method: "POST",
      body: {
        accessKey: accessKey.value.trim(),
      },
    });
    accessKey.value = "";
    isAuthenticated.value = true;
    tenantName.value = res?.displayName || res?.tenantId || "";
    startRealtime();
    void fetchCodes(false);
  } catch (err: any) {
    loginError.value = err?.data?.message || "访问码无效";
    isAuthenticated.value = false;
    tenantName.value = "";
    data.value = { success: true, codes: [] };
    fetchError.value = null;
    loading.value = false;
    isRefreshing.value = false;
    stopRealtime();
  } finally {
    loginLoading.value = false;
  }
};

const logout = async () => {
  try {
    await $fetch("/api/access/logout", {
      method: "POST",
    });
  } catch {
    // ignore logout network errors
  }
  isAuthenticated.value = false;
  tenantName.value = "";
  data.value = { success: true, codes: [] };
  fetchError.value = null;
  loading.value = false;
  isRefreshing.value = false;
  stopRealtime();
};

onMounted(() => {
  lastUpdated.value = new Date().toLocaleTimeString();
  checkSession();
});

onUnmounted(() => {
  stopRealtime();
  if (cooldownTimer.value) clearInterval(cooldownTimer.value);
});

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  alert("已复制到剪贴板");
};
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col items-center bg-[#050505] text-white font-['Outfit',_sans-serif]">
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full"></div>
      <div class="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-cyan-500/5 blur-[120px] rounded-full"></div>
    </div>

    <div class="max-w-4xl w-full h-full flex flex-col p-4 md:p-8 md:pb-4 relative z-10 space-y-6">
      <div class="text-center space-y-1.5 shrink-0">
        <h1 class="text-2xl md:text-3xl font-bold tracking-[0.05em] text-white/90">
          验证码接收终端
        </h1>
        <p class="text-gray-500 text-xs md:text-sm font-medium">
          约 40 秒后再点击刷新
        </p>
      </div>

      <div class="flex flex-wrap gap-4 justify-between items-center bg-white/[0.03] p-3 rounded-2xl border border-white/10 backdrop-blur-xl shrink-0 shadow-lg">
        <div class="flex items-center gap-4">
          <div class="text-[12px] md:text-sm text-gray-500 tabular-nums">
            {{ lastUpdated ? `最近更新: ${lastUpdated}` : "正在同步..." }}
          </div>
          <div v-if="isAuthenticated" class="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-full border border-white/5">
            <span class="relative flex h-1.5 w-1.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" :class="sseConnected ? 'bg-emerald-400' : 'bg-red-400'"></span>
              <span class="relative inline-flex rounded-full h-1.5 w-1.5" :class="sseConnected ? 'bg-emerald-500' : 'bg-red-500'"></span>
            </span>
            <span class="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
              {{ sseConnected ? "实时连接" : "断开" }}
            </span>
          </div>
          <div v-if="isAuthenticated" class="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            {{ tenantName || "已授权" }}
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="() => fetchCodes(true)"
            :disabled="!isAuthenticated || loading || isRefreshing || refreshCooldown > 0"
            class="px-6 py-1.5 text-xs font-bold rounded-xl transition-all border border-white/10 hover:border-white/20"
            :class="(!isAuthenticated || loading || isRefreshing || refreshCooldown > 0) ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-white text-black hover:bg-white/90 active:scale-95'"
          >
            <span v-if="loading || isRefreshing">刷新中</span>
            <span v-else-if="refreshCooldown > 0" class="tabular-nums">{{ refreshCooldown }}s 重试</span>
            <span v-else>立即刷新</span>
          </button>
          <button
            v-if="isAuthenticated"
            @click="logout"
            class="px-4 py-1.5 text-xs font-semibold rounded-xl border border-white/10 text-gray-300 hover:text-white hover:border-white/30"
          >
            退出
          </button>
        </div>
      </div>

      <transition name="fade">
        <div v-if="error" class="p-3 bg-red-500/5 border border-red-500/10 text-red-400/80 rounded-xl text-center text-xs shrink-0">
          {{ error }}
        </div>
      </transition>

      <div class="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
        <div class="space-y-2 pb-8">
          <div v-if="authLoading" class="py-12 text-center glass-card rounded-xl text-gray-500 text-sm">
            正在检查访问状态...
          </div>

          <div v-else-if="!isAuthenticated" class="glass-card rounded-xl border border-white/10 p-6 md:p-8 max-w-md mx-auto mt-8">
            <h2 class="text-lg font-semibold text-white mb-2">输入访问码</h2>
            <p class="text-xs text-gray-500 mb-4">输入你收到的访问码后，即可查看对应邮箱的验证码。</p>
            <input
              v-model="accessKey"
              type="password"
              placeholder="请输入访问码"
              class="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-emerald-500/40"
              @keyup.enter="submitAccessKey"
            />
            <p v-if="loginError" class="text-xs text-red-400 mt-2">{{ loginError }}</p>
            <button
              @click="submitAccessKey"
              :disabled="loginLoading || !accessKey.trim()"
              class="mt-4 w-full py-2 rounded-lg text-sm font-semibold transition-all"
              :class="loginLoading || !accessKey.trim() ? 'bg-white/10 text-gray-500 cursor-not-allowed' : 'bg-emerald-500 text-black hover:bg-emerald-400'"
            >
              {{ loginLoading ? "校验中..." : "进入面板" }}
            </button>
          </div>

          <template v-else>
            <div v-if="loading && codes.length === 0" class="flex flex-col gap-2">
              <div v-for="i in 5" :key="i" class="glass-card p-4 rounded-xl flex items-center gap-4 animate-pulse">
                <div class="h-6 w-24 bg-white/5 rounded"></div>
                <div class="flex-1 h-3 bg-white/5 rounded"></div>
              </div>
            </div>

            <div v-else-if="codes.length === 0" class="py-12 text-center glass-card rounded-xl text-gray-600 text-sm">
              暂无匹配的验证码邮件
            </div>

            <div v-else class="flex flex-col gap-2">
              <div
                v-for="(item, idx) in codes"
                :key="idx"
                class="glass-card group relative p-3 md:px-5 md:py-2.5 rounded-xl flex flex-col md:flex-row md:items-center gap-3 transition-all duration-200 hover:bg-white/[0.04]"
                :class="idx === 0 ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.02] border-white/5'"
              >
                <div v-if="idx === 0" class="absolute -left-1 -top-1 z-20">
                  <span class="text-[9px] font-bold text-[#050505] bg-emerald-400 px-1.5 py-0.5 rounded shadow-lg shadow-emerald-500/20">最新</span>
                </div>

                <div class="flex items-center justify-between md:justify-start gap-4 md:w-[150px] shrink-0">
                  <div class="text-2xl md:text-3xl font-mono font-black text-white tracking-[0.1em] leading-none">
                    {{ item.code }}
                  </div>
                  <button
                    @click="copyToClipboard(item.code)"
                    class="md:hidden p-2 bg-white/5 rounded-lg text-emerald-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  </button>
                </div>

                <div class="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1 md:gap-4 md:border-l md:border-white/10 md:pl-4">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs md:text-sm font-semibold text-gray-300 truncate">
                      {{ item.subject }}
                    </div>
                    <div class="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                      <span class="truncate">收件: {{ item.recipient }}</span>
                      <span class="opacity-20">|</span>
                      <span class="truncate italic font-light">来自 {{ item.sender }}</span>
                    </div>
                  </div>

                  <div class="flex items-center justify-between md:flex-col md:items-end shrink-0 gap-1.5 md:min-w-[120px]">
                    <div class="text-[10px] text-gray-600 font-mono tabular-nums">
                      {{ new Date(item.date).toLocaleString([], {month:'numeric', day:'numeric', hour: '2-digit', minute:'2-digit', second: '2-digit'}) }}
                    </div>
                    <button
                      @click="copyToClipboard(item.code)"
                      class="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 text-gray-500 rounded transition-all duration-200 text-[10px] font-bold border border-white/5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      复制
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <footer class="text-center text-[10px] text-gray-700 space-y-1 pb-4 shrink-0 border-t border-white/5 pt-4">
        <p>数据实时同步，请确保您的主邮箱 IMAP 服务已开启</p>
      </footer>
    </div>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=JetBrains+Mono:wght@800&display=swap');

.font-mono {
  font-family: 'JetBrains+Mono', monospace !important;
}

body {
  margin: 0;
  background-color: #050505;
}

.glass-card {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(16, 185, 129, 0.1);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.h-screen::after {
  content: "";
  position: fixed;
  inset: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.05) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.01), rgba(0, 255, 0, 0.005), rgba(0, 0, 255, 0.01));
  z-index: 100;
  background-size: 100% 2px, 2px 100%;
  pointer-events: none;
  opacity: 0.1;
}
</style>
