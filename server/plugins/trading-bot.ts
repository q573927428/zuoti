import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { TradingSymbol, TradingStatus, TradeRecord, SystemConfig, SystemStats } from '../../types/trading'
import { findBestTradingSymbol, calculateBuyAmount, calculateProfit, checkProtection, checkOrderTimeout } from '../utils/strategy'
import { createBuyOrder, createSellOrder, fetchOrderStatus, cancelOrder, fetchCurrentPrice, getBinanceInstance, resetBinanceInstance, fetchBalance } from '../utils/binance'
import { getCurrentDate, getDateFromTimestamp } from '../utils/date'

// 全局状态
let tradingConfig: SystemConfig
let tradingStatus: TradingStatus
let tradeRecords: TradeRecord[]
let stats: SystemStats

// 并发锁 - 防止多个交易循环同时执行
let isTrading = false

// 数据文件路径
const DATA_DIR = join(process.cwd(), 'data')
const CONFIG_PATH = join(DATA_DIR, 'trading-config.json')  // 配置和统计
const DATA_PATH = join(DATA_DIR, 'trading-data.json')      // 交易记录和状态

/**
 * 加载持久化数据
 */
async function loadData() {
  try {
    // 加载配置和统计数据
    let configData
    try {
      const configFile = await readFile(CONFIG_PATH, 'utf-8')
      configData = JSON.parse(configFile)
    } catch (error) {
      console.log('未找到配置文件，使用默认配置')
      configData = {}
    }
    
    tradingConfig = configData.config || {
      isTestnet: false,
      isAutoTrading: false,
      symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'] as TradingSymbol[],
      investmentAmount: 100,
      amplitudeThreshold: 0.5,
      trendThreshold: 5.0,
      orderTimeout: 60 * 60 * 1000,
    }
    
    stats = configData.stats || {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      totalProfitRate: 0,
      annualizedReturn: 0,
      currentDate: getCurrentDate(),
      tradedSymbols: {},
    }
    
    // 加载交易数据和状态
    let tradingData
    try {
      const dataFile = await readFile(DATA_PATH, 'utf-8')
      tradingData = JSON.parse(dataFile)
    } catch (error) {
      console.log('未找到交易数据文件，初始化空数据')
      tradingData = {}
    }
    
    tradingStatus = tradingData.tradingStatus || {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    }
    
    tradeRecords = tradingData.tradeRecords || []
    
    // 重置币安实例以应用配置
    resetBinanceInstance()
    getBinanceInstance(tradingConfig.isTestnet)
    
    // console.log('✅ 交易数据加载成功', {
    //   isTestnet: tradingConfig.isTestnet,
    //   isAutoTrading: tradingConfig.isAutoTrading,
    //   currentState: tradingStatus.state
    // })
  } catch (error) {
    console.log('加载数据失败，使用默认配置')
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
    currentDate: getCurrentDate(),
    tradedSymbols: {},
  }
  
  await saveData()
}

/**
 * 保存数据（带重试机制）
 */
