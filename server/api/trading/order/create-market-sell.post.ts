import type { TradingSymbol, TradingStatus } from '../../../../types/trading'
import { createMarketSellOrder, cancelOrder } from '../../../utils/binance'
import { getBotInstance } from '../../../modules/trading-bot'
import { calculateProfit } from '../../../utils/strategy'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbol, amount, cancelOrderId } = body as { 
      symbol: TradingSymbol
      amount: number
      cancelOrderId?: string // 可选的：需要取消的限价卖单ID
    }
    
    // 获取交易机器人实例
    const bot = getBotInstance()
    
    // 如果有需要取消的限价单，先取消
    if (cancelOrderId) {
      try {
        await cancelOrder(symbol, cancelOrderId)
        console.log(`已取消限价卖单: ${cancelOrderId}`)
      } catch (cancelError) {
        console.warn(`取消限价卖单失败，继续执行市价卖出:`, cancelError)
      }
    }
    
    // 创建市价卖单
    const order = await createMarketSellOrder(symbol, amount)
    
    // 获取实际成交价格（市价单可能有多笔成交）
    const avgPrice = order.average || order.price || 0
    console.log(`📊 计算出的平均价格: ${avgPrice} (average: ${order.average}, price: ${order.price})`)
    
    // 调试：检查订单ID字段
    const orderId = order.id || order.orderId || order.order_id
    console.log(`🔑 订单ID字段: id=${order.id}, orderId=${order.orderId}, order_id=${order.order_id}, 最终使用: ${orderId}`)
    
    // 更新交易机器人状态 - 市价卖出成功，状态从SELL_ORDER_PLACED或BOUGHT变为DONE
    try {
      // 通过私有属性访问内部状态
      const botAny = bot as any
      const tradingStatus = botAny.tradingStatus
      const tradeRecords = botAny.tradeRecords
      const stats = botAny.stats
      
      if (tradingStatus && tradingStatus.symbol === symbol) {
        // 获取买入价格和数量
        const buyPrice = tradingStatus.buyOrder?.price || 0
        const buyAmount = tradingStatus.buyOrder?.amount || amount
        
        // 计算收益
        const profitResult = calculateProfit(buyAmount, buyPrice, avgPrice)
        
        // 更新交易记录
        if (tradingStatus.currentTradeId) {
          const tradeRecord = tradeRecords.find((r: any) => r.id === tradingStatus.currentTradeId)
          if (tradeRecord) {
            // 确保sellPrice总是被设置（即使为0也要记录）
            tradeRecord.sellPrice = avgPrice
            tradeRecord.amount = buyAmount
            tradeRecord.profit = profitResult.profit
            tradeRecord.profitRate = profitResult.profitRate
            tradeRecord.status = 'completed'
            tradeRecord.endTime = Date.now()
            
            // 使用调试中确定的订单ID字段
            const orderId = order.id || order.orderId || order.order_id
            if (orderId) {
              tradeRecord.sellOrderId = orderId
              console.log(`✅ 已设置卖单ID: ${orderId}`)
            } else {
              console.warn('⚠️  订单ID为空，sellOrderId未设置')
            }
            
            console.log(`📝 交易记录已更新: sellPrice=${avgPrice}, profit=${profitResult.profit}, profitRate=${profitResult.profitRate}%`)
          } else {
            console.error(`❌ 未找到交易记录: ${tradingStatus.currentTradeId}`)
          }
        } else {
          console.error('❌ tradingStatus.currentTradeId 为空')
        }
        
        // 更新统计信息
        stats.successfulTrades++
        stats.totalProfit += profitResult.profit
        
        // 计算总收益率和年化收益率
        const completedTrades = tradeRecords.filter((r: any) => r.status === 'completed')
        if (completedTrades.length > 0) {
          const totalInvested = completedTrades.length * botAny.tradingConfig.investmentAmount
          stats.totalProfitRate = (stats.totalProfit / totalInvested) * 100
          
          const firstTrade = completedTrades[0]
          const daysActive = Math.max(1, Math.ceil((Date.now() - firstTrade.startTime) / (24 * 60 * 60 * 1000)))
          const dailyReturn = stats.totalProfitRate / daysActive
          stats.annualizedReturn = dailyReturn * 365
        }
        
        // 记录原始状态用于日志
        const originalState = tradingStatus.state
        
        // 重置交易状态为DONE，只保留state和lastUpdateTime
        const newTradingStatus: TradingStatus = {
          state: 'DONE',
          lastUpdateTime: Date.now(),
        }

        // 替换旧的tradingStatus对象
        Object.keys(tradingStatus).forEach(key => {
          delete (tradingStatus as any)[key]
        })
        Object.assign(tradingStatus, newTradingStatus)
        
        // 清除任何可能存在的卖单信息，防止状态处理器误判
        if (tradingStatus.sellOrder) {
          delete (tradingStatus as any).sellOrder
        }
        if (tradingStatus.currentTradeId) {
          delete (tradingStatus as any).currentTradeId
        }
        if (tradingStatus.symbol) {
          delete (tradingStatus as any).symbol
        }
        if (tradingStatus.buyOrder) {
          delete (tradingStatus as any).buyOrder
        }
        if (tradingStatus.high) {
          delete (tradingStatus as any).high
        }
        if (tradingStatus.low) {
          delete (tradingStatus as any).low
        }
        
        // 保存数据
        await botAny.saveData()
        console.log(`✅ 市价卖出成功，状态已更新: ${originalState} -> DONE`)
        console.log(`📊 收益: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
      } else {
        console.log(`⚠️  当前状态不匹配或没有交易对信息，状态未更新`)
      }
    } catch (updateError) {
      console.warn('更新交易机器人状态失败:', updateError)
    }
    return {
      success: true,
      order: {
        orderId: orderId, // 使用确定的订单ID
        symbol,
        side: 'sell',
        price: avgPrice,
        amount: order.amount || amount,
        status: 'closed',
        createdAt: Date.now(),
      },
      message: '市价卖出成功'
    }
    
  }
  catch (error) {
    console.error('市价卖出失败:', error)
    return {
      success: false,
      message: '市价卖出失败'
    }
  }
})
