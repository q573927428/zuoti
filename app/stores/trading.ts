import { defineStore } from 'pinia'
import type { 
  TradingSymbol, 
  TradingStatus, 
  TradeRecord, 
  SystemConfig, 
  SystemStats,
  AmplitudeAnalysis 
} from '../../types/trading'
import { getCurrentDate, getDateFromTimestamp } from '../utils/date'

export const useTradingStore = defineStore('trading', {
  state: () => ({
    // 系统配置
    config: {
      isTestnet: false,         // 是否使用币安测试网
      isAutoTrading: false,     // 是否开启自动交易主开关
      symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'] as TradingSymbol[],
      investmentAmount: 20,    // 单次交易的投入金额（USDT
      amplitudeThreshold: 3,   // 价格振幅阈值（%）
      trendThreshold: 5.0,       // 趋势强度阈值（%）

      // 订单超时配置
      orderTimeout: {
        default: 120 * 60 * 1000, // 2小时
      },

      // 熔断机制配置
      circuitBreaker: {
        enabled: true,
        consecutiveFailures: 5,             // 连续失败5次触发
        dailyLossLimit: 20,                 // 单日亏损20 USDT
        totalLossLimit: 100,                // 总亏损100 USDT
        cooldownPeriod: 12 * 60 * 60 * 1000, // 12小时
        priceVolatilityThreshold: 10,        // 价格波动10%
      },

      // 日切配置
      dailyReset: {
        processingTime: '23:59',            // 23:00开始日切处理
        warningTime: '23:30',               // 22:30开始预警
        forceLiquidationDiscount: 0.999,    // 强平价格折扣
      },

      // 止损配置
      stopLoss: {
        enabled: true,
        threshold: -2,                       // -2%止损
        executionDiscount: 0.998,            // 执行价格折扣
        waitTime: 5 * 1000,                  // 等待5秒
      },

      // 交易参数配置
      trading: {
        priceDeviationThreshold: 0.5,
        partialFillThreshold: 0.9,
        balanceSafetyBuffer: 0.05,
        marketOrderDiscount: 0.999,
        priceRangeRatio: 0.1 // 买入/卖出价格距离边界10%
      },

      // 交易次数和间隔配置
      dailyTradeLimit: 3,                    // 每日交易次数限制
      tradeInterval: 60 * 60 * 1000,         // 交易间隔时间（1小时）
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
      currentDate: getCurrentDate(),
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

    // 熔断器状态
    circuitBreakerState: {
      isTripped: false,
      consecutiveFailures: 0,
      dailyLoss: 0,
    } as {
      isTripped: boolean
      trippedAt?: number
      reason?: string
      consecutiveFailures: number
      dailyLoss: number
    },
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
      const today = getCurrentDate()
      return this.tradeRecords.filter((record: TradeRecord) => {
        const recordDate = getDateFromTimestamp(record.startTime)
        return recordDate === today
      })
    },

    // 获取最适合交易的交易对
    bestTradingSymbol(): AmplitudeAnalysis | null {
      // 检查今天是否已经完成过交易
      const today = getCurrentDate()
      const todayCompletedTrades = this.tradeRecords.filter((record: TradeRecord) => {
        const recordDate = getDateFromTimestamp(record.startTime)
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
      const today = getCurrentDate()
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
          if (data.config) {
            // 深度合并配置，确保新字段有默认值
            this.config = {
              ...this.config,
              ...data.config,
              trading: {
                ...this.config.trading,
                ...(data.config.trading || {}),
              },
            }
          }
        }
      } catch (error) {
        console.error('加载持久化数据失败:', error)
      }
    },

    // 保存持久化数据
    async savePersistedData() {
      try {
        // 1. 保存数据到文件
        await $fetch('/api/trading/save', {
          method: 'POST',
          body: {
            tradeRecords: this.tradeRecords,
            stats: this.stats,
            tradingStatus: this.tradingStatus,
            config: this.config,
          }
        })
        
        // 2. 更新后端交易机器人实例的配置
        await $fetch('/api/trading/config/update', {
          method: 'POST',
          body: this.config
        })
        
        this.addDebugLog('配置已保存并更新到后端机器人实例')
      } catch (error) {
        console.error('保存持久化数据失败:', error)
        this.addDebugLog(`保存配置失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    },

    // 获取熔断器状态
    async fetchCircuitBreakerState() {
      try {
        const response = await $fetch('/api/trading/circuit-breaker/status') as any
        if (response.success) {
          this.circuitBreakerState = response.data
        }
      } catch (error: any) {
        console.error('获取熔断器状态失败:', error)
      }
    },

    // 重置熔断器
    async resetCircuitBreaker() {
      try {
        const response = await $fetch('/api/trading/circuit-breaker/reset', {
          method: 'POST'
        }) as any
        if (response.success) {
          this.addDebugLog('熔断器已重置')
          await this.fetchCircuitBreakerState()
          return { success: true, message: response.message }
        }
      } catch (error: any) {
        this.addDebugLog(`重置熔断器失败: ${error.message}`)
        throw error
      }
    },

    // 切换自动交易
    async toggleAutoTrading(enabled: boolean) {
      try {
        const response = await $fetch('/api/trading/bot/toggle', {
          method: 'POST',
          body: { enabled }
        }) as any
        if (response.success) {
          this.config.isAutoTrading = enabled
          this.addDebugLog(`自动交易已${enabled ? '开启' : '关闭'}`)
          return { success: true, message: response.message }
        }
      } catch (error: any) {
        this.addDebugLog(`切换自动交易失败: ${error.message}`)
        throw error
      }
    },
  },
})
