import type { TradingSymbol } from '../../../../types/trading'
import { cancelOrder } from '../../../utils/binance'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbol, orderId } = body as { symbol: TradingSymbol; orderId: string }
    
    if (!symbol || !orderId) {
      throw createError({
        statusCode: 400,
        message: '缺少symbol或orderId参数',
      })
    }
    
    await cancelOrder(symbol, orderId)
    
    return {
      success: true,
      message: '订单已取消',
    }
  } catch (error: any) {
    console.error('取消订单失败:', error)
    throw createError({
      statusCode: 500,
      message: error.message || '取消订单失败',
    })
  }
})
