import type { TradingSymbol } from '../../../../types/trading'
import { createSellOrder } from '../../../utils/binance'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbol, price, amount } = body as { 
      symbol: TradingSymbol
      price: number
      amount: number
    }
    
    // 创建卖单
    const order = await createSellOrder(symbol, amount, price)
    
    return {
      success: true,
      order: {
        orderId: order.id,
        symbol,
        side: 'sell',
        price,
        amount,
        status: order.status === 'open' ? 'open' : 'closed',
        createdAt: Date.now(),
      }
    }
  } catch (error: any) {
    console.error('创建卖单失败:', error)
    throw createError({
      statusCode: 500,
      message: error.message || '创建卖单失败',
    })
  }
})
