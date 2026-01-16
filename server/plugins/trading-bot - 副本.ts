import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { TradingSymbol, TradingStatus, TradeRecord, SystemConfig, SystemStats } from '../../types/trading'
import { findBestTradingSymbol, calculateBuyAmount, calculateProfit, checkProtection, checkOrderTimeout } from '../utils/strategy'
import { createBuyOrder, createSellOrder, fetchOrderStatus, cancelOrder, fetchCurrentPrice, getBinanceInstance, resetBinanceInstance } from '../utils/binance'

// 全局状态
let tradingConfig: SystemConfig
let tradingStatus: TradingStatus
let tradeRecords: TradeRecord[]
let stats: SystemStats

// 数据文件路径
const DATA_DIR = join(process.cwd(), 'data')
const DATA_PATH = join(DATA_DIR, 'trading-data.json')

/**
 * 加载持久化数据
 */
async function loadData() {
  try {
    const data = await readFile(DATA_PATH, 'utf-8')
    const parsed = JSON.parse(data)
    
    tradingConfig = parsed.config || {
      isTestnet: false,
      isAutoTrading: false,
      symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'] as TradingSymbol[],
      investmentAmount: 100,
      amplitudeThreshold: 0.5,
      trendThreshold: 5.0,
      orderTimeout: 60 * 60 * 1000,
    }
    
    tradingStatus = parsed.tradingStatus || {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    }
    
    tradeRecords = parsed.tradeRecords || []
    
    stats = parsed.stats || {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      totalProfitRate: 0,
      annualizedReturn: 0,
      currentDate: new Date().toISOString().split('T')[0],
      tradedSymbols: {},
    }
    
    // 重置币安实例以应用配置
    resetBinanceInstance()
    getBinanceInstance(tradingConfig.isTestnet)
    
    console.log('交易数据加载成功')
  } catch (error) {
    console.log('未找到数据文件，使用默认配置')
    await initializeData()
  }
}

/**
 * 初始化数据
 */
async function initializeData() {
  tradingConfig = {
    isTestnet: false,
    isAutoTrading: false,
    symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'] as TradingSymbol[],
    investmentAmount: 100,
    amplitudeThreshold: 0.5,
    trendThreshold: 5.0,
    orderTimeout: 60 * 60 * 1000,
  }
  
  tradingStatus = {
    state: 'IDLE',
    lastUpdateTime: Date.now(),
  }
  
  tradeRecords = []
  
  stats = {
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfit: 0,
    totalProfitRate: 0,
    annualizedReturn: 0,
    currentDate: new Date().toISOString().split('T')[0],
    tradedSymbols: {},
  }
  
  await saveData()
}

/**
 * 保存数据
 */
async function saveData() {
  try {
    await mkdir(DATA_DIR, { recursive: true })
    const data = {
      config: tradingConfig,
      tradingStatus,
      tradeRecords,
      stats,
    }
    await writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('保存数据失败:', error)
  }
}

/**
 * 检查并重置每日数据
 */
function checkAndResetDaily() {
  const today = new Date().toISOString().split('T')[0]
  if (stats.currentDate !== today) {
    console.log(`日期变更: ${stats.currentDate} -> ${today}`)
    stats.currentDate = today
    stats.tradedSymbols = {}
    
    // 如果有进行中的交易，重置状态
    if (tradingStatus.state !== 'IDLE' && tradingStatus.state !== 'DONE') {
      console.log('重置未完成的交易状态')
      tradingStatus = {
        state: 'IDLE',
        lastUpdateTime: Date.now(),
      }
    }
  }
}

/**
 * 主交易循环
 */
async function tradingLoop() {
  try {
    // 重新加载配置
    await loadData()
    
    // 检查日期
    checkAndResetDaily()
    
    // 如果自动交易未开启，跳过
    if (!tradingConfig.isAutoTrading) {
      return
    }
    
    console.log(`[${new Date().toLocaleString()}] 交易状态: ${tradingStatus.state}`)
    
    // 根据状态执行不同操作
    switch (tradingStatus.state) {
      case 'IDLE':
        await handleIdleState()
        break
      case 'BUY_ORDER_PLACED':
        await handleBuyOrderPlacedState()
        break
      case 'BOUGHT':
        await handleBoughtState()
        break
      case 'SELL_ORDER_PLACED':
        await handleSellOrderPlacedState()
        break
      case 'DONE':
        // 完成状态，重置为IDLE
        tradingStatus.state = 'IDLE'
        tradingStatus.symbol = undefined
        tradingStatus.currentTradeId = undefined
        tradingStatus.buyOrder = undefined
        tradingStatus.sellOrder = undefined
        await saveData()
        break
    }
  } catch (error) {
    console.error('交易循环错误:', error)
  }
}

