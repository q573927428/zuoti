import type { TradingSymbol } from '../../../types/trading'
import { findBestTradingSymbol } from '../../utils/strategy'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const symbols = (query.symbols as string)?.split(',') as TradingSymbol[] || ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT']
    const amplitudeThreshold = Number(query.amplitudeThreshold) || 3.5
    const trendThreshold = Number(query.trendThreshold) || 5.0
    
    const result = await findBestTradingSymbol(
      symbols,
      amplitudeThreshold,
      trendThreshold
    )
    
    return result
  } catch (error) {
    console.error('分析交易对失败:', error)
    throw createError({
      statusCode: 500,
      message: '分析交易对失败',
    })
  }
})
