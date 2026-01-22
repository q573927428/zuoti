import type { TradingSymbol, AIAnalysisResult, Kline } from '../../types/trading'
import { fetchKlines } from './binance'

// 分析结果缓存
const analysisCache = new Map<string, AIAnalysisResult>()

/**
 * AI分析服务 - 使用DeepSeek API进行市场分析
 */
export class AIAnalysisService {
  private apiKey: string
  private apiUrl: string
  private cacheDuration: number

  constructor(apiKey: string, apiUrl: string = 'https://api.deepseek.com', cacheDuration: number = 30 * 60 * 1000) {
    this.apiKey = apiKey
    this.apiUrl = apiUrl
    this.cacheDuration = cacheDuration
  }

  /**
   * 分析交易对
   */
  async analyzeSymbol(symbol: TradingSymbol, marketData?: any): Promise<AIAnalysisResult> {
    // 检查缓存
    const cacheKey = `${symbol}_${Date.now() - (Date.now() % (10 * 60 * 1000))}` // 10分钟粒度
    const cached = analysisCache.get(cacheKey)
    
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`📊 使用缓存的AI分析结果: ${symbol}`)
      return cached
    }

    try {
      console.log(`🤖 开始AI分析: ${symbol}`)
      
      // 获取市场数据
      const marketData = await this.fetchMarketData(symbol)
      
      // 准备分析提示
      const prompt = this.createAnalysisPrompt(symbol, marketData)
      
      // 调用DeepSeek API
      const analysis = await this.callDeepSeekAPI(prompt)
      
      // 解析AI响应
      const result = this.parseAIResponse(symbol, analysis)
      
      // 缓存结果
      analysisCache.set(cacheKey, result)
      
      console.log(`✅ AI分析完成: ${symbol} - 推荐: ${result.recommendation}, 置信度: ${result.confidence}%`)
      
      return result
    } catch (error) {
      console.error(`❌ AI分析失败: ${symbol}`, error)
      
      // 返回默认分析结果（避免阻塞交易流程）
      return this.createDefaultAnalysis(symbol)
    }
  }

  /**
   * 创建分析提示
   */
  private createAnalysisPrompt(symbol: TradingSymbol, marketData?: any): string {
    const now = new Date().toISOString()
    
    // 如果有市场数据，构建详细的分析提示
    if (marketData && marketData.currentPrice) {
      const {
        currentPrice,
        priceChanges,
        technicalIndicators,
        volumeAnalysis
      } = marketData
      
      return `你是一个专业的加密货币交易分析师。请基于以下市场数据进行分析：

交易对: ${symbol}
当前时间: ${now}
当前价格: ${currentPrice.toFixed(2)} USDT

价格变化:
- 1小时: ${priceChanges['1h'].toFixed(2)}%
- 4小时: ${priceChanges['4h'].toFixed(2)}%
- 24小时: ${priceChanges['24h'].toFixed(2)}%

技术指标:
移动平均线 (15分钟):
- MA7: ${technicalIndicators.movingAverages['15m'].ma7.toFixed(2)}
- MA25: ${technicalIndicators.movingAverages['15m'].ma25.toFixed(2)}
- 趋势: ${technicalIndicators.movingAverages['15m'].trend}

移动平均线 (1小时):
- MA7: ${technicalIndicators.movingAverages['1h'].ma7.toFixed(2)}
- MA25: ${technicalIndicators.movingAverages['1h'].ma25.toFixed(2)}
- 趋势: ${technicalIndicators.movingAverages['1h'].trend}

RSI指标:
- 15分钟RSI: ${technicalIndicators.rsi['15m'].toFixed(2)}
- 1小时RSI: ${technicalIndicators.rsi['1h'].toFixed(2)}

支撑位/阻力位:
- 支撑位: ${technicalIndicators.supportResistance.support.toFixed(2)}
- 阻力位: ${technicalIndicators.supportResistance.resistance.toFixed(2)}

成交量分析:
- 15分钟平均成交量: ${volumeAnalysis.averageVolume['15m'].toFixed(2)}
- 1小时平均成交量: ${volumeAnalysis.averageVolume['1h'].toFixed(2)}
- 成交量变化: ${volumeAnalysis.volumeChange15m.toFixed(2)}%
- 成交量趋势: ${volumeAnalysis.volumeTrend}

分析要求:
1. 基于以上技术指标、价格走势和成交量分析给出交易建议
2. 建议必须是以下之一: BUY(买入), SELL(卖出), HOLD(持有), AVOID(避免交易)
3. 提供置信度(0-100%)
4. 评估风险等级: LOW(低), MEDIUM(中), HIGH(高)
5. 详细说明分析理由，包括技术指标解读
6. 评估市场情绪: BULLISH(看涨), BEARISH(看跌), NEUTRAL(中性)

请以JSON格式返回分析结果，包含以下字段:
- recommendation: 交易建议
- confidence: 置信度(0-100)
- reasoning: 详细分析理由
- riskLevel: 风险等级
- marketSentiment: 市场情绪

示例响应:
{
  "recommendation": "BUY",
  "confidence": 75,
  "reasoning": "价格突破阻力位，移动平均线呈多头排列，RSI处于健康区间，成交量放大支持上涨趋势。",
  "riskLevel": "MEDIUM",
  "marketSentiment": "BULLISH"
}`
    }
    
    // 如果没有市场数据，使用简化的提示
    return `你是一个专业的加密货币交易分析师。请分析以下交易对：

交易对: ${symbol}
当前时间: ${now}

分析要求:
1. 基于技术分析、市场情绪和风险管理给出交易建议
2. 建议必须是以下之一: BUY(买入), SELL(卖出), HOLD(持有), AVOID(避免交易)
3. 提供置信度(0-100%)
4. 评估风险等级: LOW(低), MEDIUM(中), HIGH(高)
5. 简要说明分析理由
6. 评估市场情绪: BULLISH(看涨), BEARISH(看跌), NEUTRAL(中性)

请以JSON格式返回分析结果，包含以下字段:
- recommendation: 交易建议
- confidence: 置信度(0-100)
- reasoning: 分析理由
- riskLevel: 风险等级
- marketSentiment: 市场情绪

示例响应:
{
  "recommendation": "BUY",
  "confidence": 75,
  "reasoning": "该交易对显示强劲的上涨趋势，技术指标看涨，市场情绪积极。",
  "riskLevel": "MEDIUM",
  "marketSentiment": "BULLISH"
}`
  }

  /**
   * 调用DeepSeek API
   */
  private async callDeepSeekAPI(prompt: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的加密货币交易分析师，专注于提供准确、客观的交易建议。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error(`DeepSeek API请求失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(symbol: TradingSymbol, aiResponse: string, marketData?: any): AIAnalysisResult {
    try {
      // 尝试解析JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        
        // 获取AI置信度
        const aiConfidence = Math.min(100, Math.max(0, parsed.confidence || 50))
        
        // 如果有市场数据，计算本地技术指标置信度
        let finalConfidence = aiConfidence
        let confidenceDetails = undefined
        
        if (marketData) {
          const localConfidence = this.calculateLocalConfidence(marketData)
          const details = this.getConfidenceDetails(marketData)
          
          // 加权平均：AI权重60%，本地技术指标权重40%
          finalConfidence = Math.round((aiConfidence * 0.6) + (localConfidence * 0.4))
          finalConfidence = Math.min(100, Math.max(0, finalConfidence))
          
          // 构建完整的置信度详情
          confidenceDetails = {
            aiConfidence,
            localConfidence,
            priceScore: details.priceScore,
            maScore: details.maScore,
            rsiScore: details.rsiScore,
            volumeScore: details.volumeScore,
            srScore: details.srScore,
            finalConfidence
          }
        }
        
        return {
          symbol,
          recommendation: this.validateRecommendation(parsed.recommendation),
          confidence: finalConfidence,
          reasoning: parsed.reasoning || 'AI分析完成',
          riskLevel: this.validateRiskLevel(parsed.riskLevel),
          marketSentiment: this.validateSentiment(parsed.marketSentiment),
          confidenceDetails,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.cacheDuration
        }
      }
    } catch (error) {
      console.warn('解析AI响应失败，使用默认分析:', error)
    }

    // 如果解析失败，返回默认分析
    return this.createDefaultAnalysis(symbol)
  }

  /**
   * 创建默认分析结果
   */
  private createDefaultAnalysis(symbol: TradingSymbol): AIAnalysisResult {
    return {
      symbol,
      recommendation: 'HOLD',
      confidence: 50,
      reasoning: 'AI分析服务暂时不可用，建议谨慎操作',
      riskLevel: 'MEDIUM',
      marketSentiment: 'NEUTRAL',
      timestamp: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000 // 5分钟缓存
    }
  }

  /**
   * 验证交易建议
   */
  private validateRecommendation(recommendation: string): 'BUY' | 'SELL' | 'HOLD' | 'AVOID' {
    const upper = recommendation.toUpperCase()
    if (['BUY', 'SELL', 'HOLD', 'AVOID'].includes(upper)) {
      return upper as any
    }
    return 'HOLD'
  }

  /**
   * 验证风险等级
   */
  private validateRiskLevel(riskLevel: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    const upper = riskLevel.toUpperCase()
    if (['LOW', 'MEDIUM', 'HIGH'].includes(upper)) {
      return upper as any
    }
    return 'MEDIUM'
  }

  /**
   * 验证市场情绪
   */
  private validateSentiment(sentiment: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const upper = sentiment.toUpperCase()
    if (['BULLISH', 'BEARISH', 'NEUTRAL'].includes(upper)) {
      return upper as any
    }
    return 'NEUTRAL'
  }

  /**
   * 清理过期缓存
   */
  cleanupCache(): void {
    const now = Date.now()
    for (const [key, value] of analysisCache.entries()) {
      if (value.expiresAt < now) {
        analysisCache.delete(key)
      }
    }
  }

  /**
   * 获取市场数据
   */
  private async fetchMarketData(symbol: TradingSymbol): Promise<any> {
    try {
      console.log(`📊 获取市场数据: ${symbol}`)
      
      // 获取多个时间框架的K线数据
      const klines15m = await fetchKlines(symbol, '15m', 24) // 最近6小时
      const klines1h = await fetchKlines(symbol, '1h', 24)   // 最近24小时
      const klines4h = await fetchKlines(symbol, '4h', 24)   // 最近4天
      
      if (klines15m.length === 0 || klines1h.length === 0 || klines4h.length === 0) {
        throw new Error(`无法获取 ${symbol} 的市场数据`)
      }
      
      // 计算技术指标
      const technicalIndicators = this.calculateTechnicalIndicators(klines15m, klines1h, klines4h)
      
      // 获取当前价格
      const currentPrice = klines15m[klines15m.length - 1].close
      
      // 计算价格变化
      const priceChange1h = this.calculatePriceChange(klines1h)
      const priceChange4h = this.calculatePriceChange(klines4h)
      const priceChange24h = this.calculatePriceChange24h(klines1h)
      
      // 计算成交量
      const volumeAnalysis = this.analyzeVolume(klines15m, klines1h)
      
      return {
        symbol,
        currentPrice,
        priceChanges: {
          '1h': priceChange1h,
          '4h': priceChange4h,
          '24h': priceChange24h
        },
        technicalIndicators,
        volumeAnalysis,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error(`获取市场数据失败: ${symbol}`, error)
      throw error
    }
  }
  
  /**
   * 计算技术指标
   */
  private calculateTechnicalIndicators(klines15m: Kline[], klines1h: Kline[], klines4h: Kline[]): any {
    // 这里可以集成更复杂的技术指标计算
    // 目前先实现简单的移动平均线
    
    const ma7_15m = this.calculateMA(klines15m, 7)
    const ma25_15m = this.calculateMA(klines15m, 25)
    const ma7_1h = this.calculateMA(klines1h, 7)
    const ma25_1h = this.calculateMA(klines1h, 25)
    
    // 判断趋势
    const trend15m = ma7_15m > ma25_15m ? 'BULLISH' : 'BEARISH'
    const trend1h = ma7_1h > ma25_1h ? 'BULLISH' : 'BEARISH'
    
    // 计算RSI（简化版）
    const rsi15m = this.calculateRSI(klines15m, 14)
    const rsi1h = this.calculateRSI(klines1h, 14)
    
    return {
      movingAverages: {
        '15m': { ma7: ma7_15m, ma25: ma25_15m, trend: trend15m },
        '1h': { ma7: ma7_1h, ma25: ma25_1h, trend: trend1h }
      },
      rsi: {
        '15m': rsi15m,
        '1h': rsi1h
      },
      supportResistance: this.identifySupportResistance(klines1h)
    }
  }
  
  /**
   * 计算移动平均线
   */
  private calculateMA(klines: Kline[], period: number): number {
    if (klines.length < period) {
      return klines[klines.length - 1].close
    }
    
    const recentKlines = klines.slice(-period)
    const sum = recentKlines.reduce((acc, kline) => acc + kline.close, 0)
    return sum / period
  }
  
  /**
   * 计算RSI（相对强弱指数）
   */
  private calculateRSI(klines: Kline[], period: number): number {
    if (klines.length < period + 1) {
      return 50 // 默认值
    }
    
    let gains = 0
    let losses = 0
    
    for (let i = klines.length - period; i < klines.length; i++) {
      const change = klines[i].close - klines[i - 1].close
      if (change > 0) {
        gains += change
      } else {
        losses += Math.abs(change)
      }
    }
    
    const avgGain = gains / period
    const avgLoss = losses / period
    
    if (avgLoss === 0) {
      return 100
    }
    
    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }
  
  /**
   * 识别支撑位和阻力位
   */
  private identifySupportResistance(klines: Kline[]): any {
    if (klines.length < 20) {
      return { support: 0, resistance: 0 }
    }
    
    const prices = klines.map(k => k.close)
    const recentPrices = prices.slice(-20)
    
    const support = Math.min(...recentPrices) * 0.99
    const resistance = Math.max(...recentPrices) * 1.01
    
    return { support, resistance }
  }
  
  /**
   * 计算价格变化
   */
  private calculatePriceChange(klines: Kline[]): number {
    if (klines.length < 2) {
      return 0
    }
    
    const firstPrice = klines[0].close
    const lastPrice = klines[klines.length - 1].close
    return ((lastPrice - firstPrice) / firstPrice) * 100
  }
  
  /**
   * 计算24小时价格变化
   */
  private calculatePriceChange24h(klines1h: Kline[]): number {
    if (klines1h.length < 24) {
      return this.calculatePriceChange(klines1h)
    }
    
    const firstPrice = klines1h[klines1h.length - 24].close
    const lastPrice = klines1h[klines1h.length - 1].close
    return ((lastPrice - firstPrice) / firstPrice) * 100
  }
  
  /**
   * 分析成交量
   */
  private analyzeVolume(klines15m: Kline[], klines1h: Kline[]): any {
    const volume15m = klines15m.reduce((acc, kline) => acc + kline.volume, 0) / klines15m.length
    const volume1h = klines1h.reduce((acc, kline) => acc + kline.volume, 0) / klines1h.length
    
    // 计算成交量变化
    const recentVolume15m = klines15m.slice(-4).reduce((acc, kline) => acc + kline.volume, 0) / 4
    const volumeChange15m = ((recentVolume15m - volume15m) / volume15m) * 100
    
    return {
      averageVolume: {
        '15m': volume15m,
        '1h': volume1h
      },
      volumeChange15m,
      volumeTrend: volumeChange15m > 10 ? 'INCREASING' : volumeChange15m < -10 ? 'DECREASING' : 'STABLE'
    }
  }

  /**
   * 计算本地技术指标置信度
   */
  private calculateLocalConfidence(marketData: any): number {
    const { priceChanges, technicalIndicators, volumeAnalysis } = marketData
    
    let confidence = 50 // 基础分
    
    // 1. 价格变化评分 (0-20分)
    const priceScore = this.evaluatePriceChanges(priceChanges)
    confidence += priceScore
    
    // 2. 移动平均线评分 (0-15分)
    const maScore = this.evaluateMovingAverages(technicalIndicators.movingAverages)
    confidence += maScore
    
    // 3. RSI评分 (0-10分)
    const rsiScore = this.evaluateRSI(technicalIndicators.rsi)
    confidence += rsiScore
    
    // 4. 成交量评分 (0-10分)
    const volumeScore = this.evaluateVolume(volumeAnalysis)
    confidence += volumeScore
    
    // 5. 支撑阻力评分 (0-5分)
    const srScore = this.evaluateSupportResistance(technicalIndicators.supportResistance, marketData.currentPrice)
    confidence += srScore
    
    return Math.min(100, Math.max(0, confidence))
  }

  /**
   * 获取置信度详情
   */
  private getConfidenceDetails(marketData: any): any {
    const { priceChanges, technicalIndicators, volumeAnalysis } = marketData
    
    const priceScore = this.evaluatePriceChanges(priceChanges)
    const maScore = this.evaluateMovingAverages(technicalIndicators.movingAverages)
    const rsiScore = this.evaluateRSI(technicalIndicators.rsi)
    const volumeScore = this.evaluateVolume(volumeAnalysis)
    const srScore = this.evaluateSupportResistance(technicalIndicators.supportResistance, marketData.currentPrice)
    
    const localConfidence = 50 + priceScore + maScore + rsiScore + volumeScore + srScore
    const finalLocalConfidence = Math.min(100, Math.max(0, localConfidence))
    
    return {
      priceScore,
      maScore,
      rsiScore,
      volumeScore,
      srScore,
      localConfidence: finalLocalConfidence
    }
  }

  /**
   * 评估价格变化
   */
  private evaluatePriceChanges(priceChanges: any): number {
    let score = 0
    
    // 1小时变化：上涨加分，下跌减分
    if (priceChanges['1h'] > 1) score += 5
    else if (priceChanges['1h'] < -1) score -= 3
    
    // 4小时变化：趋势持续加分
    if (priceChanges['4h'] > 2) score += 8
    else if (priceChanges['4h'] < -2) score -= 5
    
    // 24小时变化：长期趋势
    if (priceChanges['24h'] > 5) score += 7
    else if (priceChanges['24h'] < -5) score -= 4
    
    return Math.min(20, Math.max(-10, score)) + 10 // 归一化到0-20分
  }

  /**
   * 评估移动平均线
   */
  private evaluateMovingAverages(movingAverages: any): number {
    let score = 0
    
    // 15分钟均线趋势
    if (movingAverages['15m'].trend === 'BULLISH') score += 5
    else if (movingAverages['15m'].trend === 'BEARISH') score -= 3
    
    // 1小时均线趋势
    if (movingAverages['1h'].trend === 'BULLISH') score += 8
    else if (movingAverages['1h'].trend === 'BEARISH') score -= 5
    
    // 均线排列：金叉/死叉
    const ma7_15m = movingAverages['15m'].ma7
    const ma25_15m = movingAverages['15m'].ma25
    const ma7_1h = movingAverages['1h'].ma7
    const ma25_1h = movingAverages['1h'].ma25
    
    // 短期均线上穿长期均线（金叉）
    if (ma7_15m > ma25_15m && ma7_1h > ma25_1h) score += 7
    // 短期均线下穿长期均线（死叉）
    else if (ma7_15m < ma25_15m && ma7_1h < ma25_1h) score -= 5
    
    return Math.min(15, Math.max(0, score))
  }

  /**
   * 评估RSI指标
   */
  private evaluateRSI(rsi: any): number {
    let score = 0
    
    // 15分钟RSI
    if (rsi['15m'] > 70) score -= 3 // 超买
    else if (rsi['15m'] < 30) score += 3 // 超卖
    else if (rsi['15m'] > 50 && rsi['15m'] < 70) score += 2 // 健康上涨
    else if (rsi['15m'] > 30 && rsi['15m'] < 50) score -= 1 // 弱势
    
    // 1小时RSI
    if (rsi['1h'] > 70) score -= 5 // 超买
    else if (rsi['1h'] < 30) score += 5 // 超卖
    else if (rsi['1h'] > 50 && rsi['1h'] < 70) score += 3 // 健康上涨
    else if (rsi['1h'] > 30 && rsi['1h'] < 50) score -= 2 // 弱势
    
    return Math.min(10, Math.max(-5, score)) + 5 // 归一化到0-10分
  }

  /**
   * 评估成交量
   */
  private evaluateVolume(volumeAnalysis: any): number {
    let score = 0
    
    // 成交量变化
    if (volumeAnalysis.volumeChange15m > 20) score += 5 // 成交量大幅增加
    else if (volumeAnalysis.volumeChange15m > 10) score += 3 // 成交量增加
    else if (volumeAnalysis.volumeChange15m < -20) score -= 3 // 成交量大幅减少
    
    // 成交量趋势
    if (volumeAnalysis.volumeTrend === 'INCREASING') score += 5
    else if (volumeAnalysis.volumeTrend === 'DECREASING') score -= 3
    
    return Math.min(10, Math.max(0, score))
  }

  /**
   * 评估支撑阻力
   */
  private evaluateSupportResistance(supportResistance: any, currentPrice: number): number {
    let score = 0
    
    const support = supportResistance.support
    const resistance = supportResistance.resistance
    const priceRange = resistance - support
    
    if (priceRange <= 0) return 0
    
    // 计算价格相对于支撑阻力位的位置
    const pricePosition = (currentPrice - support) / priceRange
    
    // 价格在支撑位附近（0-20%）
    if (pricePosition < 0.2) score += 3 // 接近支撑位，有反弹可能
    
    // 价格在阻力位附近（80-100%）
    if (pricePosition > 0.8) score -= 2 // 接近阻力位，有回调风险
    
    // 价格在中间区域（40-60%）
    if (pricePosition >= 0.4 && pricePosition <= 0.6) score += 2 // 中间区域，趋势延续
    
    return Math.min(5, Math.max(-2, score)) + 1 // 归一化到0-5分
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; hits: number } {
    return {
      size: analysisCache.size,
      hits: 0 // 可以添加命中统计逻辑
    }
  }
}

/**
 * 获取AI分析服务实例
 */
let aiServiceInstance: AIAnalysisService | null = null

export function getAIAnalysisService(): AIAnalysisService {
  if (!aiServiceInstance) {
    // 在Nuxt环境中，我们需要在事件处理程序中使用useRuntimeConfig
    // 这里我们改为从环境变量直接读取
    const apiKey = process.env.DEEPSEEK_API_KEY
    const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com'
    
    if (!apiKey) {
      throw new Error('DeepSeek API密钥未配置，请设置DEEPSEEK_API_KEY环境变量')
    }
    
    aiServiceInstance = new AIAnalysisService(apiKey, apiUrl)
  }
  
  return aiServiceInstance
}
