import { getBotInstance } from '../../../modules/trading-bot'

/**
 * 切换交易机器人开关
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { enabled } = body
    
    if (typeof enabled !== 'boolean') {
      throw createError({
        statusCode: 400,
        message: '参数错误：enabled必须是布尔值',
      })
    }
    
    const bot = getBotInstance()
    await bot.toggleAutoTrading(enabled)
    
    return {
      success: true,
      message: `自动交易已${enabled ? '开启' : '关闭'}`,
      enabled
    }
  } catch (error) {
    console.error('切换交易开关失败:', error)
    throw createError({
      statusCode: 500,
      message: '切换交易开关失败',
    })
  }
})
