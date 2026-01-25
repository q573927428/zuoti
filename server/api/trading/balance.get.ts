import { getBinanceInstance } from '../../utils/binance'

export default defineEventHandler(async (event) => {
  try {
    const binance = getBinanceInstance()
    
    // 尝试获取余额
    let balance
    try {
      balance = await binance.fetchBalance()
      
    } catch (apiError: any) {
      console.error('币安API余额获取失败:', apiError.message)
      
      // 如果是模拟交易环境，返回模拟数据
      console.log('返回模拟余额数据')
      return {
        success: true,
        balances: {
          USDT: { free: 0, used: 0, total: 0 },
          USDC: { free: 0, used: 0, total: 0 },
          BTC: { free: 0, used: 0, total: 0 },
          ETH: { free: 0, used: 0, total: 0 },
          BNB: { free: 0, used: 0, total: 0 },
          SOL: { free: 0, used: 0, total: 0 },
          XRP: { free: 0, used: 0, total: 0 },
          DOGE: { free: 0, used: 0, total: 0 },
        },
        isSimulated: true,
        message: '当前使用模拟余额数据（API不可用）'
      }
    }
    
    // 提取主要币种余额
    const currencies = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE']
    const result: Record<string, { free: number; used: number; total: number }> = {}
    
    for (const currency of currencies) {
      if (balance[currency]) {
        result[currency] = {
          free: balance[currency].free || 0,
          used: balance[currency].used || 0,
          total: balance[currency].total || 0,
        }
      } else {
        result[currency] = { free: 0, used: 0, total: 0 }
      }
    }
    
    return { success: true, balances: result, isSimulated: false }
  } catch (error: any) {
    console.error('获取账户余额失败:', error)
    
    // 如果完全失败，也返回模拟数据而不是抛出错误
    return {
      success: true,
      balances: {
        USDT: { free: 0, used: 0, total: 0 },
        USDC: { free: 0, used: 0, total: 0 },
        BTC: { free: 0, used: 0, total: 0 },
        ETH: { free: 0, used: 0, total: 0 },
        BNB: { free: 0, used: 0, total: 0 },
        SOL: { free: 0, used: 0, total: 0 },
        XRP: { free: 0, used: 0, total: 0 },
        DOGE: { free: 0, used: 0, total: 0 },
      },
      isSimulated: true,
      message: '当前使用模拟余额数据（API错误）'
    }
  }
})
