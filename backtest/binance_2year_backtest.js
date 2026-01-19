const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

/**
 * =====================
 * 基础参数配置
 * =====================
 */
const CONFIG = {
  // 交易对配置
  SYMBOLS: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'],
  TIMEFRAME: '15m',
  YEARS: 2,
  
  // 资金配置
  FIXED_USDT: 1500,  // 每次交易固定金额
  FEE_RATE: 0.002,   // 0.2% 双边手续费
  
  // 保护机制参数
  BREAK_UP: 1.002,   // 突破上界保护
  BREAK_DOWN: 0.998, // 跌破下界保护
  
  // 回测参数扫描范围
  R_LIST: [0.02, 0.025, 0.03, 0.035, 0.04],      // 振幅阈值 2% - 4%
  SHRINK_LIST: [0.08, 0.10, 0.12, 0.14, 0.15],   // 价格区间比例 8% - 15%
  
  // 项目策略参数（基于实际项目配置）
  TREND_THRESHOLD: 5.0,      // 趋势过滤阈值 5%
  DAILY_TRADE_LIMIT: 3,      // 每日交易次数限制
  TRADE_INTERVAL: 3600000,   // 交易间隔 1小时（毫秒）
  
  // 数据存储
  DATA_DIR: './backtest/data',
  CACHE_FILE: 'klines_cache.json'
}

/**
 * =====================
 * 分页拉取 K 线数据
 * =====================
 */
async function fetchAllOHLCV(exchange, symbol, timeframe, since) {
  console.log(`📥 开始拉取 ${symbol} 的K线数据...`)
  
  let all = []
  let from = since
  let batchCount = 0

  while (true) {
    try {
      const batch = await exchange.fetchOHLCV(
        symbol,
        timeframe,
        from,
        1000
      )
      
      if (batch.length === 0) {
        console.log(`✅ ${symbol} K线数据拉取完成，共 ${all.length} 根K线`)
        break
      }

      all.push(...batch)
      batchCount++
      
      // 更新进度
      const lastTimestamp = batch[batch.length - 1][0]
      const lastDate = new Date(lastTimestamp).toLocaleDateString()
      console.log(`  批次 ${batchCount}: ${batch.length} 根K线，最新时间: ${lastDate}`)
      
      from = lastTimestamp + 1
      
      if (batch.length < 1000) {
        console.log(`✅ ${symbol} K线数据拉取完成，共 ${all.length} 根K线`)
        break
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 100))
      
    } catch (error) {
      console.error(`❌ 拉取 ${symbol} K线数据失败:`, error.message)
      break
    }
  }
  
  return all
}

/**
 * =====================
 * 缓存管理
 * =====================
 */
function ensureDataDir() {
  if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true })
  }
}

function getCacheFilePath(symbol) {
  const safeSymbol = symbol.replace('/', '_')
  return path.join(CONFIG.DATA_DIR, `${safeSymbol}_${CONFIG.CACHE_FILE}`)
}

function saveKlinesToCache(symbol, klines) {
  try {
    const cacheFile = getCacheFilePath(symbol)
    const data = {
      symbol,
      timeframe: CONFIG.TIMEFRAME,
      fetchedAt: new Date().toISOString(),
      klines
    }
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2))
    console.log(`💾 ${symbol} K线数据已缓存到: ${cacheFile}`)
    return true
  } catch (error) {
    console.error(`❌ 缓存 ${symbol} K线数据失败:`, error.message)
    return false
  }
}

function loadKlinesFromCache(symbol) {
  try {
    const cacheFile = getCacheFilePath(symbol)
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
      console.log(`📂 从缓存加载 ${symbol} K线数据: ${data.klines.length} 根K线`)
      return data.klines
    }
  } catch (error) {
    console.error(`❌ 加载 ${symbol} 缓存数据失败:`, error.message)
  }
  return null
}

/**
 * =====================
 * 获取所有交易对的K线数据
 * =====================
 */
