import type { TradingSymbol } from '../../../../types/trading'
import { createMarketBuyOrder, cancelOrder } from '../../../utils/binance'
import { getBotInstance } from '../../../modules/trading-bot'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbol, amount, cancelOrderId } = body as { 
      symbol: TradingSymbol
      amount: number
      cancelOrderId?: string // 可选的：需要取消的限价买单ID
    }
    
    // 获取交易机器人实例
    const bot = getBotInstance()
    
    // 如果有需要取消的限价单，先取消
    if (cancelOrderId) {
      try {
        await cancelOrder(symbol, cancelOrderId)
        console.log(`已取消限价买单: ${cancelOrderId}`)
      } catch (cancelError) {
        console.warn(`取消限价买单失败，继续执行市价买入:`, cancelError)
      }
    }
    
    // 创建市价买单
    const order = await createMarketBuyOrder(symbol, amount)
    
    // 获取实际成交价格（市价单可能有多笔成交）
    const avgPrice = order.average || order.price || 0
    
    // 更新交易机器人状态 - 市价买入成功，状态从BUY_ORDER_PLACED变为BOUGHT
    try {
      // 通过私有属性访问内部状态
      const botAny = bot as any
      const tradingStatus = botAny.tradingStatus
      const tradeRecords = botAny.tradeRecords
      const stats = botAny.stats
      
      if (tradingStatus && tradingStatus.symbol === symbol) {
        // 允许从多个状态转换到 BOUGHT
        const allowedStates = ['BUY_ORDER_PLACED', 'IDLE', 'BOUGHT']
        // 更新买单信息
        if (allowedStates.includes(tradingStatus.state)) {
          tradingStatus.buyOrder.price = avgPrice
          tradingStatus.buyOrder.amount = order.amount || amount
          tradingStatus.buyOrder.status = 'closed'
          tradingStatus.buyOrder.filledAt = Date.now()
        }
        
        // 更新交易状态
        tradingStatus.state = 'BOUGHT'
        tradingStatus.lastUpdateTime = Date.now()
        
        // 更新交易记录
        if (tradingStatus.currentTradeId) {
          const tradeRecord = tradeRecords.find((r: any) => r.id === tradingStatus.currentTradeId)
          if (tradeRecord) {
            tradeRecord.buyPrice = avgPrice
            tradeRecord.amount = order.amount || amount
          }
        }
        
        // 更新统计信息 - 增加总交易次数
        stats.totalTrades++
        
        // 更新今日交易计数
        if (!stats.tradedSymbols[symbol]) {
          stats.tradedSymbols[symbol] = 0
        }
        stats.tradedSymbols[symbol] = (stats.tradedSymbols[symbol] || 0) + 1
        
        // 保存数据
        await botAny.saveData()
        console.log(`✅ 市价买入成功，状态已更新: BUY_ORDER_PLACED -> BOUGHT`)
        console.log(`📊 总交易次数: ${stats.totalTrades}, 今日${symbol}交易次数: ${stats.tradedSymbols[symbol]}`)
      } else {
        console.log(`⚠️  当前状态不是BUY_ORDER_PLACED或交易对不匹配，状态未更新`)
      }
    } catch (updateError) {
      console.warn('更新交易机器人状态失败:', updateError)
    }
    return {
      success: true,
      order: {
        orderId: order.id,
        symbol,
        side: 'buy',
        price: avgPrice,
        amount: order.amount || amount,
        status: 'closed',
        createdAt: Date.now(),
      },
      message: '市价买入成功'
    }
  }
  catch (error) {
    console.error('市价买入失败:', error)
    return {
      success: false,
      message: '市价买入失败'
    }
  }
})
