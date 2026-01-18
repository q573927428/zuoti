import type { TradingStatus, TradeRecord, SystemStats, SystemConfig } from '../../../types/trading'
import { getCurrentDate } from '../../utils/date'
import { OrderManager } from './OrderManager'
import { calculateProfit } from '../../utils/strategy'
import { fetchBalance } from '../../utils/binance'

/**
 * 日切处理器 - 负责日期变更时的状态重置和强制平仓
 */
export class DailyResetHandler {
  constructor(
    private orderManager: OrderManager,
    private config: SystemConfig
  ) {}
  
  /**
   * 更新配置
   */
  updateConfig(config: SystemConfig) {
    this.config = config
  }
  
  /**
   * 检查并执行日切处理
   */
  async checkAndReset(
    stats: SystemStats,
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[]
  ): Promise<{ needsReset: boolean; updatedStats: SystemStats; updatedStatus: TradingStatus }> {
    const today = getCurrentDate()
    
    if (stats.currentDate === today) {
      return { needsReset: false, updatedStats: stats, updatedStatus: tradingStatus }
    }
    
    console.log(`📅 日期变更: ${stats.currentDate} -> ${today}`)
    console.log('⚠️  开始执行严格日切处理...')
    
    // 处理未完成的交易
    if (tradingStatus.state !== 'IDLE' && tradingStatus.state !== 'DONE') {
      await this.handlePendingTrades(tradingStatus, tradeRecords, stats)
    }
    
    // 重置状态
    console.log('✅ 日切处理完成，重置交易状态')
    const newStatus: TradingStatus = {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    }
    
    // 重置每日统计
    const newStats = {
      ...stats,
      currentDate: today,
      tradedSymbols: {},
    }
    
    console.log('✅ 日切完成，系统已准备好新的一天')
    
    return { needsReset: true, updatedStats: newStats, updatedStatus: newStatus }
  }
  
  /**
   * 处理日切时未完成的交易
   */
  private async handlePendingTrades(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ) {
    console.log(`⚠️  检测到未完成交易，状态: ${tradingStatus.state}`)
    
    try {
      switch (tradingStatus.state) {
        case 'BUY_ORDER_PLACED':
          await this.handlePendingBuyOrder(tradingStatus, tradeRecords, stats)
          break
        case 'SELL_ORDER_PLACED':
          await this.handlePendingSellOrder(tradingStatus, tradeRecords, stats)
          break
        case 'BOUGHT':
          await this.handleBoughtState(tradingStatus, tradeRecords, stats)
          break
      }
    } catch (error) {
      console.error('❌ 日切处理失败:', error)
    }
  }
  
