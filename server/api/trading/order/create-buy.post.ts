import type { TradingSymbol } from '../../../../types/trading'
import { createBuyOrder } from '../../../utils/binance'
import { calculateBuyAmount } from '../../../utils/strategy'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbol, price, investmentAmount } = body as { 
      symbol: TradingSymbol
      price: number
      investmentAmount: number
    }
    
    // 计算购买数量
    const amount = calculateBuyAmount(investmentAmount, price)
    
    // 创建买单
    const order = await createBuyOrder(symbol, amount, price)
    
    return {
      success: true,
      order: {
        orderId: order.id,
        symbol,
        side: 'buy',
        price,
        amount,
        status: order.status === 'open' ? 'open' : 'closed',
        createdAt: Date.now(),
      }
    }
  } catch (error: any) {
    console.error('创建买单失败:', error)
    throw createError({
      statusCode: 500,
      message: error.message || '创建买单失败',
    })
  }
})
