import { defineStore } from 'pinia'
import type { 
  TradingSymbol, 
  TradingStatus, 
  TradeRecord, 
  SystemConfig, 
  SystemStats,
  AmplitudeAnalysis 
} from '../../types/trading'

export const useTradingStore = defineStore('trading', {
  state: () => ({
    // 系统配置
    config: {
      isTestnet: false,
      isAutoTrading: false,
      symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'] as TradingSymbol[],
      investmentAmount: 100,
      amplitudeThreshold: 0.5, // 降低振幅阈值，更容易触发交易
      trendThreshold: 5.0,
      orderTimeout: 60 * 60 * 1000, // 1小时
    } as SystemConfig,

    // 交易状态
    tradingStatus: {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    } as TradingStatus,

    // 交易记录
    tradeRecords: [] as TradeRecord[],

    // 系统统计
    stats: {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      totalProfitRate: 0,
      annualizedReturn: 0,
      currentDate: new Date().toISOString().split('T')[0],
      tradedSymbols: {},
    } as SystemStats,

    // 实时振幅分析
    amplitudeAnalyses: [] as AmplitudeAnalysis[],

    // 当前价格
    currentPrices: {} as Record<TradingSymbol, number>,

    // 账户余额
    balances: {} as Record<string, { free: number; used: number; total: number }>,

    // 调试日志
    debugLogs: [] as string[],
  }),

  getters: {
    // 是否可以进行新交易
    canStartNewTrade(): boolean {
      return this.config.isAutoTrading && this.tradingStatus.state === 'IDLE'
    },

    // 获取今日交易过的交易对
    todayTradedSymbols(): TradingSymbol[] {
      return Object.keys(this.stats.tradedSymbols) as TradingSymbol[]
    },

    // 获取今日交易记录
    todayTrades(): TradeRecord[] {
      const today = new Date().toISOString().split('T')[0]
      return this.tradeRecords.filter((record: TradeRecord) => {
        const recordDate = new Date(record.startTime).toISOString().split('T')[0]
        return recordDate === today
      })
    },

    // 获取最适合交易的交易对
    bestTradingSymbol(): AmplitudeAnalysis | null {
      // 检查今天是否已经完成过交易
      const today = new Date().toISOString().split('T')[0]
      const todayCompletedTrades = this.tradeRecords.filter((record: TradeRecord) => {
        const recordDate = new Date(record.startTime).toISOString().split('T')[0]
        return recordDate === today && record.status === 'completed'
      })
      
      // 如果今天已经完成过交易，返回null（不再交易）
      if (todayCompletedTrades.length > 0) {
        return null
      }
      
      const validAnalyses = this.amplitudeAnalyses.filter((a: AmplitudeAnalysis) => 
        !a.isTrendFiltered && 
        a.amplitude >= this.config.amplitudeThreshold
      )
      
      if (validAnalyses.length === 0) return null
      
      // 返回振幅最大的
      return validAnalyses.reduce((max: AmplitudeAnalysis, current: AmplitudeAnalysis) => 
        current.amplitude > max.amplitude ? current : max
      )
    },
  },

  actions: {
    // 更新配置
    updateConfig(config: Partial<SystemConfig>) {
      this.config = { ...this.config, ...config }
    },

    // 更新交易状态
    updateTradingStatus(status: Partial<TradingStatus>) {
      this.tradingStatus = { 
        ...this.tradingStatus, 
        ...status,
        lastUpdateTime: Date.now() 
      }
    },

    // 添加交易记录
    addTradeRecord(record: TradeRecord) {
      this.tradeRecords.push(record)
      this.stats.totalTrades++
      
      // 更新今日交易计数
      if (!this.stats.tradedSymbols[record.symbol]) {
        this.stats.tradedSymbols[record.symbol] = 0
      }
      this.stats.tradedSymbols[record.symbol] = (this.stats.tradedSymbols[record.symbol] ?? 0) + 1
    },

    // 更新交易记录
    updateTradeRecord(id: string, updates: Partial<TradeRecord>) {
      const index = this.tradeRecords.findIndex((r: TradeRecord) => r.id === id)
      if (index !== -1) {
        this.tradeRecords[index] = { ...this.tradeRecords[index], ...updates } as TradeRecord
        
        // 如果交易完成，更新统计
        if (updates.status === 'completed' && updates.profit !== undefined) {
          this.stats.successfulTrades++
          this.stats.totalProfit += updates.profit
          this.calculateStats()
        } else if (updates.status === 'failed') {
          this.stats.failedTrades++
        }
      }
    },

    // 更新振幅分析
    updateAmplitudeAnalyses(analyses: AmplitudeAnalysis[]) {
      this.amplitudeAnalyses = analyses
    },

    // 更新当前价格
    updateCurrentPrice(symbol: TradingSymbol, price: number) {
      this.currentPrices[symbol] = price
    },

    // 更新余额
    updateBalances(balances: Record<string, { free: number; used: number; total: number }>) {
      this.balances = balances
    },

    // 添加调试日志
    addDebugLog(message: string) {
      const timestamp = new Date().toLocaleTimeString()
      this.debugLogs.unshift(`[${timestamp}] ${message}`)
      // 只保留最近100条日志
      if (this.debugLogs.length > 100) {
        this.debugLogs = this.debugLogs.slice(0, 100)
      }
    },

    // 清空调试日志
    clearDebugLogs() {
      this.debugLogs = []
    },

    // 获取账户余额
    async fetchBalances() {
      try {
        const response = await $fetch('/api/trading/balance') as any
        if (response.success) {
          this.updateBalances(response.balances)
          if (response.isSimulated) {
            this.addDebugLog(`使用模拟余额数据: ${response.message || ''}`)
          } else {
            this.addDebugLog('成功获取真实账户余额')
          }
        }
      } catch (error: any) {
        this.addDebugLog(`获取余额失败: ${error.message}`)
        console.error('获取余额失败:', error)
      }
    },

    // 测试API连接
    async testConnection() {
      try {
        const response = await $fetch('/api/trading/test-connection') as any
        if (response.success) {
          this.addDebugLog(`API连接成功 - ${response.testSymbol}: ${response.testPrice}`)
          return { success: true, message: response.message }
        } else {
          this.addDebugLog(`API连接失败: ${response.message}`)
          return { success: false, message: response.message }
        }
      } catch (error: any) {
        this.addDebugLog(`API连接错误: ${error.message}`)
        return { success: false, message: error.message }
      }
    },

    // 手动买入
    async manualBuy(symbol: TradingSymbol, price: number, amount: number) {
      try {
        const response = await $fetch('/api/trading/order/create-buy', {
          method: 'POST',
          body: { symbol, price, investmentAmount: price * amount }
        }) as any
        console.log(response);
        
        if (response.success) {
          this.addDebugLog(`手动买入成功: ${symbol} @ ${price} x ${amount}`)
          return { success: true, order: response.order }
        }
      } catch (error: any) {
        this.addDebugLog(`手动买入失败: ${error.message}`)
        throw error
      }
    },

    // 手动卖出
    async manualSell(symbol: TradingSymbol, price: number, amount: number) {
      try {
        const response = await $fetch('/api/trading/order/create-sell', {
          method: 'POST',
          body: { symbol, price, amount }
        }) as any
        
        if (response.success) {
          this.addDebugLog(`手动卖出成功: ${symbol} @ ${price} x ${amount}`)
          return { success: true, order: response.order }
        }
      } catch (error: any) {
        this.addDebugLog(`手动卖出失败: ${error.message}`)
        throw error
      }
    },

    // 计算统计数据
    calculateStats() {
      const completedTrades = this.tradeRecords.filter((r: TradeRecord) => r.status === 'completed')
      
      if (completedTrades.length > 0) {
        const totalInvested = completedTrades.length * this.config.investmentAmount
        this.stats.totalProfitRate = (this.stats.totalProfit / totalInvested) * 100
        
        // 简单年化收益率计算（假设每天一次交易）
        const firstTrade = completedTrades[0]
        if (firstTrade) {
          const daysActive = Math.max(1, Math.ceil((Date.now() - firstTrade.startTime) / (24 * 60 * 60 * 1000)))
          const dailyReturn = this.stats.totalProfitRate / daysActive
          this.stats.annualizedReturn = dailyReturn * 365
        }
      }
    },

    // 检查并重置每日数据
    checkAndResetDaily() {
      const today = new Date().toISOString().split('T')[0] as string
      if (this.stats.currentDate !== today) {
        this.stats.currentDate = today
        this.stats.tradedSymbols = {}
        
        // 如果有进行中的交易，重置状态
        if (this.tradingStatus.state !== 'IDLE' && this.tradingStatus.state !== 'DONE') {
          this.updateTradingStatus({ state: 'IDLE', symbol: undefined, currentTradeId: undefined })
        }
      }
    },

    // 加载持久化数据
    async loadPersistedData() {
      try {
        const response = await $fetch('/api/trading/load')
        if (response) {
          const data = response as any
          if (data.tradeRecords) this.tradeRecords = data.tradeRecords
          if (data.stats) this.stats = data.stats
          if (data.tradingStatus) this.tradingStatus = data.tradingStatus
          if (data.config) this.config = { ...this.config, ...data.config }
        }
      } catch (error) {
        console.error('加载持久化数据失败:', error)
      }
    },

    // 保存持久化数据
    async savePersistedData() {
      try {
        await $fetch('/api/trading/save', {
          method: 'POST',
          body: {
            tradeRecords: this.tradeRecords,
            stats: this.stats,
            tradingStatus: this.tradingStatus,
            config: this.config,
          }
        })
      } catch (error) {
        console.error('保存持久化数据失败:', error)
      }
    },
  },
})
