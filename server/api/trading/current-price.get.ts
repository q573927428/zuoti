import type { TradingSymbol } from '../../../types/trading'
import { fetchCurrentPrice } from '../../utils/binance'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const symbol = query.symbol as TradingSymbol
    
    if (!symbol) {
      throw createError({
        statusCode: 400,
        message: '缺少symbol参数',
      })
    }
    
    const price = await fetchCurrentPrice(symbol)
    
    return {
      success: true,
      symbol,
      price,
    }
  } catch (error: any) {
    console.error('获取当前价格失败:', error)
    return {
      success: false,
      message: error.message || '获取当前价格失败',
      price: 0,
    }
  }
})
