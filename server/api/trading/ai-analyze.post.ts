import type { TradingSymbol } from '../../../types/trading'
import { getAIAnalysisService } from '../../utils/ai-analysis'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { symbol } = body as { symbol: TradingSymbol }
    
    if (!symbol) {
      throw createError({
        statusCode: 400,
        message: '缺少交易对参数',
      })
    }
    
    console.log(`🤖 手动触发AI分析: ${symbol}`)
    
    const aiService = getAIAnalysisService()
    const analysis = await aiService.analyzeSymbol(symbol)
    
    // 获取缓存统计
    const cacheStats = aiService.getCacheStats()
    
    return {
      success: true,
      analysis,
      cacheStats,
      timestamp: Date.now(),
    }
  } catch (error: any) {
    console.error('AI分析API调用失败:', error)
    
    // 如果API密钥未配置，返回友好提示
    if (error.message.includes('DeepSeek API密钥未配置')) {
      return {
        success: false,
        error: 'DeepSeek API密钥未配置',
        message: '请设置DEEPSEEK_API_KEY环境变量，参考.env.example文件',
        timestamp: Date.now(),
      }
    }
    
    throw createError({
      statusCode: 500,
      message: error.message || 'AI分析失败',
    })
  }
})