async function getAllKlinesData() {
  ensureDataDir()
  
  const exchange = new ccxt.binance({ enableRateLimit: true })
  const since = Date.now() - CONFIG.YEARS * 365 * 24 * 60 * 60 * 1000
  
  const allKlines = {}
  
  for (const symbol of CONFIG.SYMBOLS) {
    console.log(`\n🔍 处理交易对: ${symbol}`)
    
    // 尝试从缓存加载
    let klines = loadKlinesFromCache(symbol)
    
    // 如果缓存不存在或需要更新，从API获取
    if (!klines) {
      klines = await fetchAllOHLCV(exchange, symbol, CONFIG.TIMEFRAME, since)
      if (klines.length > 0) {
        saveKlinesToCache(symbol, klines)
      }
    }
    
    if (klines && klines.length > 0) {
      allKlines[symbol] = klines
      console.log(`✅ ${symbol}: ${klines.length} 根K线数据就绪`)
    } else {
      console.log(`⚠️  ${symbol}: 无K线数据`)
    }
  }
  
  return allKlines
}

/**
 * =====================
 * 策略核心函数（基于项目逻辑）
 * =====================
 */

/**
 * 分析振幅和趋势（基于项目中的analyzeAmplitude函数）
 */
function analyzeAmplitude(klines, startIdx, endIdx) {
  if (endIdx - startIdx < 24) return null
  
  const slice = klines.slice(startIdx, endIdx)
  const highs = slice.map(k => k[2])
  const lows = slice.map(k => k[3])
  const closes = slice.map(k => k[4])
  
  const high = Math.max(...highs)
  const low = Math.min(...lows)
  const amplitude = ((high - low) / low) * 100
  
  // 计算趋势（基于项目逻辑）
  const firstClose = closes[0]
  const lastClose = closes[closes.length - 1]
  const trendPercent = ((lastClose - firstClose) / firstClose) * 100
  const isTrendFiltered = Math.abs(trendPercent) > CONFIG.TREND_THRESHOLD
  
  return {
    high,
    low,
    amplitude,
    trend: trendPercent,
    isTrendFiltered
  }
}

/**
 * 检查是否强趋势（基于参考代码）
 */
function isStrongTrend(closes) {
  if (closes.length < 6) return false
  const last6 = closes.slice(-6)
  const up = last6.every((c, i, a) => i === 0 || c > a[i - 1])
  const down = last6.every((c, i, a) => i === 0 || c < a[i - 1])
  return up || down
}

/**
 * 单交易对单参数回测
 */