  /**
   * 处理未成交的买单
   */
  private async handlePendingBuyOrder(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ) {
    if (!tradingStatus.buyOrder || !tradingStatus.symbol) return
    
    console.log('🔄 处理未成交买单...')
    
    // 先查询订单真实状态
    let orderStatus
    try {
      orderStatus = await this.orderManager.getOrderStatus(
        tradingStatus.symbol,
        tradingStatus.buyOrder.orderId
      )
      console.log(`📊 买单真实状态: ${orderStatus.status}, 已成交: ${orderStatus.filled || 0}/${orderStatus.amount}`)
    } catch (error: any) {
      if (error.message?.includes('OrderNotFound') || error.code === -2011) {
        console.log('⚠️  订单不存在，可能已完全成交或已被取消')
        // 查询账户余额确认是否有币
        const hasPosition = await this.checkHasPosition(tradingStatus.symbol, tradingStatus.buyOrder.amount)
        if (hasPosition) {
          console.log('✅ 检测到持仓，订单已成交，立即市价强平')
          await this.forceSell(
            tradingStatus.symbol,
            tradingStatus.buyOrder.amount,
            tradingStatus.buyOrder.price,
            tradeRecords,
            stats,
            tradingStatus.currentTradeId
          )
        } else {
          console.log('❌ 无持仓，标记交易失败')
          this.markTradeFailed(tradeRecords, tradingStatus.currentTradeId, '日切时订单不存在且无持仓')
          stats.failedTrades++
        }
        return
      }
      throw error
    }
    
    // 检查订单是否已完全成交
    if (this.orderManager.isFullyFilled(orderStatus)) {
      console.log('✅ 买单已完全成交，立即市价强平')
      await this.forceSell(
        tradingStatus.symbol,
        orderStatus.filled || tradingStatus.buyOrder.amount,
        tradingStatus.buyOrder.price,
        tradeRecords,
        stats,
        tradingStatus.currentTradeId
      )
      return
    }
    
    // 订单还在挂单中，尝试取消
    try {
      await this.orderManager.cancel(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
      console.log('✅ 买单已取消')
    } catch (error: any) {
      if (error.message?.includes('OrderNotFound') || error.code === -2011) {
        console.log('⚠️  取消时订单已不存在，可能已成交')
      } else {
        console.error('❌ 取消买单失败:', error)
      }
    }
    
    // 如果有部分成交，需要立即市价卖出
    if (orderStatus.filled && orderStatus.filled > 0) {
      console.log(`⚠️  买单部分成交 ${orderStatus.filled}，立即市价卖出`)
      await this.forceSell(tradingStatus.symbol, orderStatus.filled, tradingStatus.buyOrder.price, tradeRecords, stats, tradingStatus.currentTradeId)
    } else {
      // 标记交易为失败
      this.markTradeFailed(tradeRecords, tradingStatus.currentTradeId, '日切强制取消')
      stats.failedTrades++
    }
  }
  
  /**
   * 检查是否有持仓
   */
  private async checkHasPosition(symbol: string, expectedAmount: number): Promise<boolean> {
    try {
      const balance = await fetchBalance()
      const asset = symbol.replace('/USDT', '')
      const actualAmount = balance.free?.[asset] || 0
      
      console.log(`💰 ${asset} 余额: ${actualAmount}, 期望: ${expectedAmount}`)
      
      // 允许一定误差（0.1%）
      return actualAmount >= expectedAmount * 0.999
    } catch (error) {
      console.error('查询余额失败:', error)
      return false
    }
  }
  
  /**
   * 处理未成交的卖单
   */
  private async handlePendingSellOrder(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ) {
    if (!tradingStatus.sellOrder || !tradingStatus.symbol || !tradingStatus.buyOrder) return
    
    console.log('🔄 处理未成交卖单，准备强制平仓...')
    
    const orderStatus = await this.orderManager.getOrderStatus(
      tradingStatus.symbol,
      tradingStatus.sellOrder.orderId
    )
    
    // 取消卖单
    try {
      await this.orderManager.cancel(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
      console.log('✅ 卖单已取消')
    } catch (error) {
      console.error('❌ 取消卖单失败:', error)
    }
    
    // 计算剩余持仓
    const remainingAmount = tradingStatus.buyOrder.amount - (orderStatus.filled || 0)
    
    if (remainingAmount > 0) {
      console.log(`⚠️  剩余持仓 ${remainingAmount}，立即市价强平`)
      await this.forceSell(tradingStatus.symbol, remainingAmount, tradingStatus.buyOrder.price, tradeRecords, stats, tradingStatus.currentTradeId)
    }
  }
  
  /**
   * 处理已买入但未挂卖单的状态
   */
  private async handleBoughtState(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ) {
    if (!tradingStatus.buyOrder || !tradingStatus.symbol) return
    
    console.log('🔄 检测到已买入但未挂卖单，立即市价强平')
    await this.forceSell(
      tradingStatus.symbol,
      tradingStatus.buyOrder.amount,
      tradingStatus.buyOrder.price,
      tradeRecords,
      stats,
      tradingStatus.currentTradeId
    )
  }
  
  /**
   * 强制市价卖出
   */
  private async forceSell(
    symbol: string,
    amount: number,
    buyPrice: number,
    tradeRecords: TradeRecord[],
    stats: SystemStats,
    tradeId?: string
  ) {
    try {
      const currentPrice = await this.orderManager.getCurrentPrice(symbol as any)
      await this.orderManager.createSell(symbol as any, amount, currentPrice * 0.999)
      console.log('✅ 日切强平卖单已提交')
      
      // 等待3秒查询是否成交
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // 计算强平后的收益
      const profitResult = calculateProfit(amount, buyPrice, currentPrice * 0.999)
      
      console.log(`📊 日切强平收益: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
      
      // 更新交易记录
      this.updateTradeRecord(tradeRecords, tradeId, {
        profit: profitResult.profit,
        profitRate: profitResult.profitRate,
        status: 'completed',
        sellPrice: currentPrice * 0.999,
      })
      
      // 更新统计
      stats.successfulTrades++
      stats.totalProfit += profitResult.profit
    } catch (error) {
      console.error('❌ 日切强平失败:', error)
      this.markTradeFailed(tradeRecords, tradeId, '日切强平失败')
      stats.failedTrades++
    }
  }
  
  /**
   * 更新交易记录
   */
  private updateTradeRecord(
    tradeRecords: TradeRecord[],
    tradeId: string | undefined,
    updates: Partial<TradeRecord>
  ) {
    const record = tradeRecords.find(r => r.id === tradeId)
    if (record) {
      Object.assign(record, updates)
      if (updates.status === 'completed' || updates.status === 'failed') {
        record.endTime = Date.now()
      }
    }
  }
  
  /**
   * 标记交易失败
   */
  private markTradeFailed(tradeRecords: TradeRecord[], tradeId: string | undefined, failureReason?: string) {
    this.updateTradeRecord(tradeRecords, tradeId, { 
      status: 'failed',
      failureReason: failureReason || '日切强制取消'
    })
  }
}
