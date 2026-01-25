import { defineStore } from 'pinia'
import type { 
  TradingSymbol, 
  TradingStatus, 
  TradeRecord, 
  SystemConfig, 
  SystemStats,
  AmplitudeAnalysis,
  MultiTimeframeAnalysis,
  AIAnalysisResult
} from '../../types/trading'
import { getCurrentDate, getDateFromTimestamp } from '../utils/date'

export const useTradingStore = defineStore('trading', {
  state: () => ({
    // 系统配置
    config: {
      isTestnet: false,         // 是否使用币安测试网
      isAutoTrading: true,     // 是否开启自动交易主开关
      symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'] as TradingSymbol[],
      investmentAmount: 100,    // 单次交易的投入金额（USDT
      amplitudeThreshold: 2.0,   // 价格振幅阈值（%）
      trendThreshold: 10.0,       // 趋势强度阈值（%）

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
        processingTime: '23:30',            // 23:00开始日切处理
        warningTime: '23:20',               // 22:30开始预警
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
        priceDeviationThreshold: 2,
        partialFillThreshold: 0.9,
        balanceSafetyBuffer: 0.05,
        marketOrderDiscount: 0.999,
        priceRangeRatio: 0.1 // 买入/卖出价格距离边界10%
      },

      // 多时间框架配置
      multiTimeframe: {
        enabled: true,
        strictMode: false,
        weights: {
          '15m': 0.4,
          '1h': 0.35,
          '4h': 0.25
        },
        scoreThreshold: 60,
        lookbackPeriods: {
          '15m': 48,
          '1h': 24,
          '4h': 12
        }
      },

      // 交易次数和间隔配置
      dailyTradeLimit: 3,                    // 每日交易次数限制
      tradeInterval: 60 * 60 * 1000,         // 交易间隔时间（1小时）

      // AI分析配置
      ai: {
        enabled: true,
        analysisInterval: 24 * 60 * 60 * 1000,    // 10分钟
        minConfidence: 60,                   // 最小置信度70%
        maxRiskLevel: 'MEDIUM' as const,     // 最大风险等级：中风险
        useForBuyDecisions: true,            // 用于买入决策
        useForSellDecisions: true,           // 用于卖出决策
        cacheDuration: 10 * 60 * 1000,        // 缓存30分钟
      },
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
    
    // 多时间框架分析（当启用时使用）
    multiTimeframeAnalyses: [] as MultiTimeframeAnalysis[],

    // 当前价格
    currentPrices: {} as Record<TradingSymbol, number>,

    // 账户余额
    balances: {} as Record<string, { free: number; used: number; total: number }>,

    // 调试日志
    debugLogs: [] as string[],

    // 后端日志
    backendLogs: [] as Array<{
      timestamp: number;
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
      source?: string;
    }>,
    
    // 后端日志统计
    backendLogStats: {
      total: 0,
      lastHour: 0,
      lastDay: 0,
      byLevel: {
        info: 0,
        warn: 0,
        error: 0,
        debug: 0,
      },
    },

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

    // AI分析结果缓存（按交易对存储）
    aiAnalysisCache: {} as Record<TradingSymbol, AIAnalysisResult>,
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

    // 更新多时间框架分析
    updateMultiTimeframeAnalyses(analyses: MultiTimeframeAnalysis[]) {
      this.multiTimeframeAnalyses = analyses
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

    // 市价买入
    async marketBuy(symbol: TradingSymbol, amount: number, cancelOrderId?: string) {
      try {
        const response = await $fetch('/api/trading/order/create-market-buy', {
          method: 'POST',
          body: { symbol, amount, cancelOrderId }
        }) as any
        
        if (response.success) {
          this.addDebugLog(`市价买入成功: ${symbol} x ${amount}, 成交价: ${response.order.price}`)
          return { success: true, order: response.order, message: response.message }
        }
      } catch (error: any) {
        this.addDebugLog(`市价买入失败: ${error.message}`)
        throw error
      }
    },

    // 市价卖出
    async marketSell(symbol: TradingSymbol, amount: number, cancelOrderId?: string) {
      try {
        const response = await $fetch('/api/trading/order/create-market-sell', {
          method: 'POST',
          body: { symbol, amount, cancelOrderId }
        }) as any
        
        if (response.success) {
          this.addDebugLog(`市价卖出成功: ${symbol} x ${amount}, 成交价: ${response.order.price}`)
          return { success: true, order: response.order, message: response.message }
        }
      } catch (error: any) {
        this.addDebugLog(`市价卖出失败: ${error.message}`)
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

    // 获取后端日志
    async fetchBackendLogs(options?: {
      level?: 'all' | 'info' | 'warn' | 'error' | 'debug';
      limit?: number;
      offset?: number;
      since?: number;
      search?: string;
    }) {
      try {
        const params = new URLSearchParams()
        if (options?.level) params.append('level', options.level)
        if (options?.limit) params.append('limit', options.limit.toString())
        if (options?.offset) params.append('offset', options.offset.toString())
        if (options?.since) params.append('since', options.since.toString())
        if (options?.search) params.append('search', options.search)
        
        const response = await $fetch(`/api/trading/logs?${params.toString()}`) as any
        
        if (response.success) {
          this.backendLogs = response.data.logs
          this.backendLogStats = response.data.stats
          this.addDebugLog(`成功获取后端日志 (${response.data.logs.length}条)`)
          return { success: true, data: response.data }
        } else {
          this.addDebugLog(`获取后端日志失败: ${response.message}`)
          return { success: false, message: response.message }
        }
      } catch (error: any) {
        this.addDebugLog(`获取后端日志错误: ${error.message}`)
        console.error('获取后端日志失败:', error)
        return { success: false, message: error.message }
      }
    },

    // 清空后端日志
    async clearBackendLogs() {
      try {
        const response = await $fetch('/api/trading/logs/clear', {
          method: 'POST'
        }) as any
        
        if (response.success) {
          this.backendLogs = []
          this.backendLogStats = {
            total: 0,
            lastHour: 0,
            lastDay: 0,
            byLevel: { info: 0, warn: 0, error: 0, debug: 0 },
          }
          this.addDebugLog('后端日志已清空')
          return { success: true, message: response.message }
        } else {
          this.addDebugLog(`清空后端日志失败: ${response.message}`)
          return { success: false, message: response.message }
        }
      } catch (error: any) {
        this.addDebugLog(`清空后端日志错误: ${error.message}`)
        console.error('清空后端日志失败:', error)
        return { success: false, message: error.message }
      }
    },

    // 获取AI分析结果
    async fetchAIAnalysis(symbol: TradingSymbol): Promise<AIAnalysisResult | null> {
      try {
        // 检查缓存是否有效
        const cached = this.aiAnalysisCache[symbol]
        if (cached && cached.expiresAt > Date.now()) {
          console.log(`📊 使用缓存的AI分析结果: ${symbol}`)
          return cached
        }

        const response = await $fetch('/api/trading/ai-analyze', {
          method: 'POST',
          body: { symbol }
        }) as any
        
        if (response.success) {
          this.aiAnalysisCache[symbol] = response.analysis
          this.addDebugLog(`获取AI分析成功: ${symbol} - ${response.analysis.recommendation} (${response.analysis.confidence}%)`)
          return response.analysis
        } else {
          this.addDebugLog(`获取AI分析失败: ${response.error || '未知错误'}`)
          return null
        }
      } catch (error: any) {
        this.addDebugLog(`获取AI分析错误: ${error.message}`)
        console.error('获取AI分析失败:', error)
        return null
      }
    },

    // 检查AI分析是否通过（根据配置）
    checkAIPassed(analysis: AIAnalysisResult | null, action: 'buy' | 'sell'): boolean {
      if (!analysis) {
        // 如果没有分析结果，根据配置决定是否通过
        return !this.config.ai.enabled || 
               (action === 'buy' && !this.config.ai.useForBuyDecisions) ||
               (action === 'sell' && !this.config.ai.useForSellDecisions)
      }

      // 检查置信度阈值
      if (analysis.confidence < this.config.ai.minConfidence) {
        return false
      }

      // 检查风险等级
      const riskLevels = { LOW: 1, MEDIUM: 2, HIGH: 3 }
      const maxRiskLevel = riskLevels[this.config.ai.maxRiskLevel]
      const currentRiskLevel = riskLevels[analysis.riskLevel]
      
      if (currentRiskLevel > maxRiskLevel) {
        return false
      }

      // 检查交易建议
      if (action === 'buy') {
        // 买入操作需要BUY或HOLD建议
        return analysis.recommendation === 'BUY' || analysis.recommendation === 'HOLD'
      } else if (action === 'sell') {
        // 卖出操作需要SELL或HOLD建议
        return analysis.recommendation === 'SELL' || analysis.recommendation === 'HOLD'
      }

      return false
    },

    // 获取当前交易对的AI分析结果
    getCurrentAIAnalysis(): AIAnalysisResult | null {
      if (!this.tradingStatus.symbol) {
        return null
      }
      return this.aiAnalysisCache[this.tradingStatus.symbol] || null
    },
  },
})