function runSingleSymbolBacktest(klines, R_LIMIT, SHRINK) {
  let totalProfit = 0
  let peak = 0
  let maxDrawdown = 0
  let tradeCount = 0
  let winCount = 0
  let totalInvestment = 0
  
  const dayState = {}
  const trades = []
  
  // 需要至少30根K线作为初始数据
  for (let i = 30; i < klines.length - 1; i++) {
    const [ts, open, high, low, close] = klines[i]
    const day = new Date(ts).toISOString().slice(0, 10)
    
    // 初始化每日状态
    if (!dayState[day]) {
      dayState[day] = {
        status: 'IDLE',
        buyPrice: null,
        sellPrice: null,
        buyFilled: null,
        done: false,
        tradeCount: 0
      }
    }
    
    const state = dayState[day]
    if (state.done) continue
    
    // 检查每日交易次数限制
    if (CONFIG.DAILY_TRADE_LIMIT > 0 && state.tradeCount >= CONFIG.DAILY_TRADE_LIMIT) {
      state.done = true
      continue
    }
    
    // 分析最近24根K线（6小时）
    const analysis = analyzeAmplitude(klines, i - 24, i)
    if (!analysis) continue
    
    const { high: H, low: L, amplitude: R, isTrendFiltered } = analysis
    
    // 获取历史收盘价用于趋势判断
    const historicalCloses = klines.slice(0, i).map(k => k[4])
    
    /** Gate - 寻找交易机会 */
    if (state.status === 'IDLE') {
      // 振幅条件
      if (R < R_LIMIT) continue
      
      // 趋势过滤（项目逻辑）
      if (isTrendFiltered) continue
      
      // 强趋势过滤（参考代码逻辑）
      if (isStrongTrend(historicalCloses)) continue
      
      // 计算买入卖出价格
      const range = H - L
      state.buyPrice = L + SHRINK * range
      state.sellPrice = H - SHRINK * range
      state.status = 'BUY_ORDER'
      
      console.log(`📈 [${day}] 发现机会: R=${R.toFixed(3)}%, 买入价=${state.buyPrice.toFixed(4)}, 卖出价=${state.sellPrice.toFixed(4)}`)
    }
    
    /** BUY 成交 */
    if (state.status === 'BUY_ORDER' && low <= state.buyPrice) {
      state.buyFilled = state.buyPrice
      state.status = 'BOUGHT'
      console.log(`💰 [${day}] 买单成交: ${state.buyFilled.toFixed(4)}`)
    }
    
    /** 跌破保护（直接亏损退出） */
    if (state.status === 'BUY_ORDER' && low < L * CONFIG.BREAK_DOWN) {
      const exit = L * CONFIG.BREAK_DOWN
      const profit = CONFIG.FIXED_USDT * (exit / state.buyPrice - 1) - CONFIG.FIXED_USDT * CONFIG.FEE_RATE
      
      totalProfit += profit
      tradeCount++
      state.tradeCount++
      totalInvestment += CONFIG.FIXED_USDT
      
      if (profit > 0) winCount++
      
      trades.push({
        day,
        type: '跌破保护',
        buyPrice: state.buyPrice,
        sellPrice: exit,
        profit,
        timestamp: ts
      })
      
      state.done = true
      console.log(`🛑 [${day}] 跌破保护退出: 亏损 ${profit.toFixed(2)} USDT`)
    }
    
    /** SELL 成交 */
    if (state.status === 'BOUGHT' && high >= state.sellPrice) {
      const profit = CONFIG.FIXED_USDT * (state.sellPrice / state.buyFilled - 1) - CONFIG.FIXED_USDT * CONFIG.FEE_RATE
      
      totalProfit += profit
      tradeCount++
      state.tradeCount++
      totalInvestment += CONFIG.FIXED_USDT
      
      if (profit > 0) winCount++
      
      trades.push({
        day,
        type: '正常卖出',
        buyPrice: state.buyFilled,
        sellPrice: state.sellPrice,
        profit,
        timestamp: ts
      })
      
      state.done = true
      console.log(`🎯 [${day}] 卖单成交: 收益 ${profit.toFixed(2)} USDT (${((state.sellPrice / state.buyFilled - 1) * 100).toFixed(2)}%)`)
    }
    
    /** 突破保护（亏损 or 小盈） */
    if (state.status === 'BOUGHT' && high > H * CONFIG.BREAK_UP) {
      const exit = H * CONFIG.BREAK_UP
      const profit = CONFIG.FIXED_USDT * (exit / state.buyFilled - 1) - CONFIG.FIXED_USDT * CONFIG.FEE_RATE
      
      totalProfit += profit
      tradeCount++
      state.tradeCount++
      totalInvestment += CONFIG.FIXED_USDT
      
      if (profit > 0) winCount++
      
      trades.push({
        day,
        type: '突破保护',
        buyPrice: state.buyFilled,
        sellPrice: exit,
        profit,
        timestamp: ts
      })
      
      state.done = true
      console.log(`⚠️  [${day}] 突破保护退出: ${profit >= 0 ? '盈利' : '亏损'} ${profit.toFixed(2)} USDT`)
    }
    
    /** 跨日强制平仓（基于项目逻辑） */
    const nextKline = klines[i + 1]
    if (nextKline) {
      const nextDay = new Date(nextKline[0]).toISOString().slice(0, 10)
      
      if (state.status === 'BOUGHT' && nextDay !== day) {
        const exit = nextKline[1] // 次日开盘价
        const profit = CONFIG.FIXED_USDT * (exit / state.buyFilled - 1) - CONFIG.FIXED_USDT * CONFIG.FEE_RATE
        
        totalProfit += profit
        tradeCount++
        state.tradeCount++
        totalInvestment += CONFIG.FIXED_USDT
        
        if (profit > 0) winCount++
        
        trades.push({
          day,
          type: '跨日平仓',
          buyPrice: state.buyFilled,
          sellPrice: exit,
          profit,
          timestamp: ts
        })
        
        state.done = true
        console.log(`🌙 [${day}] 跨日强制平仓: ${profit >= 0 ? '盈利' : '亏损'} ${profit.toFixed(2)} USDT`)
      }
    }
    
    // 更新最大回撤
    peak = Math.max(peak, totalProfit)
    maxDrawdown = Math.min(maxDrawdown, totalProfit - peak)
  }
  
  const winRate = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0
  const totalReturnRate = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0
  
  return {
    R: R_LIMIT,
    shrink: SHRINK,
    trades: tradeCount,
    winCount,
    winRate,
    totalProfit,
    totalInvestment,
    totalReturnRate,
    maxDrawdown,
    peak,
    tradeDetails: trades
  }
}

