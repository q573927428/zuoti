import type { TradingStatus, TradeRecord, SystemStats, SystemConfig, TradingSymbol } from '../../../types/trading'
import { OrderManager } from './OrderManager'
import { getCurrentDate, getDateFromTimestamp } from '../../utils/date'
import { findBestTradingSymbol, calculateBuyAmount, calculateProfit, checkProtection, checkOrderTimeout } from '../../utils/strategy'
import { fetchBalance, getBinanceInstance } from '../../utils/binance'

/**
 * 状态处理器 - 负责各个交易状态的处理逻辑
 */
export class StateHandlers {
  constructor(
    private orderManager: OrderManager,
    private config: SystemConfig
  ) {}
  
  /**
   * 更新配置（用于动态更新）
   */
  updateConfig(config: SystemConfig) {
    this.config = config
  }
  
  /**
   * 获取订单超时时间
   */
  private getOrderTimeout(side: 'buy' | 'sell', symbol?: TradingSymbol): number {
    // 优先使用交易对专属超时
    if (symbol && this.config.orderTimeout.bySymbol && this.config.orderTimeout.bySymbol[symbol]) {
      return this.config.orderTimeout.bySymbol[symbol]
    }
    
    // 其次使用买/卖单专属超时
    if (side === 'buy' && this.config.orderTimeout.buy) {
      return this.config.orderTimeout.buy
    }
    if (side === 'sell' && this.config.orderTimeout.sell) {
      return this.config.orderTimeout.sell
    }
    
    // 最后使用默认超时
    return this.config.orderTimeout.default
  }
  
  // 【新增】辅助方法
  private isInDailyResetPeriod(): boolean {
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    
    // 解析配置的日切时间（如 "23:00"）
    const [resetHour, resetMinute] = this.config.dailyReset.processingTime
      .split(':')
      .map(Number)
    
    // 检查是否在日切时段（23:00-00:00）
    const currentTime = currentHour * 60 + currentMinute
    const resetTime = resetHour * 60 + resetMinute
    
    // 如果当前时间 >= 日切时间，则在日切时段
    return currentTime >= resetTime
  }

  /**
   * 处理空闲状态 - 寻找交易机会
   */
  async handleIdle(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    // 检查是否在日切时段（23:00-00:00）
    if (this.isInDailyResetPeriod()) {
      console.log('⏸️  当前处于日切时段，不接受新交易')
      return tradingStatus
    }
    
    // 检查每日交易次数限制
    if (this.config.dailyTradeLimit > 0) {
      const today = getCurrentDate()
      const todayCompletedTrades = tradeRecords.filter(record => {
        const recordDate = getDateFromTimestamp(record.startTime)
        return recordDate === today && record.status === 'completed'
      })
      
      if (todayCompletedTrades.length >= this.config.dailyTradeLimit) {
        console.log(`⏹️  今天已完成 ${todayCompletedTrades.length}/${this.config.dailyTradeLimit} 次交易，不再交易`)
        return tradingStatus
      }
    }
    
    // 检查交易时间间隔
    if (this.config.tradeInterval > 0) {
      const completedTrades = tradeRecords.filter(record => record.status === 'completed')
      if (completedTrades.length > 0) {
        // 按结束时间降序排序，获取最近一次完成的交易
        const lastCompletedTrade = completedTrades.sort((a, b) => 
          (b.endTime || 0) - (a.endTime || 0)
        )[0]
        
        if (lastCompletedTrade && lastCompletedTrade.endTime) {
          const timeSinceLastTrade = Date.now() - lastCompletedTrade.endTime
          if (timeSinceLastTrade < this.config.tradeInterval) {
            const remainingMinutes = Math.ceil((this.config.tradeInterval - timeSinceLastTrade) / 1000 / 60)
            console.log(`⏳ 距离上次交易完成还需等待 ${remainingMinutes} 分钟`)
            return tradingStatus
          }
        }
      }
    }
    
    console.log('🔍 正在分析市场，寻找交易机会...')
    
    const result = await findBestTradingSymbol(
      this.config.symbols,
      this.config.amplitudeThreshold,
      this.config.trendThreshold,
      this.config.trading.priceRangeRatio
    )
    
    if (!result.bestSymbol) {
      console.log('💤 未找到符合条件的交易机会')
      return tradingStatus
    }
    
    console.log(`✅ 找到交易机会: ${result.bestSymbol.symbol}, 振幅: ${result.bestSymbol.amplitude}%`)
    
    // 安全检查和创建买单
    const newStatus = await this.createBuyOrder(result.bestSymbol, tradeRecords, stats)
    return newStatus || tradingStatus
  }
  