/**
 * 处理空闲状态 - 寻找交易机会
 */
async function handleIdleState() {
  try {
    // 检查今天是否已经完成过交易
    const today = new Date().toISOString().split('T')[0]
    const todayCompletedTrades = tradeRecords.filter(record => {
      const recordDate = new Date(record.startTime).toISOString().split('T')[0]
      return recordDate === today && record.status === 'completed'
    })
    
    // 如果今天已经完成过交易，不再寻找新的交易机会
    if (todayCompletedTrades.length > 0) {
      console.log('今天已完成一次交易，不再交易')
      return
    }
    
    const result = await findBestTradingSymbol(
      tradingConfig.symbols,
      tradingConfig.amplitudeThreshold,
      tradingConfig.trendThreshold
    )
    
    if (result.bestSymbol) {
      console.log(`找到交易机会: ${result.bestSymbol.symbol}, 振幅: ${result.bestSymbol.amplitude}%`)
      
      // 计算买入数量
      const amount = calculateBuyAmount(tradingConfig.investmentAmount, result.bestSymbol.buyPrice)
      
      // 创建买单
      const order = await createBuyOrder(result.bestSymbol.symbol, amount, result.bestSymbol.buyPrice)
      
      // 创建交易记录
      const tradeId = `trade_${Date.now()}`
      const tradeRecord: TradeRecord = {
        id: tradeId,
        symbol: result.bestSymbol.symbol,
        buyOrderId: order.id,
        buyPrice: result.bestSymbol.buyPrice,
        amount,
        startTime: Date.now(),
        status: 'in_progress',
      }
      
      tradeRecords.push(tradeRecord)
      stats.totalTrades++
      
      if (!stats.tradedSymbols[result.bestSymbol.symbol]) {
        stats.tradedSymbols[result.bestSymbol.symbol] = 0
      }
      stats.tradedSymbols[result.bestSymbol.symbol]++
      
      // 更新状态
      tradingStatus = {
        state: 'BUY_ORDER_PLACED',
        symbol: result.bestSymbol.symbol,
        currentTradeId: tradeId,
        buyOrder: {
          orderId: order.id,
          symbol: result.bestSymbol.symbol,
          side: 'buy',
          price: result.bestSymbol.buyPrice,
          amount,
          status: 'open',
          createdAt: Date.now(),
        },
        lastUpdateTime: Date.now(),
      }
      
      // 保存高低价信息（用于保护机制）
      tradingStatus.high = result.bestSymbol.high
      tradingStatus.low = result.bestSymbol.low
      
      await saveData()
      console.log(`买单已挂: ${result.bestSymbol.symbol} @ ${result.bestSymbol.buyPrice}`)
    }
  } catch (error) {
    console.error('处理空闲状态失败:', error)
  }
}

/**
 * 处理买单已挂状态 - 监控买单是否成交
 */