/**
 * =====================
 * 多交易对参数扫描
 * =====================
 */
async function runParameterScan() {
  console.log('🚀 开始币安2年历史数据回测...')
  console.log('='.repeat(60))
  console.log('📊 回测配置:')
  console.log(`   交易对: ${CONFIG.SYMBOLS.join(', ')}`)
  console.log(`   时间框架: ${CONFIG.TIMEFRAME}`)
  console.log(`   回测年限: ${CONFIG.YEARS}年`)
  console.log(`   每次投资: ${CONFIG.FIXED_USDT} USDT`)
  console.log(`   手续费: ${CONFIG.FEE_RATE * 100}% 双边`)
  console.log('='.repeat(60))
  
  // 获取所有K线数据
  const allKlines = await getAllKlinesData()
  
  if (Object.keys(allKlines).length === 0) {
    console.error('❌ 无法获取K线数据，回测终止')
    return
  }
  
  const allResults = []
  
  // 对每个交易对进行参数扫描
  for (const [symbol, klines] of Object.entries(allKlines)) {
    console.log(`\n🔬 开始扫描交易对: ${symbol}`)
    console.log(`   数据量: ${klines.length} 根K线`)
    console.log(`   时间范围: ${new Date(klines[0][0]).toLocaleDateString()} - ${new Date(klines[klines.length - 1][0]).toLocaleDateString()}`)
    
    const symbolResults = []
    
    for (const R of CONFIG.R_LIST) {
      for (const shrink of CONFIG.SHRINK_LIST) {
        console.log(`\n  测试参数: R=${R}, shrink=${shrink}`)
        
        const result = runSingleSymbolBacktest(klines, R, shrink)
        symbolResults.push({
          symbol,
          ...result
        })
        
        console.log(`    结果: 交易${result.trades}次, 盈利${result.winCount}次, 胜率${result.winRate.toFixed(1)}%`)
        console.log(`          总收益: ${result.totalProfit.toFixed(2)} USDT, 收益率: ${result.totalReturnRate.toFixed(2)}%`)
        console.log(`          最大回撤: ${result.maxDrawdown.toFixed(2)} USDT`)
      }
    }
    
    // 保存该交易对的结果
    const bestResult = symbolResults.sort((a, b) => b.totalProfit - a.totalProfit)[0]
    console.log(`\n🏆 ${symbol} 最佳参数: R=${bestResult.R}, shrink=${bestResult.shrink}`)
    console.log(`   总收益: ${bestResult.totalProfit.toFixed(2)} USDT, 收益率: ${bestResult.totalReturnRate.toFixed(2)}%`)
    console.log(`   交易次数: ${bestResult.trades}, 胜率: ${bestResult.winRate.toFixed(1)}%`)
    
    allResults.push(...symbolResults)
  }
  
  // 生成最终报告
  generateFinalReport(allResults)
}