  /**
   * 创建买单（包含安全检查）
   */
  private async createBuyOrder(
    bestSymbol: any,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus | null> {
    // 余额验证
    const balance = await this.checkBalance()
    if (!balance) return null
    
    // 交易精度验证
    const orderParams = await this.validatePrecision(bestSymbol)
    if (!orderParams) return null
    
    const { amount, buyPrice } = orderParams
    
    // 创建买单
    const orderInfo = await this.orderManager.createBuy(bestSymbol.symbol, amount, buyPrice)
    
    // 创建交易记录
    const tradeId = `trade_${Date.now()}`
    const tradeRecord: TradeRecord = {
      id: tradeId,
      symbol: bestSymbol.symbol,
      buyOrderId: orderInfo.orderId,
      buyPrice,
      amount,
      startTime: Date.now(),
      status: 'in_progress',
    }
    
    tradeRecords.push(tradeRecord)
    stats.totalTrades++
    
    if (!stats.tradedSymbols[bestSymbol.symbol]) {
      stats.tradedSymbols[bestSymbol.symbol] = 0
    }
    stats.tradedSymbols[bestSymbol.symbol]++
    
    console.log(`💰 买单已挂: ${bestSymbol.symbol} @ ${buyPrice}`)
    
    return {
      state: 'BUY_ORDER_PLACED',
      symbol: bestSymbol.symbol,
      currentTradeId: tradeId,
      buyOrder: orderInfo,
      high: bestSymbol.high,
      low: bestSymbol.low,
      lastUpdateTime: Date.now(),
    }
  }
  
  /**
   * 检查余额
   */
  private async checkBalance(): Promise<boolean> {
    try {
      const balance = await fetchBalance()
      const usdtBalance = balance.free?.USDT || 0
      
      console.log(`💰 账户余额: ${usdtBalance.toFixed(2)} USDT`)
      
      const requiredAmount = this.config.investmentAmount * (1 + this.config.trading.balanceSafetyBuffer)
      if (usdtBalance < requiredAmount) {
        console.error(`❌ 余额不足！需要: ${requiredAmount.toFixed(2)} USDT, 可用: ${usdtBalance.toFixed(2)} USDT`)
        return false
      }
      return true
    } catch (error) {
      console.error('❌ 查询余额失败:', error)
      return false
    }
  }
  
  /**
   * 验证交易精度
   */
  private async validatePrecision(bestSymbol: any): Promise<{ amount: number; buyPrice: number } | null> {
    try {
      const binance = getBinanceInstance(this.config.isTestnet)
      await binance.loadMarkets()
      const markets = binance.markets
      
      const market = markets[bestSymbol.symbol]
      if (!market) {
        console.error(`❌ 未找到交易对 ${bestSymbol.symbol} 的市场信息`)
        return null
      }
      
      const limits = market.limits
      const precision = market.precision
      
      console.log(`📊 ${bestSymbol.symbol} 交易限制:`, {
        minAmount: limits.amount?.min,
        maxAmount: limits.amount?.max,
        minCost: limits.cost?.min,
        amountPrecision: precision.amount,
        pricePrecision: precision.price
      })
      
      // 计算并调整买入数量
      let amount = calculateBuyAmount(this.config.investmentAmount, bestSymbol.buyPrice)
      
      if (precision.amount) {
        amount = Math.floor(amount / precision.amount) * precision.amount
        amount = parseFloat(amount.toFixed(8))
      }
      
      // 检查最小/最大交易数量
      if (limits.amount?.min && amount < limits.amount.min) {
        console.error(`❌ 交易数量 ${amount} 小于最小限制 ${limits.amount.min}`)
        return null
      }
      
      if (limits.amount?.max && amount > limits.amount.max) {
        console.error(`❌ 交易数量 ${amount} 超过最大限制 ${limits.amount.max}`)
        return null
      }
      
      // 检查最小交易金额
      const totalCost = amount * bestSymbol.buyPrice
      if (limits.cost?.min && totalCost < limits.cost.min) {
        console.error(`❌ 交易金额 ${totalCost.toFixed(2)} USDT 小于最小限制 ${limits.cost.min} USDT`)
        return null
      }
      
      // 调整价格精度
      let buyPrice = bestSymbol.buyPrice
      if (precision.price) {
        buyPrice = Math.floor(buyPrice / precision.price) * precision.price
        buyPrice = parseFloat(buyPrice.toFixed(8))
      }
      
      console.log(`✅ 精度验证通过 - 数量: ${amount}, 价格: ${buyPrice}, 总额: ${totalCost.toFixed(2)} USDT`)
      
      return { amount, buyPrice }
    } catch (error) {
      console.error('❌ 交易精度验证失败:', error)
      return null
    }
  }
  
  /**
   * 处理买单已挂状态
   */
  async handleBuyOrderPlaced(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    if (!tradingStatus.buyOrder || !tradingStatus.symbol) {
      console.error('⚠️  买单状态异常：缺少必要信息')
      return tradingStatus
    }
    
    // 查询订单状态
    let orderStatus
    try {
      orderStatus = await this.orderManager.getOrderStatus(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
    } catch (error) {
      console.error('查询买单状态失败，网络异常，等待下次重试:', error)
      return tradingStatus
    }
    
    // 检查是否完全成交
    if (this.orderManager.isFullyFilled(orderStatus)) {
      console.log(`✅ 买单已完全成交: ${tradingStatus.symbol}`)
      return this.handleBuyOrderFilled(tradingStatus, orderStatus)
    }
    
    // 检查是否已取消
    if (this.orderManager.isCanceled(orderStatus)) {
      console.log(`⚠️  买单已被取消: ${tradingStatus.symbol}`)
      return this.handleBuyOrderCanceled(tradingStatus, tradeRecords, stats)
    }
    
    // 检查保护机制和超时
    return await this.checkBuyOrderProtection(tradingStatus, orderStatus, tradeRecords, stats)
  }
  
  /**
   * 处理买单完全成交
   */
  private handleBuyOrderFilled(tradingStatus: TradingStatus, orderStatus: any): TradingStatus {
    if (orderStatus.filled) {
      tradingStatus.buyOrder!.amount = orderStatus.filled
    }
    if (orderStatus.average) {
      tradingStatus.buyOrder!.price = orderStatus.average
    }
    
    tradingStatus.buyOrder!.status = 'closed'
    tradingStatus.buyOrder!.filledAt = Date.now()
    tradingStatus.state = 'BOUGHT'
    
    console.log(`💎 持仓信息: ${tradingStatus.buyOrder!.amount} ${tradingStatus.symbol} @ ${tradingStatus.buyOrder!.price}`)
    
    return tradingStatus
  }
  
  /**
   * 处理买单取消
   */
  private handleBuyOrderCanceled(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): TradingStatus {
    const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
    if (record) {
      record.status = 'failed'
      record.endTime = Date.now()
      record.failureReason = '买单被取消'
    }
    stats.failedTrades++
    
    return {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    }
  }
  
  /**
   * 检查买单保护机制
   */
  private async checkBuyOrderProtection(
    tradingStatus: TradingStatus,
    orderStatus: any,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    const currentPrice = await this.orderManager.getCurrentPrice(tradingStatus.symbol!)
    const protection = checkProtection(currentPrice, tradingStatus.high!, tradingStatus.low!)
    
    // 检查保护机制
    if (protection.needProtection) {
      console.log(`⚠️  触发保护机制: ${protection.reason}`)
      return await this.cancelBuyOrder(tradingStatus, orderStatus, tradeRecords, stats, protection.reason)
    }
    
    // 检查超时
    const activeTime = this.orderManager.getOrderActiveTime(orderStatus, tradingStatus.buyOrder!.createdAt)
    const buyTimeout = this.getOrderTimeout('buy', tradingStatus.symbol)
    const isTimeout = checkOrderTimeout(activeTime, buyTimeout)
    
    if (isTimeout) {
      console.log(`⏱️  买单超时 (${buyTimeout / 1000}秒)，准备取消订单`)
      return await this.cancelBuyOrder(tradingStatus, orderStatus, tradeRecords, stats, '买单超时')
    }
    
    console.log(`⏳ 买单等待成交中: ${tradingStatus.symbol} ${orderStatus.filled || 0}/${orderStatus.amount}`)
    return tradingStatus
  }
  
  /**
   * 取消买单
   */
  private async cancelBuyOrder(
    tradingStatus: TradingStatus,
    orderStatus: any,
    tradeRecords: TradeRecord[],
    stats: SystemStats,
    failureReason?: string
  ): Promise<TradingStatus> {
    try {
      await this.orderManager.cancel(tradingStatus.symbol!, tradingStatus.buyOrder!.orderId)
      console.log('✅ 买单已取消')
    } catch (error) {
      console.error('取消买单失败:', error)
    }
    
    // 处理部分成交
    if (orderStatus.filled && orderStatus.filled > 0) {
      tradingStatus.buyOrder!.amount = orderStatus.filled
      tradingStatus.buyOrder!.status = 'closed'
      tradingStatus.state = 'BOUGHT'
      return tradingStatus
    }
    
    // 完全未成交，更新失败原因
    const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
    if (record) {
      record.status = 'failed'
      record.endTime = Date.now()
      record.failureReason = failureReason || '买单被取消'
    }
    stats.failedTrades++
    
    return {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    }
  }
  
  /**
   * 处理已买入状态 - 挂卖单
   */
  async handleBought(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    if (!tradingStatus.symbol || !tradingStatus.buyOrder) return tradingStatus
    
    // 优先检查硬止损
    const stopLossResult = await this.checkStopLoss(tradingStatus, tradeRecords, stats)
    if (stopLossResult) return stopLossResult
    
    // 重新分析市场，获取卖出价
    const result = await findBestTradingSymbol(
      [tradingStatus.symbol],
      this.config.amplitudeThreshold,
      this.config.trendThreshold,
      this.config.trading.priceRangeRatio
    )
    
    if (!result.bestSymbol) {
      console.log('⏳ 无法获取卖出价格，等待下次循环')
      return tradingStatus
    }
    
    // 创建卖单
    const sellOrder = await this.orderManager.createSell(
      tradingStatus.symbol,
      tradingStatus.buyOrder.amount,
      result.bestSymbol.sellPrice
    )
    
    // 更新交易记录
    const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
    if (record) {
      record.sellOrderId = sellOrder.orderId
      record.sellPrice = result.bestSymbol.sellPrice
    }
    
    tradingStatus.sellOrder = sellOrder
    tradingStatus.state = 'SELL_ORDER_PLACED'
    
    console.log(`💰 卖单已挂: ${tradingStatus.symbol} @ ${result.bestSymbol.sellPrice}`)
    
    return tradingStatus
  }
  
  /**
   * 检查硬止损
   */
  private async checkStopLoss(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus | null> {
    if (!this.config.stopLoss.enabled) {
      return null
    }
    
    const currentPrice = await this.orderManager.getCurrentPrice(tradingStatus.symbol!)
    const lossRate = ((currentPrice - tradingStatus.buyOrder!.price) / tradingStatus.buyOrder!.price) * 100
    
    if (lossRate <= this.config.stopLoss.threshold) {
      console.log(`🛑 触发硬止损！亏损: ${lossRate.toFixed(2)}% (阈值: ${this.config.stopLoss.threshold}%)`)
      return await this.executeStopLoss(tradingStatus, currentPrice, tradeRecords, stats)
    }
    
    return null
  }
  
  /**
   * 执行止损
   */
  private async executeStopLoss(
    tradingStatus: TradingStatus,
    currentPrice: number,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    try {
      console.log('⚠️  正在执行市价止损...')
      
      // 如果存在现有卖单，先取消它以释放余额
      if (tradingStatus.sellOrder && tradingStatus.state === 'SELL_ORDER_PLACED') {
        try {
          console.log('🔄 检测到现有卖单，先取消以释放余额...')
          await this.orderManager.cancel(tradingStatus.symbol!, tradingStatus.sellOrder.orderId)
          console.log('✅ 现有卖单已取消')
          // 等待订单取消生效
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (cancelError) {
          console.error('⚠️  取消现有卖单失败，但继续尝试止损:', cancelError)
        }
      }
      
      await this.orderManager.createSell(tradingStatus.symbol!, tradingStatus.buyOrder!.amount, currentPrice * 0.998)
      console.log('✅ 止损卖单已提交')
      
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      const profitResult = calculateProfit(
        tradingStatus.buyOrder!.amount,
        tradingStatus.buyOrder!.price,
        currentPrice * 0.998
      )
      
      console.log(`📊 止损完成，亏损: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
      
      this.updateTradeComplete(tradeRecords, tradingStatus.currentTradeId, profitResult, currentPrice * 0.998, stats)
      
      return { state: 'DONE', lastUpdateTime: Date.now() }
    } catch (error) {
      console.error('❌ 止损执行失败:', error)
      return tradingStatus
    }
  }
  
  /**
   * 处理卖单已挂状态
   */
  async handleSellOrderPlaced(
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    if (!tradingStatus.sellOrder || !tradingStatus.symbol || !tradingStatus.buyOrder) {
      console.error('⚠️  卖单状态异常：缺少必要信息')
      return tradingStatus
    }
    
    // 查询订单状态
    let orderStatus
    try {
      orderStatus = await this.orderManager.getOrderStatus(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
    } catch (error) {
      console.error('查询卖单状态失败，网络异常，等待下次重试:', error)
      return tradingStatus
    }
    
    // 检查是否完全成交
    if (this.orderManager.isFullyFilled(orderStatus)) {
      console.log(`✅ 卖单已完全成交: ${tradingStatus.symbol}`)
      return this.handleSellOrderFilled(tradingStatus, orderStatus, tradeRecords, stats)
    }
    
    // 检查是否已取消
    if (this.orderManager.isCanceled(orderStatus)) {
      console.log(`⚠️  卖单已被取消: ${tradingStatus.symbol}，回到已买入状态`)
      return { ...tradingStatus, state: 'BOUGHT', sellOrder: undefined }
    }
    
    // 检查保护机制和超时
    return await this.checkSellOrderProtection(tradingStatus, orderStatus, tradeRecords, stats)
  }
  
  /**
   * 处理卖单完全成交
   */
  private handleSellOrderFilled(
    tradingStatus: TradingStatus,
    orderStatus: any,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): TradingStatus {
    const actualSellPrice = this.orderManager.getActualPrice(orderStatus, tradingStatus.sellOrder!.price)
    const actualAmount = this.orderManager.getActualAmount(orderStatus, tradingStatus.buyOrder!.amount)
    
    const profitResult = calculateProfit(actualAmount, tradingStatus.buyOrder!.price, actualSellPrice)
    
    this.updateTradeComplete(tradeRecords, tradingStatus.currentTradeId, profitResult, actualSellPrice, stats)
    
    console.log(`🎉 交易完成! 收益: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
    
    return { state: 'DONE', lastUpdateTime: Date.now() }
  }
  
  /**
   * 检查卖单保护机制
   */
  private async checkSellOrderProtection(
    tradingStatus: TradingStatus,
    orderStatus: any,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    const currentPrice = await this.orderManager.getCurrentPrice(tradingStatus.symbol!)
    
    // 硬止损检查（executeStopLoss 内部已处理订单取消）
    const stopLossResult = await this.checkStopLoss(tradingStatus, tradeRecords, stats)
    if (stopLossResult) {
      return stopLossResult
    }
    
    // 市场反转保护
    if (tradingStatus.low && currentPrice < tradingStatus.low) {
      console.log(`⚠️  市场反转保护: 当前价格 ${currentPrice} 已跌破原区间下界 ${tradingStatus.low}`)
      await this.orderManager.cancel(tradingStatus.symbol!, tradingStatus.sellOrder!.orderId)
      return { ...tradingStatus, state: 'BOUGHT', sellOrder: undefined }
    }
    
    // 价格偏离保护
    const priceDeviation = ((tradingStatus.sellOrder!.price - currentPrice) / currentPrice) * 100
    if (priceDeviation > 2) {
      console.log(`⚠️  卖单价格偏离过大: ${priceDeviation.toFixed(2)}%`)
      await this.orderManager.cancel(tradingStatus.symbol!, tradingStatus.sellOrder!.orderId)
      return { ...tradingStatus, state: 'BOUGHT', sellOrder: undefined }
    }
    
    // 检查超时
    const activeTime = this.orderManager.getOrderActiveTime(orderStatus, tradingStatus.sellOrder!.createdAt)
    const sellTimeout = this.getOrderTimeout('sell', tradingStatus.symbol)
    const isTimeout = checkOrderTimeout(activeTime, sellTimeout)
    
    if (isTimeout) {
      console.log(`⏱️  卖单超时 (${sellTimeout / 1000}秒)`)
      return await this.handleSellOrderTimeout(tradingStatus, orderStatus, tradeRecords, stats)
    }
    
    console.log(`⏳ 卖单等待成交中: ${tradingStatus.symbol} ${orderStatus.filled || 0}/${orderStatus.amount}`)
    return tradingStatus
  }
  
  /**
   * 处理卖单超时
   */
  private async handleSellOrderTimeout(
    tradingStatus: TradingStatus,
    orderStatus: any,
    tradeRecords: TradeRecord[],
    stats: SystemStats
  ): Promise<TradingStatus> {
    try {
      await this.orderManager.cancel(tradingStatus.symbol!, tradingStatus.sellOrder!.orderId)
      console.log('✅ 超时卖单已取消')
    } catch (error) {
      console.error('取消超时卖单失败:', error)
    }
    
    // 处理部分成交
    if (orderStatus.filled && orderStatus.filled > 0) {
      const filledPercent = (orderStatus.filled / orderStatus.amount) * 100
      if (filledPercent > 80) {
        console.log(`✅ 已成交 ${filledPercent.toFixed(2)}%，视为完成`)
        const actualSellPrice = this.orderManager.getActualPrice(orderStatus, tradingStatus.sellOrder!.price)
        const profitResult = calculateProfit(orderStatus.filled, tradingStatus.buyOrder!.price, actualSellPrice)
        this.updateTradeComplete(tradeRecords, tradingStatus.currentTradeId, profitResult, actualSellPrice, stats)
        return { state: 'DONE', lastUpdateTime: Date.now() }
      }
      
      // 仍有较多未成交
      tradingStatus.buyOrder!.amount = orderStatus.amount - orderStatus.filled
      return { ...tradingStatus, state: 'BOUGHT', sellOrder: undefined }
    }
    
    // 完全未成交，记录失败原因
    const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
    if (record) {
      record.status = 'failed'
      record.endTime = Date.now()
      record.failureReason = '卖单超时'
    }
    stats.failedTrades++
    
    return { ...tradingStatus, state: 'BOUGHT', sellOrder: undefined }
  }
  
  /**
   * 更新交易完成记录
   */
  private updateTradeComplete(
    tradeRecords: TradeRecord[],
    tradeId: string | undefined,
    profitResult: any,
    sellPrice: number,
    stats: SystemStats
  ) {
    const record = tradeRecords.find(r => r.id === tradeId)
    if (record) {
      record.profit = profitResult.profit
      record.profitRate = profitResult.profitRate
      record.status = 'completed'
      record.endTime = Date.now()
      record.sellPrice = sellPrice
    }
    
    stats.successfulTrades++
    stats.totalProfit += profitResult.profit
    
    // 更新统计
    const completedTrades = tradeRecords.filter(r => r.status === 'completed')
    if (completedTrades.length > 0) {
      const totalInvested = completedTrades.length * this.config.investmentAmount
      stats.totalProfitRate = (stats.totalProfit / totalInvested) * 100
      
      const firstTrade = completedTrades[0]
      const daysActive = Math.max(1, Math.ceil((Date.now() - firstTrade.startTime) / (24 * 60 * 60 * 1000)))
      const dailyReturn = stats.totalProfitRate / daysActive
      stats.annualizedReturn = dailyReturn * 365
    }
  }
}
