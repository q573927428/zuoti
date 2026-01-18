import type { TradingSymbol, TradingStatus, TradeRecord, SystemConfig, SystemStats } from '../../../types/trading'
import { resetBinanceInstance, getBinanceInstance } from '../../utils/binance'
import { DataManager } from './DataManager'
import { OrderManager } from './OrderManager'
import { DailyResetHandler } from './DailyResetHandler'
import { StateHandlers } from './StateHandlers'
import { CircuitBreakerManager } from './CircuitBreakerManager'

/**
 * 交易机器人类 - 整合所有模块
 */
export class TradingBot {
  // 全局状态
  private tradingConfig!: SystemConfig
  private tradingStatus!: TradingStatus
  private tradeRecords!: TradeRecord[]
  private stats!: SystemStats
  
  // 并发锁
  private isTrading = false
  
  // 模块实例
  private dataManager: DataManager
  private orderManager: OrderManager
  private dailyResetHandler!: DailyResetHandler
  private stateHandlers!: StateHandlers
  private circuitBreaker!: CircuitBreakerManager
  
  constructor() {
    this.dataManager = new DataManager()
    this.orderManager = new OrderManager()
  }
  
  /**
   * 初始化机器人
   */
  async initialize() {
    await this.loadData()
    console.log('🚀 交易机器人已启动！')
    console.log(`⚙️  自动交易: ${this.tradingConfig.isAutoTrading ? '✅ 开启' : '❌ 关闭'}`)
    console.log(`📊 当前状态: ${this.tradingStatus.state}`)
  }
  
  /**
   * 加载持久化数据
   */
  async loadData() {
    try {
      // 加载配置和统计数据
      const configData = await this.dataManager.loadConfig()
      this.tradingConfig = configData.config
      this.stats = configData.stats
      
      // 加载交易数据和状态
      const tradingData = await this.dataManager.loadTradingData()
      this.tradingStatus = tradingData.tradingStatus
      this.tradeRecords = tradingData.tradeRecords
      
      // 初始化所有模块
      this.stateHandlers = new StateHandlers(this.orderManager, this.tradingConfig)
      this.dailyResetHandler = new DailyResetHandler(this.orderManager, this.tradingConfig)
      this.circuitBreaker = new CircuitBreakerManager(this.tradingConfig.circuitBreaker)
      
      // 重置币安实例
      resetBinanceInstance()
      getBinanceInstance(this.tradingConfig.isTestnet)
    } catch (error) {
      console.log('加载数据失败，使用默认配置')
      this.tradingConfig = this.dataManager.getDefaultConfig()
      this.tradingStatus = this.dataManager.getDefaultStatus()
      this.tradeRecords = []
      this.stats = this.dataManager.getDefaultStats()
      this.stateHandlers = new StateHandlers(this.orderManager, this.tradingConfig)
      await this.saveData()
    }
  }
  
  /**
   * 保存数据
   */
  async saveData() {
    return await this.dataManager.saveData(
      this.tradingConfig,
      this.stats,
      this.tradingStatus,
      this.tradeRecords
    )
  }
  
  /**
   * 检查并执行日切处理
   */
  async checkAndResetDaily() {
    const result = await this.dailyResetHandler.checkAndReset(
      this.stats,
      this.tradingStatus,
      this.tradeRecords
    )
    
    if (result.needsReset) {
      this.stats = result.updatedStats
      this.tradingStatus = result.updatedStatus
      await this.saveData()
    }
  }
  
