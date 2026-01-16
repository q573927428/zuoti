import type { TradingSymbol } from '../../../../types/trading'
import { fetchOrderStatus } from '../../../utils/binance'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { symbol, orderId } = query as { symbol: TradingSymbol; orderId: string }
    
    if (!symbol || !orderId) {
      throw createError({
        statusCode: 400,
        message: '缺少symbol或orderId参数',
      })
    }
    
    const order = await fetchOrderStatus(symbol, orderId)
    
    return {
      success: true,
      order: {
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        price: order.price,
        amount: order.amount,
        filled: order.filled,
        status: order.status === 'closed' ? 'closed' : order.status === 'canceled' ? 'canceled' : 'open',
      }
    }
  } catch (error: any) {
    console.error('查询订单状态失败:', error)
    throw createError({
      statusCode: 500,
      message: error.message || '查询订单状态失败',
    })
  }
})
