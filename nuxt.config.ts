// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@element-plus/nuxt', '@pinia/nuxt'],
  
  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'format-detection', content: 'telephone=no' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }
      ]
    }
  },
  
  runtimeConfig: {
    // 服务端环境变量
    binanceApiKey: process.env.BINANCE_API_KEY,
    binanceSecret: process.env.BINANCE_SECRET,
    public: {
      // 客户端可访问的环境变量
    }
  },

  nitro: {
    experimental: {
      tasks: true
    }
  },

  vite: {
    optimizeDeps: {
      include: ['echarts', 'vue-echarts']
    }
  }
})