  /**
   * 主交易循环
   */
  async tradingLoop() {
    // 并发锁
    if (this.isTrading) {
      console.log('⏳ 上一个交易循环还在执行中，跳过本次')
      return
    }
    
    this.isTrading = true
    
    try {
      // 重新加载配置
      await this.loadData()
      
      // 检查日期
      await this.checkAndResetDaily()
      
      // 如果自动交易未开启，跳过
      if (!this.tradingConfig.isAutoTrading) {
        return
      }
      
      // 检查熔断机制
      const circuitCheck = this.circuitBreaker.shouldTrip(this.stats, this.tradeRecords)
      if (circuitCheck.shouldTrip) {
        console.log(`🔒 系统已熔断: ${circuitCheck.reason}`)
        return
      }
      
      // 根据状态执行不同操作
      const previousState = this.tradingStatus.state
      await this.processCurrentState()
      
      // 记录交易结果到熔断器
      if (previousState !== 'DONE' && this.tradingStatus.state === 'DONE') {
        const lastRecord = this.tradeRecords[this.tradeRecords.length - 1]
        if (lastRecord) {
          if (lastRecord.status === 'completed' && lastRecord.profit && lastRecord.profit > 0) {
            this.circuitBreaker.recordSuccess()
          } else if (lastRecord.status === 'failed') {
            this.circuitBreaker.recordFailure()
          }
        }
      }
    } catch (error) {
      console.error('❌ 交易循环错误:', error)
      console.error('错误详情:', {
        state: this.tradingStatus.state,
        symbol: this.tradingStatus.symbol,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
    } finally {
      this.isTrading = false
    }
  }
  
  /**
   * 处理当前状态
   */
  private async processCurrentState() {
    let newStatus: TradingStatus = this.tradingStatus
    
    switch (this.tradingStatus.state) {
      case 'IDLE':
        newStatus = await this.stateHandlers.handleIdle(
          this.tradingStatus,
          this.tradeRecords,
          this.stats
        )
        break
        
      case 'BUY_ORDER_PLACED':
        newStatus = await this.stateHandlers.handleBuyOrderPlaced(
          this.tradingStatus,
          this.tradeRecords,
          this.stats
        )
        break
        
      case 'BOUGHT':
        newStatus = await this.stateHandlers.handleBought(
          this.tradingStatus,
          this.tradeRecords,
          this.stats
        )
        break
        
      case 'SELL_ORDER_PLACED':
        newStatus = await this.stateHandlers.handleSellOrderPlaced(
          this.tradingStatus,
          this.tradeRecords,
          this.stats
        )
        break
        
      case 'DONE':
        // 完成状态，重置为IDLE
        newStatus = {
          state: 'IDLE',
          lastUpdateTime: Date.now(),
        }
        break
    }
    
    // 更新状态
    if (newStatus !== this.tradingStatus) {
      this.tradingStatus = newStatus
      await this.saveData()
    }
  }
  
  /**
   * 启动交易循环
   */
  start() {
    // 立即执行一次
    this.tradingLoop()
    
    // 每30秒执行一次
    setInterval(() => {
      this.tradingLoop()
    }, 30000)
  }
  
  // ===== 公共API方法 =====
  
  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState() {
    if (!this.circuitBreaker) {
      return { isTripped: false, consecutiveFailures: 0, dailyLoss: 0 }
    }
    return this.circuitBreaker.getState()
  }
  
  /**
   * 重置熔断器
   */
  resetCircuitBreaker() {
    if (this.circuitBreaker) {
      this.circuitBreaker.reset()
      console.log('✅ 熔断器已手动重置')
    }
  }
  
  /**
   * 获取配置
   */
  getConfig() {
    return this.tradingConfig
  }
  
  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<SystemConfig>) {
    this.tradingConfig = {
      ...this.tradingConfig,
      ...newConfig
    }
    
    // 更新相关模块的配置
    if (this.circuitBreaker && newConfig.circuitBreaker) {
      this.circuitBreaker.updateConfig(newConfig.circuitBreaker)
    }
    
    if (this.stateHandlers) {
      this.stateHandlers = new StateHandlers(this.orderManager, this.tradingConfig)
    }
    
    // 如果切换了测试网/正式网，重置币安实例
    if (newConfig.isTestnet !== undefined) {
      resetBinanceInstance()
      getBinanceInstance(this.tradingConfig.isTestnet)
    }
    
    await this.saveData()
    console.log('✅ 配置已更新')
  }
  
  /**
   * 切换自动交易开关
   */
  async toggleAutoTrading(enabled: boolean) {
    this.tradingConfig.isAutoTrading = enabled
    await this.saveData()
    console.log(`⚙️  自动交易已${enabled ? '开启' : '关闭'}`)
  }
}

// 全局单例实例
let botInstance: TradingBot | null = null

/**
 * 获取机器人实例
 */
export function getBotInstance(): TradingBot {
  if (!botInstance) {
    throw new Error('交易机器人尚未初始化')
  }
  return botInstance
}

/**
 * 设置机器人实例
 */
export function setBotInstance(bot: TradingBot) {
  botInstance = bot
}
