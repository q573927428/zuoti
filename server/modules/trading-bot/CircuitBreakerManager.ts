import type { CircuitBreakerConfig, TradeRecord, SystemStats } from '../../../types/trading'
import { getCurrentDate } from '../../utils/date'

/**
 * 熔断状态
 */
interface CircuitBreakerState {
  isTripped: boolean // 是否已熔断
  trippedAt?: number // 熔断时间
  reason?: string // 熔断原因
  consecutiveFailures: number // 连续失败次数
  dailyLoss: number // 当日累计亏损
}

/**
 * 熔断管理器 - 负责熔断机制的检查和管理
 */
export class CircuitBreakerManager {
  private state: CircuitBreakerState = {
    isTripped: false,
    consecutiveFailures: 0,
    dailyLoss: 0,
  }
  
  constructor(
    private config: CircuitBreakerConfig
  ) {}
  
  /**
   * 更新配置
   */
  updateConfig(config: CircuitBreakerConfig) {
    this.config = config
  }
  
  /**
   * 检查是否需要熔断
   */
  shouldTrip(stats: SystemStats, tradeRecords: TradeRecord[]): { shouldTrip: boolean; reason?: string } {
    if (!this.config.enabled) {
      return { shouldTrip: false }
    }
    
    // 检查是否在冷却期
    if (this.state.isTripped) {
      const now = Date.now()
      const elapsed = now - (this.state.trippedAt || 0)
      
      if (elapsed < this.config.cooldownPeriod) {
        const remainingMinutes = Math.ceil((this.config.cooldownPeriod - elapsed) / 60000)
        console.log(`🔒 熔断中，剩余冷却时间: ${remainingMinutes} 分钟`)
        return { shouldTrip: true, reason: this.state.reason }
      } else {
        // 冷却期结束，重置熔断状态
        console.log('✅ 熔断冷却期结束，恢复交易')
        this.reset()
      }
    }
    
    // 检查连续失败次数
    if (this.state.consecutiveFailures >= this.config.consecutiveFailures) {
      const reason = `连续失败 ${this.state.consecutiveFailures} 次`
      this.trip(reason)
      return { shouldTrip: true, reason }
    }
    
    // 检查单日亏损
    const today = getCurrentDate()
    const todayTrades = tradeRecords.filter(r => {
      const tradeDate = new Date(r.startTime).toISOString().split('T')[0]
      return tradeDate === today && r.status === 'completed'
    })
    
    this.state.dailyLoss = todayTrades.reduce((sum, trade) => {
      return sum + (trade.profit || 0)
    }, 0)
    
    if (this.state.dailyLoss < -this.config.dailyLossLimit) {
      const reason = `单日亏损 ${Math.abs(this.state.dailyLoss).toFixed(2)} USDT，超过限额 ${this.config.dailyLossLimit} USDT`
      this.trip(reason)
      return { shouldTrip: true, reason }
    }
    
    // 检查总累计亏损
    if (stats.totalProfit < -this.config.totalLossLimit) {
      const reason = `总亏损 ${Math.abs(stats.totalProfit).toFixed(2)} USDT，超过限额 ${this.config.totalLossLimit} USDT`
      this.trip(reason)
      return { shouldTrip: true, reason }
    }
    
    return { shouldTrip: false }
  }
  
  /**
   * 记录交易失败
   */
  recordFailure() {
    this.state.consecutiveFailures++
    console.log(`⚠️  连续失败次数: ${this.state.consecutiveFailures}/${this.config.consecutiveFailures}`)
  }
  
  /**
   * 记录交易成功（重置连续失败计数）
   */
  recordSuccess() {
    if (this.state.consecutiveFailures > 0) {
      console.log(`✅ 交易成功，重置连续失败计数（之前: ${this.state.consecutiveFailures}）`)
      this.state.consecutiveFailures = 0
    }
  }
  
  /**
   * 检查价格波动是否异常
   */
  checkPriceVolatility(currentPrice: number, previousPrice: number): boolean {
    if (!this.config.enabled) {
      return false
    }
    
    const volatility = Math.abs((currentPrice - previousPrice) / previousPrice) * 100
    
    if (volatility > this.config.priceVolatilityThreshold) {
      console.log(`⚠️  价格波动异常: ${volatility.toFixed(2)}% (阈值: ${this.config.priceVolatilityThreshold}%)`)
      return true
    }
    
    return false
  }
  
  /**
   * 触发熔断
   */
  private trip(reason: string) {
    this.state.isTripped = true
    this.state.trippedAt = Date.now()
    this.state.reason = reason
    
    const cooldownHours = (this.config.cooldownPeriod / (60 * 60 * 1000)).toFixed(1)
    console.error(`🚨 熔断触发！原因: ${reason}`)
    console.error(`⏰ 冷却时间: ${cooldownHours} 小时`)
  }
  
  /**
   * 重置熔断状态
   */
  reset() {
    this.state = {
      isTripped: false,
      consecutiveFailures: 0,
      dailyLoss: 0,
    }
  }
  
  /**
   * 重置每日统计（日切时调用）
   */
  resetDaily() {
    this.state.dailyLoss = 0
    console.log('📊 熔断器每日统计已重置')
  }
  
  /**
   * 获取当前状态
   */
  getState(): CircuitBreakerState {
    return { ...this.state }
  }
  
  /**
   * 是否已熔断
   */
  isTripped(): boolean {
    return this.state.isTripped
  }
}