async function saveData(retryCount: number = 3) {
  let lastError: any
  
  for (let i = 0; i < retryCount; i++) {
    try {
      await mkdir(DATA_DIR, { recursive: true })
      
      // 保存配置和统计数据
      const configData = {
        config: tradingConfig,
        stats,
        lastSaved: Date.now(),
      }
      await writeFile(CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf-8')
      
      // 保存交易记录和状态
      const tradingData = {
        tradingStatus,
        tradeRecords,
        lastSaved: Date.now(),
      }
      await writeFile(DATA_PATH, JSON.stringify(tradingData, null, 2), 'utf-8')
      
      // 保存成功后验证
      const savedConfigData = await readFile(CONFIG_PATH, 'utf-8')
      const savedTradingData = await readFile(DATA_PATH, 'utf-8')
      JSON.parse(savedConfigData) // 验证JSON格式是否正确
      JSON.parse(savedTradingData) // 验证JSON格式是否正确
      
      if (i > 0) {
        console.log(`✅ 数据保存成功（重试 ${i} 次后）`)
      }
      return true
    } catch (error) {
      lastError = error
      console.error(`❌ 保存数据失败 (尝试 ${i + 1}/${retryCount}):`, error)
      
      if (i < retryCount - 1) {
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  }
  
  // 所有重试都失败
  console.error(`🚨 严重错误：数据保存失败，已重试 ${retryCount} 次`)
  console.error('最后错误:', lastError)
  console.error('⚠️  请立即检查磁盘空间和文件权限！当前状态可能未保存！')
  
  return false
}

/**
 * 检查并重置每日数据（严格日切处理）
 */
async function checkAndResetDaily() {
  const today = getCurrentDate()
  if (stats.currentDate !== today) {
    console.log(`📅 日期变更: ${stats.currentDate} -> ${today}`)
    console.log('⚠️  开始执行严格日切处理...')
    
    // 如果有进行中的交易，需要强制平仓和清理
    if (tradingStatus.state !== 'IDLE' && tradingStatus.state !== 'DONE') {
      console.log(`⚠️  检测到未完成交易，状态: ${tradingStatus.state}`)
      
      try {
        // 情况1: 买单已挂但未成交
        if (tradingStatus.state === 'BUY_ORDER_PLACED' && tradingStatus.buyOrder) {
          console.log('🔄 处理未成交买单...')
          
          // 查询订单状态
          const orderStatus = await fetchOrderStatus(tradingStatus.symbol!, tradingStatus.buyOrder.orderId)
          
          // 取消订单
          try {
            await cancelOrder(tradingStatus.symbol!, tradingStatus.buyOrder.orderId)
            console.log('✅ 买单已取消')
          } catch (error) {
            console.error('❌ 取消买单失败:', error)
          }
          
          // 如果有部分成交，需要立即市价卖出
          if (orderStatus.filled && orderStatus.filled > 0) {
            console.log(`⚠️  买单部分成交 ${orderStatus.filled}，立即市价卖出`)
            const currentPrice = await fetchCurrentPrice(tradingStatus.symbol!)
            try {
              await createSellOrder(tradingStatus.symbol!, orderStatus.filled, currentPrice * 0.999) // 低于市价0.1%确保成交
              console.log('✅ 日切强平卖单已提交')
            } catch (error) {
              console.error('❌ 日切强平失败:', error)
            }
          }
          
          // 标记交易为失败
          const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
          if (record) {
            record.status = 'failed'
            record.endTime = Date.now()
          }
          stats.failedTrades++
        }
        
        // 情况2: 已买入，卖单已挂但未成交
        else if (tradingStatus.state === 'SELL_ORDER_PLACED' && tradingStatus.sellOrder) {
          console.log('🔄 处理未成交卖单，准备强制平仓...')
          
          // 查询订单状态
          const orderStatus = await fetchOrderStatus(tradingStatus.symbol!, tradingStatus.sellOrder.orderId)
          
          // 取消卖单
          try {
            await cancelOrder(tradingStatus.symbol!, tradingStatus.sellOrder.orderId)
            console.log('✅ 卖单已取消')
          } catch (error) {
            console.error('❌ 取消卖单失败:', error)
          }
          
          // 计算剩余持仓
          const remainingAmount = tradingStatus.buyOrder!.amount - (orderStatus.filled || 0)
          
          if (remainingAmount > 0) {
            console.log(`⚠️  剩余持仓 ${remainingAmount}，立即市价强平`)
            const currentPrice = await fetchCurrentPrice(tradingStatus.symbol!)
            
            try {
              // 以略低于市价的价格提交卖单，确保成交
              await createSellOrder(tradingStatus.symbol!, remainingAmount, currentPrice * 0.999)
              console.log('✅ 日切强平卖单已提交')
              
              // 等待3秒查询是否成交
              await new Promise(resolve => setTimeout(resolve, 3000))
              
              // 计算强平后的收益
              const profitResult = calculateProfit(
                remainingAmount,
                tradingStatus.buyOrder!.price,
                currentPrice * 0.999
              )
              
              console.log(`📊 日切强平收益: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
              
              // 更新交易记录
              const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
              if (record) {
                record.profit = profitResult.profit
                record.profitRate = profitResult.profitRate
                record.status = 'completed'
                record.endTime = Date.now()
                record.sellPrice = currentPrice * 0.999
              }
              
              // 更新统计
              stats.successfulTrades++
              stats.totalProfit += profitResult.profit
            } catch (error) {
              console.error('❌ 日切强平失败:', error)
              // 标记为失败
              const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
              if (record) {
                record.status = 'failed'
                record.endTime = Date.now()
              }
              stats.failedTrades++
            }
          }
        }
        
        // 情况3: 已买入但未挂卖单
        else if (tradingStatus.state === 'BOUGHT' && tradingStatus.buyOrder) {
          console.log('🔄 检测到已买入但未挂卖单，立即市价强平')
          const currentPrice = await fetchCurrentPrice(tradingStatus.symbol!)
          
          try {
            await createSellOrder(tradingStatus.symbol!, tradingStatus.buyOrder.amount, currentPrice * 0.999)
            console.log('✅ 日切强平卖单已提交')
            
            // 等待3秒
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            const profitResult = calculateProfit(
              tradingStatus.buyOrder.amount,
              tradingStatus.buyOrder.price,
              currentPrice * 0.999
            )
            
            console.log(`📊 日切强平收益: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
            
            const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
            if (record) {
              record.profit = profitResult.profit
              record.profitRate = profitResult.profitRate
              record.status = 'completed'
              record.endTime = Date.now()
              record.sellPrice = currentPrice * 0.999
            }
            
            stats.successfulTrades++
            stats.totalProfit += profitResult.profit
          } catch (error) {
            console.error('❌ 日切强平失败:', error)
            const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
            if (record) {
              record.status = 'failed'
              record.endTime = Date.now()
            }
            stats.failedTrades++
          }
        }
      } catch (error) {
        console.error('❌ 日切处理失败:', error)
      }
    }
    
    // 重置状态
    console.log('✅ 日切处理完成，重置交易状态')
    tradingStatus = {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    }
    
    // 重置每日统计
    stats.currentDate = today
    stats.tradedSymbols = {}
    
    // 保存更新的日期
    await saveData()
    console.log('✅ 日切完成，系统已准备好新的一天')
  }
}

/**
 * 主交易循环
 */
async function tradingLoop() {
  // 并发锁 - 防止多个循环同时执行
  if (isTrading) {
    console.log('⏳ 上一个交易循环还在执行中，跳过本次')
    return
  }
  
  isTrading = true
  
  try {
    // 重新加载配置
    await loadData()
    
    // 检查日期
    await checkAndResetDaily()
    
    // 如果自动交易未开启，跳过
    if (!tradingConfig.isAutoTrading) {
      // console.log('⏸️  自动交易未开启，跳过')
      return
    }
    
    // console.log(`[${new Date().toLocaleTimeString()}] 交易状态: ${tradingStatus.state}`)
    
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
    console.error('❌ 交易循环错误:', error)
    // 记录详细错误信息用于排查
    console.error('错误详情:', {
      state: tradingStatus.state,
      symbol: tradingStatus.symbol,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
  } finally {
    // 无论成功还是失败，都要释放锁
    isTrading = false
  }
}

/**
 * 处理空闲状态 - 寻找交易机会
 */
async function handleIdleState() {
  try {
    // 检查今天是否已经完成过交易
    const today = getCurrentDate()
    const todayCompletedTrades = tradeRecords.filter(record => {
      const recordDate = getDateFromTimestamp(record.startTime)
      return recordDate === today && record.status === 'completed'
    })
    
    // 如果今天已经完成过交易，不再寻找新的交易机会
    if (todayCompletedTrades.length > 0) {
      console.log('⏹️  今天已完成一次交易，不再交易')
      return
    }
    
    console.log('🔍 正在分析市场，寻找交易机会...')
    
    const result = await findBestTradingSymbol(
      tradingConfig.symbols,
      tradingConfig.amplitudeThreshold,
      tradingConfig.trendThreshold
    )
    
    if (result.bestSymbol) {
      console.log(`✅ 找到交易机会: ${result.bestSymbol.symbol}, 振幅: ${result.bestSymbol.amplitude}%`)
      
      // ===== 安全检查 1: 余额验证 =====
      let balance
      try {
        balance = await fetchBalance()
        const usdtBalance = balance.free?.USDT || 0
        
        console.log(`💰 账户余额: ${usdtBalance.toFixed(2)} USDT`)
        
        // 检查余额是否充足（需要额外留 5% 作为手续费缓冲）
        const requiredAmount = tradingConfig.investmentAmount * 1.05
        if (usdtBalance < requiredAmount) {
          console.error(`❌ 余额不足！需要: ${requiredAmount.toFixed(2)} USDT, 可用: ${usdtBalance.toFixed(2)} USDT`)
          return
        }
      } catch (balanceError) {
        console.error('❌ 查询余额失败:', balanceError)
        return
      }
      
      // ===== 安全检查 2: 交易精度验证 =====
      let markets
      try {
        const binance = getBinanceInstance(tradingConfig.isTestnet)
        await binance.loadMarkets()
        markets = binance.markets
        
        const market = markets[result.bestSymbol.symbol]
        if (!market) {
          console.error(`❌ 未找到交易对 ${result.bestSymbol.symbol} 的市场信息`)
          return
        }
        
        // 获取交易对的限制
        const limits = market.limits
        const precision = market.precision
        
        console.log(`📊 ${result.bestSymbol.symbol} 交易限制:`, {
          minAmount: limits.amount?.min,
          maxAmount: limits.amount?.max,
          minCost: limits.cost?.min,
          amountPrecision: precision.amount,
          pricePrecision: precision.price
        })
        
        // 计算买入数量
        let amount = calculateBuyAmount(tradingConfig.investmentAmount, result.bestSymbol.buyPrice)
        
        // 根据精度调整数量（使用最小变动单位 stepSize）
        if (precision.amount) {
          // 方法：向下取整到最小变动单位的倍数
          amount = Math.floor(amount / precision.amount) * precision.amount
          // 保留足够的小数位数
          amount = parseFloat(amount.toFixed(8))
        }
        
        // 检查最小交易数量
        if (limits.amount?.min && amount < limits.amount.min) {
          console.error(`❌ 交易数量 ${amount} 小于最小限制 ${limits.amount.min}`)
          console.error(`💡 提示: 投资金额 ${tradingConfig.investmentAmount} USDT 太少，建议增加到 ${(limits.amount.min * result.bestSymbol.buyPrice * 1.1).toFixed(2)} USDT 以上`)
          return
        }
        
        // 检查最大交易数量
        if (limits.amount?.max && amount > limits.amount.max) {
          console.error(`❌ 交易数量 ${amount} 超过最大限制 ${limits.amount.max}`)
          return
        }
        
        // 检查最小交易金额（数量 * 价格）
        const totalCost = amount * result.bestSymbol.buyPrice
        if (limits.cost?.min && totalCost < limits.cost.min) {
          console.error(`❌ 交易金额 ${totalCost.toFixed(2)} USDT 小于最小限制 ${limits.cost.min} USDT`)
          console.error(`💡 提示: 建议将投资金额增加到 ${(limits.cost.min * 1.1).toFixed(2)} USDT 以上`)
          return
        }
        
        // 调整价格精度（使用价格的最小变动单位）
        let buyPrice = result.bestSymbol.buyPrice
        if (precision.price) {
          // 方法：向下取整到最小变动单位的倍数
          buyPrice = Math.floor(buyPrice / precision.price) * precision.price
          // 保留足够的小数位数
          buyPrice = parseFloat(buyPrice.toFixed(8))
        }
        
        console.log(`✅ 精度验证通过 - 数量: ${amount}, 价格: ${buyPrice}, 总额: ${totalCost.toFixed(2)} USDT`)
        
        // 创建买单
        const order = await createBuyOrder(result.bestSymbol.symbol, amount, buyPrice)
        
        // 使用调整后的值
        result.bestSymbol.buyPrice = buyPrice
        
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
        console.log(`💰 买单已挂: ${result.bestSymbol.symbol} @ ${result.bestSymbol.buyPrice}`)
      } catch (precisionError) {
        console.error('❌ 交易精度验证失败:', precisionError)
        return
      }
    } else {
      console.log('💤 未找到符合条件的交易机会')
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
    if (!tradingStatus.buyOrder || !tradingStatus.symbol) {
      console.error('⚠️  买单状态异常：缺少必要信息')
      return
    }
    
    // ===== 关键修复：先查询订单状态 =====
    let orderStatus
    try {
      orderStatus = await fetchOrderStatus(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
    } catch (error) {
      console.error('查询买单状态失败，网络异常，等待下次重试:', error)
      return // 网络异常时不做任何操作，等待下次循环重试
    }
    
    // 1. 检查订单是否已完全成交
    if (orderStatus.status === 'closed') {
      console.log(`✅ 买单已完全成交: ${tradingStatus.symbol}`)
      
      // 更新实际成交数量和价格（使用实际成交数据）
      if (orderStatus.filled) {
        tradingStatus.buyOrder.amount = orderStatus.filled
      }
      if (orderStatus.average) {
        tradingStatus.buyOrder.price = orderStatus.average
      }
      
      tradingStatus.buyOrder.status = 'closed'
      tradingStatus.buyOrder.filledAt = Date.now()
      tradingStatus.state = 'BOUGHT'
      await saveData()
      
      console.log(`💎 持仓信息: ${tradingStatus.buyOrder.amount} ${tradingStatus.symbol} @ ${tradingStatus.buyOrder.price}`)
      return
    }
    
    // 2. 检查订单是否已被取消
    if (orderStatus.status === 'canceled') {
      console.log(`⚠️  买单已被取消: ${tradingStatus.symbol}`)
      
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
    
    // 3. 订单仍在等待成交 - 检查是否需要取消
    
    // 检查保护机制（价格突破原区间）
    const currentPrice = await fetchCurrentPrice(tradingStatus.symbol)
    const protection = checkProtection(currentPrice, tradingStatus.high!, tradingStatus.low!)
    
    if (protection.needProtection) {
      console.log(`⚠️  触发保护机制: ${protection.reason}`)
      console.log(`💡 当前价格: ${currentPrice}, 原区间: [${tradingStatus.low}, ${tradingStatus.high}]`)
      
      // 检查是否有部分成交
      if (orderStatus.filled && orderStatus.filled > 0) {
        console.log(`⚠️  订单部分成交 ${orderStatus.filled}/${orderStatus.amount}，取消剩余部分`)
      }
      
      try {
        await cancelOrder(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
        console.log('✅ 买单已取消')
      } catch (cancelError) {
        console.error('取消买单失败:', cancelError)
        // 即使取消失败，也标记为失败状态
      }
      
      // 如果有部分成交，需要特殊处理
      if (orderStatus.filled && orderStatus.filled > 0) {
        console.log(`⚠️  部分成交处理：持有 ${orderStatus.filled} ${tradingStatus.symbol}，需要手动处理`)
        // 记录部分成交信息
        tradingStatus.buyOrder.amount = orderStatus.filled
        tradingStatus.buyOrder.status = 'closed'
        tradingStatus.state = 'BOUGHT' // 进入已买入状态，尝试卖出
        await saveData()
      } else {
        // 完全未成交，标记为失败
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
      }
      return
    }
    
    // 检查超时
    const isTimeout = checkOrderTimeout(tradingStatus.buyOrder.createdAt, tradingConfig.orderTimeout)
    if (isTimeout) {
      console.log(`⏱️  买单超时 (${tradingConfig.orderTimeout / 1000}秒)，准备取消订单`)
      
      // 检查是否有部分成交
      if (orderStatus.filled && orderStatus.filled > 0) {
        console.log(`⚠️  订单部分成交 ${orderStatus.filled}/${orderStatus.amount}，取消剩余部分`)
      }
      
      try {
        await cancelOrder(tradingStatus.symbol, tradingStatus.buyOrder.orderId)
        console.log('✅ 超时买单已取消')
      } catch (cancelError) {
        console.error('取消超时买单失败:', cancelError)
      }
      
      // 如果有部分成交，进入已买入状态
      if (orderStatus.filled && orderStatus.filled > 0) {
        tradingStatus.buyOrder.amount = orderStatus.filled
        tradingStatus.buyOrder.status = 'closed'
        tradingStatus.state = 'BOUGHT'
        await saveData()
      } else {
        // 完全未成交，标记为失败
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
      }
      return
    }
    
    // 订单仍在等待，继续监控
    console.log(`⏳ 买单等待成交中: ${tradingStatus.symbol} ${orderStatus.filled || 0}/${orderStatus.amount}`)
    
  } catch (error) {
    console.error('❌ 处理买单状态失败:', error)
    console.error('详细信息:', {
      symbol: tradingStatus.symbol,
      orderId: tradingStatus.buyOrder?.orderId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * 处理已买入状态 - 挂卖单
 */
async function handleBoughtState() {
  try {
    if (!tradingStatus.symbol || !tradingStatus.buyOrder) return
    
    // ===== 优先检查硬止损 =====
    const currentPrice = await fetchCurrentPrice(tradingStatus.symbol)
    const lossRate = ((currentPrice - tradingStatus.buyOrder.price) / tradingStatus.buyOrder.price) * 100
    const STOP_LOSS_THRESHOLD = -3 // -3% 硬止损
    
    if (lossRate <= STOP_LOSS_THRESHOLD) {
      console.log(`🛑 触发硬止损（已买入状态）！`)
      console.log(`💡 买入价: ${tradingStatus.buyOrder.price}, 当前价: ${currentPrice}, 亏损: ${lossRate.toFixed(2)}%`)
      
      try {
        console.log('⚠️  正在执行市价止损...')
        await createSellOrder(tradingStatus.symbol, tradingStatus.buyOrder.amount, currentPrice * 0.998)
        console.log('✅ 止损卖单已提交')
        
        // 等待3秒确认成交
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 计算止损后的亏损
        const profitResult = calculateProfit(
          tradingStatus.buyOrder.amount,
          tradingStatus.buyOrder.price,
          currentPrice * 0.998
        )
        
        console.log(`📊 止损完成，亏损: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
        
        // 更新交易记录
        const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
        if (record) {
          record.profit = profitResult.profit
          record.profitRate = profitResult.profitRate
          record.status = 'completed'
          record.endTime = Date.now()
          record.sellPrice = currentPrice * 0.998
        }
        
        // 更新统计
        stats.successfulTrades++
        stats.totalProfit += profitResult.profit
        
        tradingStatus.state = 'DONE'
        await saveData()
        return
      } catch (error) {
        console.error('❌ 止损执行失败:', error)
        // 即使失败也继续尝试正常挂单
      }
    }
    
    // 重新分析市场，获取卖出价
    const result = await findBestTradingSymbol(
      [tradingStatus.symbol],
      tradingConfig.amplitudeThreshold,
      tradingConfig.trendThreshold
    )
    
    if (!result.bestSymbol) {
      console.log('⏳ 无法获取卖出价格，等待下次循环')
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
    
    console.log(`💰 卖单已挂: ${tradingStatus.symbol} @ ${result.bestSymbol.sellPrice}`)
  } catch (error) {
    console.error('处理已买入状态失败:', error)
  }
}

/**
 * 处理卖单已挂状态 - 监控卖单是否成交
 */
async function handleSellOrderPlacedState() {
  try {
    if (!tradingStatus.sellOrder || !tradingStatus.symbol || !tradingStatus.buyOrder) {
      console.error('⚠️  卖单状态异常：缺少必要信息')
      return
    }
    
    // ===== 关键修复：先查询订单状态 =====
    let orderStatus
    try {
      orderStatus = await fetchOrderStatus(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
    } catch (error) {
      console.error('查询卖单状态失败，网络异常，等待下次重试:', error)
      return // 网络异常时不做任何操作，等待下次循环重试
    }
    
    // 1. 检查订单是否已完全成交
    if (orderStatus.status === 'closed') {
      console.log(`✅ 卖单已完全成交: ${tradingStatus.symbol}`)
      
      // 使用实际成交价格计算收益
      const actualSellPrice = orderStatus.average || tradingStatus.sellOrder.price
      const actualAmount = orderStatus.filled || tradingStatus.buyOrder.amount
      
      // 计算收益
      const profitResult = calculateProfit(
        actualAmount,
        tradingStatus.buyOrder.price,
        actualSellPrice
      )
      
      // 更新交易记录
      const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
      if (record) {
        record.profit = profitResult.profit
        record.profitRate = profitResult.profitRate
        record.status = 'completed'
        record.endTime = Date.now()
        // 更新实际成交价格
        record.sellPrice = actualSellPrice
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
      
      console.log(`🎉 交易完成! 收益: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
      
      tradingStatus.state = 'DONE'
      await saveData()
      return
    }
    
    // 2. 检查订单是否已被取消
    if (orderStatus.status === 'canceled') {
      console.log(`⚠️  卖单已被取消: ${tradingStatus.symbol}，回到已买入状态`)
      
      // 回到已买入状态，等待重新挂卖单
      tradingStatus.state = 'BOUGHT'
      tradingStatus.sellOrder = undefined
      await saveData()
      return
    }
    
    // 3. 订单仍在等待成交 - 检查是否需要取消
    
    // 检查价格保护机制（防止市价大幅偏离卖单价）
    const currentPrice = await fetchCurrentPrice(tradingStatus.symbol)
    
    // ===== 硬止损检查（优先级最高）=====
    const lossRate = ((currentPrice - tradingStatus.buyOrder.price) / tradingStatus.buyOrder.price) * 100
    const STOP_LOSS_THRESHOLD = -3 // -3% 硬止损
    
    if (lossRate <= STOP_LOSS_THRESHOLD) {
      console.log(`🛑 触发硬止损！`)
      console.log(`💡 买入价: ${tradingStatus.buyOrder.price}, 当前价: ${currentPrice}, 亏损: ${lossRate.toFixed(2)}%`)
      
      // 取消原卖单
      try {
        await cancelOrder(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
        console.log('✅ 原卖单已取消')
      } catch (cancelError) {
        console.error('❌ 取消卖单失败:', cancelError)
      }
      
      // 立即以市价止损
      try {
        console.log('⚠️  正在执行市价止损...')
        await createSellOrder(tradingStatus.symbol, tradingStatus.buyOrder.amount, currentPrice * 0.998) // 略低于市价确保成交
        console.log('✅ 止损卖单已提交')
        
        // 等待3秒确认成交
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 计算止损后的亏损
        const profitResult = calculateProfit(
          tradingStatus.buyOrder.amount,
          tradingStatus.buyOrder.price,
          currentPrice * 0.998
        )
        
        console.log(`📊 止损完成，亏损: ${profitResult.profit.toFixed(2)} USDT (${profitResult.profitRate.toFixed(2)}%)`)
        
        // 更新交易记录
        const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
        if (record) {
          record.profit = profitResult.profit
          record.profitRate = profitResult.profitRate
          record.status = 'completed'
          record.endTime = Date.now()
          record.sellPrice = currentPrice * 0.998
        }
        
        // 更新统计
        stats.successfulTrades++
        stats.totalProfit += profitResult.profit
        
        tradingStatus.state = 'DONE'
        await saveData()
        return
      } catch (error) {
        console.error('❌ 止损执行失败:', error)
        // 继续后续检查
      }
    }
    
    // 如果当前价格跌破原买入区间的下界，说明市场反转，需要及时止损
    if (tradingStatus.low && currentPrice < tradingStatus.low) {
      console.log(`⚠️  市场反转保护: 当前价格 ${currentPrice} 已跌破原区间下界 ${tradingStatus.low}`)
      console.log(`💡 立即取消高位卖单，准备以市价附近重新挂单`)
      
      // 检查是否有部分成交
      if (orderStatus.filled && orderStatus.filled > 0) {
        console.log(`⚠️  卖单部分成交 ${orderStatus.filled}/${orderStatus.amount}`)
      }
      
      try {
        await cancelOrder(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
        console.log('✅ 卖单已取消')
      } catch (cancelError) {
        console.error('取消卖单失败:', cancelError)
      }
      
      // 回到已买入状态，下次循环会重新分析市场并挂卖单
      tradingStatus.state = 'BOUGHT'
      tradingStatus.sellOrder = undefined
      await saveData()
      return
    }
    
    // 检查卖单价格是否过高（与当前市价偏离超过 2%）
    const priceDeviation = ((tradingStatus.sellOrder.price - currentPrice) / currentPrice) * 100
    if (priceDeviation > 2) {
      console.log(`⚠️  卖单价格偏离过大: 挂单价 ${tradingStatus.sellOrder.price}, 当前价 ${currentPrice}, 偏离 ${priceDeviation.toFixed(2)}%`)
      console.log(`💡 取消卖单，重新以合理价格挂单`)
      
      try {
        await cancelOrder(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
        console.log('✅ 偏离卖单已取消')
      } catch (cancelError) {
        console.error('取消偏离卖单失败:', cancelError)
      }
      
      // 回到已买入状态
      tradingStatus.state = 'BOUGHT'
      tradingStatus.sellOrder = undefined
      await saveData()
      return
    }
    
    // 检查超时
    const isTimeout = checkOrderTimeout(tradingStatus.sellOrder.createdAt, tradingConfig.orderTimeout)
    if (isTimeout) {
      console.log(`⏱️  卖单超时 (${tradingConfig.orderTimeout / 1000}秒)，准备取消订单`)
      
      // 检查是否有部分成交
      if (orderStatus.filled && orderStatus.filled > 0) {
        console.log(`⚠️  卖单部分成交 ${orderStatus.filled}/${orderStatus.amount}，取消剩余部分`)
      }
      
      try {
        await cancelOrder(tradingStatus.symbol, tradingStatus.sellOrder.orderId)
        console.log('✅ 超时卖单已取消')
      } catch (cancelError) {
        console.error('取消超时卖单失败:', cancelError)
      }
      
      // 处理部分成交情况
      if (orderStatus.filled && orderStatus.filled > 0) {
        console.log(`⚠️  部分成交处理：已卖出 ${orderStatus.filled}，剩余 ${orderStatus.amount - orderStatus.filled}`)
        // 如果大部分已成交（>80%），标记交易完成
        const filledPercent = (orderStatus.filled / orderStatus.amount) * 100
        if (filledPercent > 80) {
          console.log(`✅ 已成交 ${filledPercent.toFixed(2)}%，视为完成`)
          
          const actualSellPrice = orderStatus.average || tradingStatus.sellOrder.price
          const profitResult = calculateProfit(
            orderStatus.filled,
            tradingStatus.buyOrder.price,
            actualSellPrice
          )
          
          const record = tradeRecords.find(r => r.id === tradingStatus.currentTradeId)
          if (record) {
            record.profit = profitResult.profit
            record.profitRate = profitResult.profitRate
            record.status = 'completed'
            record.endTime = Date.now()
          }
          
          stats.successfulTrades++
          stats.totalProfit += profitResult.profit
          
          tradingStatus.state = 'DONE'
        } else {
          // 仍有较多未成交，回到已买入状态重新挂单
          tradingStatus.buyOrder.amount = orderStatus.amount - orderStatus.filled
          tradingStatus.state = 'BOUGHT'
          tradingStatus.sellOrder = undefined
        }
      } else {
        // 完全未成交，回到已买入状态
        tradingStatus.state = 'BOUGHT'
        tradingStatus.sellOrder = undefined
      }
      
      await saveData()
      return
    }
    
    // 订单仍在等待，继续监控
    console.log(`⏳ 卖单等待成交中: ${tradingStatus.symbol} ${orderStatus.filled || 0}/${orderStatus.amount}`)
    
  } catch (error) {
    console.error('❌ 处理卖单状态失败:', error)
    console.error('详细信息:', {
      symbol: tradingStatus.symbol,
      orderId: tradingStatus.sellOrder?.orderId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Server Plugin - 在服务器启动时自动运行
 */
export default defineNitroPlugin((nitroApp) => {
  console.log('🤖 交易机器人插件正在初始化...')
  
  // 初始加载数据
  loadData().then(() => {
    console.log('🚀 交易机器人已启动！')
    console.log(`⚙️  自动交易: ${tradingConfig?.isAutoTrading ? '✅ 开启' : '❌ 关闭'}`)
    console.log(`📊 当前状态: ${tradingStatus?.state}`)
    
    // 立即执行一次交易循环
    tradingLoop()
    
    // 每30秒执行一次交易循环
    setInterval(async () => {
      await tradingLoop()
    }, 30000)
  })
})