/**
 * =====================
 * 生成最终报告
 * =====================
 */
function generateFinalReport(allResults) {
  console.log('\n' + '='.repeat(80))
  console.log('📊 币安2年历史数据回测最终报告')
  console.log('='.repeat(80))
  
  // 1. 按总收益排序
  const sortedByProfit = [...allResults].sort((a, b) => b.totalProfit - a.totalProfit)
  
  console.log('\n🏆 按总收益排名（前10）:')
  console.log('─'.repeat(80))
  console.log('排名 | 交易对       | R     | shrink | 收益(USDT) | 收益率% | 交易数 | 胜率%  | 最大回撤')
  console.log('─'.repeat(80))
  
  sortedByProfit.slice(0, 10).forEach((result, index) => {
    console.log(
      `${(index + 1).toString().padStart(4)} | ${result.symbol.padEnd(10)} | ${result.R.toFixed(3)} | ${result.shrink.toFixed(3)} | ` +
      `${result.totalProfit.toFixed(2).padStart(10)} | ${result.totalReturnRate.toFixed(2).padStart(7)} | ` +
      `${result.trades.toString().padStart(6)} | ${result.winRate.toFixed(1).padStart(5)} | ` +
      `${result.maxDrawdown.toFixed(2).padStart(9)}`
    )
  })
  
  // 2. 按收益率排序
  const sortedByReturnRate = [...allResults].sort((a, b) => b.totalReturnRate - a.totalReturnRate)
  
  console.log('\n📈 按收益率排名（前10）:')
  console.log('─'.repeat(80))
  console.log('排名 | 交易对       | R     | shrink | 收益率% | 收益(USDT) | 交易数 | 胜率%  | 最大回撤')
  console.log('─'.repeat(80))
  
  sortedByReturnRate.slice(0, 10).forEach((result, index) => {
    console.log(
      `${(index + 1).toString().padStart(4)} | ${result.symbol.padEnd(10)} | ${result.R.toFixed(3)} | ${result.shrink.toFixed(3)} | ` +
      `${result.totalReturnRate.toFixed(2).padStart(7)} | ${result.totalProfit.toFixed(2).padStart(10)} | ` +
      `${result.trades.toString().padStart(6)} | ${result.winRate.toFixed(1).padStart(5)} | ` +
      `${result.maxDrawdown.toFixed(2).padStart(9)}`
    )
  })
  
  // 3. 按胜率排序
  const sortedByWinRate = [...allResults].filter(r => r.trades > 10).sort((a, b) => b.winRate - a.winRate)
  
  if (sortedByWinRate.length > 0) {
    console.log('\n🎯 按胜率排名（交易次数>10，前10）:')
    console.log('─'.repeat(80))
    console.log('排名 | 交易对       | R     | shrink | 胜率%  | 收益(USDT) | 收益率% | 交易数 | 最大回撤')
    console.log('─'.repeat(80))
    
    sortedByWinRate.slice(0, 10).forEach((result, index) => {
      console.log(
        `${(index + 1).toString().padStart(4)} | ${result.symbol.padEnd(10)} | ${result.R.toFixed(3)} | ${result.shrink.toFixed(3)} | ` +
        `${result.winRate.toFixed(1).padStart(5)} | ${result.totalProfit.toFixed(2).padStart(10)} | ` +
        `${result.totalReturnRate.toFixed(2).padStart(7)} | ${result.trades.toString().padStart(6)} | ` +
        `${result.maxDrawdown.toFixed(2).padStart(9)}`
      )
    })
  }
  
  // 4. 按交易对汇总
  console.log('\n🔍 按交易对汇总最佳参数:')
  console.log('─'.repeat(80))
  
  const symbols = [...new Set(allResults.map(r => r.symbol))]
  symbols.forEach(symbol => {
    const symbolResults = allResults.filter(r => r.symbol === symbol)
    const bestResult = symbolResults.sort((a, b) => b.totalProfit - a.totalProfit)[0]
    
    console.log(`${symbol.padEnd(10)} | 最佳参数: R=${bestResult.R}, shrink=${bestResult.shrink}`)
    console.log(`          总收益: ${bestResult.totalProfit.toFixed(2)} USDT, 收益率: ${bestResult.totalReturnRate.toFixed(2)}%`)
    console.log(`          交易次数: ${bestResult.trades}, 胜率: ${bestResult.winRate.toFixed(1)}%, 最大回撤: ${bestResult.maxDrawdown.toFixed(2)} USDT`)
    console.log('─'.repeat(80))
  })
  
  // 5. 参数优化建议
  console.log('\n💡 参数优化建议:')
  console.log('─'.repeat(80))
  
  // 分析最佳参数分布
  const bestParams = sortedByProfit.slice(0, 20)
  const avgR = bestParams.reduce((sum, r) => sum + r.R, 0) / bestParams.length
  const avgShrink = bestParams.reduce((sum, r) => sum + r.shrink, 0) / bestParams.length
  
  console.log(`基于前20名最佳表现，建议参数范围:`)
  console.log(`  • 振幅阈值(R): ${avgR.toFixed(3)} (范围: ${Math.min(...bestParams.map(p => p.R)).toFixed(3)} - ${Math.max(...bestParams.map(p => p.R)).toFixed(3)})`)
  console.log(`  • 价格区间比例(shrink): ${avgShrink.toFixed(3)} (范围: ${Math.min(...bestParams.map(p => p.shrink)).toFixed(3)} - ${Math.max(...bestParams.map(p => p.shrink)).toFixed(3)})`)
  
  // 6. 风险分析
  console.log('\n⚠️  风险分析:')
  console.log('─'.repeat(80))
  
  const allProfits = allResults.map(r => r.totalProfit)
  const avgProfit = allProfits.reduce((sum, p) => sum + p, 0) / allProfits.length
  const minProfit = Math.min(...allProfits)
  const maxProfit = Math.max(...allProfits)
  
  const profitableResults = allResults.filter(r => r.totalProfit > 0)
  const profitProbability = (profitableResults.length / allResults.length) * 100
  
  console.log(`参数组合总数: ${allResults.length}`)
  console.log(`盈利参数组合: ${profitableResults.length} (${profitProbability.toFixed(1)}%)`)
  console.log(`平均收益: ${avgProfit.toFixed(2)} USDT`)
  console.log(`最大收益: ${maxProfit.toFixed(2)} USDT`)
  console.log(`最小收益: ${minProfit.toFixed(2)} USDT`)
  console.log(`收益标准差: ${calculateStdDev(allProfits).toFixed(2)} USDT`)
  
  // 7. 保存详细结果到文件
  saveDetailedResults(allResults)
}

