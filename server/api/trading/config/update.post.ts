import { getBotInstance } from '../../../modules/trading-bot'

/**
 * 更新系统配置
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const bot = getBotInstance()
    
    await bot.updateConfig(body)
    
    return {
      success: true,
      message: '配置更新成功'
    }
  } catch (error) {
    console.error('更新配置失败:', error)
    throw createError({
      statusCode: 500,
      message: '更新配置失败',
    })
  }
})