async function handleBuyOrderPlacedState() {
  try {
    if (!tradingStatus.buyOrder || !tradingStatus.symbol) return
    
    // 检查保护机制
    const currentPrice = await fetchCurrentPrice(tradingStatus.symbol)
    const protection = checkProtection(currentPrice, tradingStatus.high!, tradingStatus.low!)
    
    if (protection.needProtection) {
      console.log(`触发保护机制: ${protection.reason}`)
      await cancelOrder(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
      
      // 更新交易记录
      const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
      if (record) {
        record.status = 'failed'
        record.endTime = Date.now()
      }
      stats.failedTrades++
      
      tradingStatus.state = 'IDLE'
      tradingStatus.symbol = undefined
      tradingStatus.currentTradeId = undefined
      tradingStatus.buyOrder = undefined
      await saveData()
      return
    }
    
    // 检查超时
    const isTimeout = checkOrderTimeout(tradingStatus.buyOrder.createdAt, tradingConfig.orderTimeout)
    if (isTimeout) {
      console.log('买单超时，取消订单')
      await cancelOrder(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
      
      // 更新交易记录
      const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
      if (record) {
        record.status = 'failed'
        record.endTime = Date.now()
      }
      stats.failedTrades++
      
      tradingStatus.state = 'IDLE'
      tradingStatus.symbol = undefined
      tradingStatus.currentTradeId = undefined
      tradingStatus.buyOrder = undefined
      await saveData()
      return
    }
    
    // 查询订单状态
    const orderStatus = await fetchOrderStatus(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
    
    if (orderStatus.status === 'closed') {
      console.log(`买单已成交: ${tradingStatus.symbol}`)
      tradingStatus.buyOrder.status = 'closed'
      tradingStatus.buyOrder.filledAt = Date.now()
      tradingStatus.state = 'BOUGHT'
      await saveData()
    }
  } catch (error) {
    console.error('处理买单状态失败:', error)
  }
}

/**
 * 处理已买入状态 - 挂卖单
 */
async function handleBoughtState() {
  try {
    if (!tradingStatus.symbol || !tradingStatus.buyOrder) return
    
    // 重新分析市场，获取卖出价
    const result = await findBestTradingSymbol(
      [tradingStatus.symbol],
      tradingConfig.amplitudeThreshold,
      tradingConfig.trendThreshold
    )
    
    if (!result.bestSymbol) {
      console.log('无法获取卖出价格，等待下次循环')
      return
    }
    
    // 创建卖单
    const order = await createSellOrder(
      tradingStatus.symbol,
      tradingStatus.buyOrder.amount,
      result.bestSymbol.sellPrice
    )
    
    // 更新交易记录
    const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
    if (record) {
      record.sellOrderId = order.id
      record.sellPrice = result.bestSymbol.sellPrice
    }
    
    // 更新状态
    tradingStatus.sellOrder = {
      orderId: order.id,
      symbol: tradingStatus.symbol,
      side: 'sell',
      price: result.bestSymbol.sellPrice,
      amount: tradingStatus.buyOrder.amount,
      status: 'open',
      createdAt: Date.now(),
    }
    tradingStatus.state = 'SELL_ORDER_PLACED'
    await saveData()
    
    console.log(`卖单已挂: ${tradingStatus.symbol} @ ${result.bestSymbol.sellPrice}`)
  } catch (error) {
    console.error('处理已买入状态失败:', error)
  }
}

/**
 * 处理卖单已挂状态 - 监控卖单是否成交
 */
async function handleSellOrderPlacedState() {
  try {
    if (!tradingStatus.sellOrder || !tradingStatus.symbol || !tradingStatus.buyOrder) return
    
    // 检查超时
    const isTimeout = checkOrderTimeout(tradingStatus.sellOrder.createdAt, tradingConfig.orderTimeout)
    if (isTimeout) {
      console.log('卖单超时，取消订单')
      await cancelOrder(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
      
      // 回到已买入状态，等待重新挂卖单
      tradingStatus.state = 'BOUGHT'
      tradingStatus.sellOrder = undefined
      await saveData()
      return
    }
    
    // 查询订单状态
    const orderStatus = await fetchOrderStatus(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
    
    if (orderStatus.status === 'closed') {
      console.log(`卖单已成交: ${tradingStatus.symbol}`)
      
      // 计算收益
      const profitResult = calculateProfit(
        tradingStatus.buyOrder.amount,
        tradingStatus.buyOrder.price,
        tradingStatus.sellOrder.price
      )
      
      // 更新交易记录
      const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
      if (record) {
        record.profit = profitResult.profit
        record.profitRate = profitResult.profitRate
        record.status = 'completed'
        record.endTime = Date.now()
      }
      
      // 更新统计
      stats.successfulTrades++
      stats.totalProfit += profitResult.profit
      
      const completedTrades = tradeRecords.filter(r => r.status === 'completed')
      if (completedTrades.length > 0) {
        const totalInvested = completedTrades.length * tradingConfig.investmentAmount
        stats.totalProfitRate = (stats.totalProfit / totalInvested) * 100
        
        const firstTrade = completedTrades[0]
        const daysActive = Math.max(1, Math.ceil((Date.now() - firstTrade.startTime) / (24 * 60 * 60 * 1000)))
        const dailyReturn = stats.totalProfitRate / daysActive
        stats.annualizedReturn = dailyReturn * 365
      }
      
      console.log(`交易完成! 收益: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
      
      tradingStatus.state = 'DONE'
      await saveData()
    }
  } catch (error) {
    console.error('处理卖单状态失败:', error)
  }
}

/**
 * 主函数 - Nitro任务入口
 */
export default defineTask({
  meta: {
    name: 'trading-bot',
    description: '自动交易机器人',
  },
  async run() {
    console.log('交易机器人启动...')
    
    // 初始加载数据
    await loadData()
    
    // 每30秒执行一次交易循环
    setInterval(async () => {
      await tradingLoop()
    }, 30000)
    
    // 立即执行一次
    await tradingLoop()
    
    return { result: '交易机器人已启动' }
  },
})