/**
 * =====================
 * 辅助函数
 * =====================
 */
function calculateStdDev(numbers) {
  const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length
  const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2))
  const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length
  return Math.sqrt(avgSquaredDiff)
}

function saveDetailedResults(allResults) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const resultFile = path.join(CONFIG.DATA_DIR, `backtest_results_${timestamp}.json`)
    
    const report = {
      config: CONFIG,
      timestamp: new Date().toISOString(),
      totalCombinations: allResults.length,
      results: allResults
    }
    
    fs.writeFileSync(resultFile, JSON.stringify(report, null, 2))
    console.log(`\n💾 详细回测结果已保存到: ${resultFile}`)
  } catch (error) {
    console.error('❌ 保存详细结果失败:', error.message)
  }
}

/**
 * =====================
 * 主函数
 * =====================
 */
async function main() {
  try {
    console.log('🎯 币安2年历史数据回测系统')
    console.log('='.repeat(60))
    
    await runParameterScan()
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ 回测完成！')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('❌ 回测过程中发生错误:', error)
    process.exit(1)
  }
}

// 运行主函数
if (require.main === module) {
  main()
}

module.exports = {
  CONFIG,
  fetchAllOHLCV,
  getAllKlinesData,
  runSingleSymbolBacktest,
  runParameterScan,
  generateFinalReport
}
