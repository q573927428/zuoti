import * as ccxt from 'ccxt'
import type { TradingSymbol, Kline } from '../../types/trading'

let binanceInstance: ccxt.binance | null = null

/**
 * 获取币安交易所实例
 */
export function getBinanceInstance(isTestnet: boolean = false): ccxt.binance {
  const config = useRuntimeConfig()

  // 每次都重新创建实例，确保使用最新的配置
  binanceInstance = new ccxt.binance({
    apiKey: config.binanceApiKey,
    secret: config.binanceSecret,
    enableRateLimit: true,
    options: {
      defaultType: 'spot', // 现货交易
    }
  })

  // 设置是否使用模拟交易
  if (isTestnet) {
    // console.log('使用币安模拟交易环境');
    binanceInstance.setSandboxMode(true)
  }

  return binanceInstance
}

/**
 * 重置币安实例（用于切换模拟/真实交易）
 */
export function resetBinanceInstance() {
  binanceInstance = null
}

/**
 * 获取K线数据
 * @param symbol 交易对
 * @param timeframe K线周期
 * @param limit 数量
 */
export async function fetchKlines(
  symbol: TradingSymbol,
  timeframe: string = '15m',
  limit: number = 24
): Promise<Kline[]> {
  try {
    const binance = getBinanceInstance()
    await binance.loadMarkets()
    const ohlcv = await binance.fetchOHLCV(symbol, timeframe, undefined, limit)
    
    return ohlcv.map((candle) => ({
      timestamp: candle[0] as number,
      open: candle[1] as number,
      high: candle[2] as number,
      low: candle[3] as number,
      close: candle[4] as number,
      volume: candle[5] as number,
    }))
  } catch (error) {
    console.error(`获取${symbol} K线数据失败:`, error)
    throw error
  }
}

/**
 * 获取当前价格
 */
export async function fetchCurrentPrice(symbol: TradingSymbol): Promise<number> {
  try {
    const binance = getBinanceInstance()
    const ticker = await binance.fetchTicker(symbol)
    return ticker.last || 0
  } catch (error) {
    console.error(`获取${symbol}当前价格失败:`, error)
    throw error
  }
}

/**
 * 创建限价买单
 */
export async function createBuyOrder(
  symbol: TradingSymbol,
  amount: number,
  price: number
): Promise<any> {
  try {
    const binance = getBinanceInstance()
    const order = await binance.createLimitBuyOrder(symbol, amount, price)
    console.log(`创建买单成功: ${symbol} 数量:${amount} 价格:${price}`, order)
    return order
  } catch (error) {
    console.error(`创建买单失败: ${symbol}`, error)
    throw error
  }
}

/**
 * 创建限价卖单
 */
export async function createSellOrder(
  symbol: TradingSymbol,
  amount: number,
  price: number
): Promise<any> {
  try {
    const binance = getBinanceInstance()
    const order = await binance.createLimitSellOrder(symbol, amount, price)
    console.log(`创建卖单成功: ${symbol} 数量:${amount} 价格:${price}`, order)
    return order
  } catch (error) {
    console.error(`创建卖单失败: ${symbol}`, error)
    throw error
  }
}

/**
 * 查询订单状态
 */
export async function fetchOrderStatus(symbol: TradingSymbol, orderId: string): Promise<any> {
  try {
    const binance = getBinanceInstance()
    const order = await binance.fetchOrder(orderId, symbol)
    return order
  } catch (error) {
    console.error(`查询订单状态失败: ${orderId}`, error)
    throw error
  }
}

/**
 * 取消订单
 */
export async function cancelOrder(symbol: TradingSymbol, orderId: string): Promise<any> {
  try {
    const binance = getBinanceInstance()
    const result = await binance.cancelOrder(orderId, symbol)
    console.log(`取消订单成功: ${orderId}`, result)
    return result
  } catch (error) {
    console.error(`取消订单失败: ${orderId}`, error)
    throw error
  }
}

/**
 * 获取账户余额
 */
export async function fetchBalance(): Promise<any> {
  try {
    const binance = getBinanceInstance()
    const balance = await binance.fetchBalance()
    return balance
  } catch (error) {
    console.error('获取账户余额失败:', error)
    // throw error
  }
}
