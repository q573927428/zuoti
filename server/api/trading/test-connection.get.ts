import { getBinanceInstance } from '../../utils/binance'

export default defineEventHandler(async (event) => {
  try {
    const binance = getBinanceInstance()
    
    // 测试连接 - 获取服务器时间
    const serverTime = await binance.fetchTime()
    
    // 测试获取ticker
    const ticker = await binance.fetchTicker('BTC/USDT')
    
    return {
      success: true,
      message: '币安API连接成功',
      serverTime,
      testPrice: ticker.last,
      testSymbol: 'BTC/USDT',
    }
  } catch (error: any) {
    console.error('测试连接失败:', error)
    return {
      success: false,
      message: error.message || '连接失败',
      error: error.toString(),
    }
  }
})
