import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    
    const dataDir = join(process.cwd(), 'data')
    const configPath = join(dataDir, 'trading-config.json')  // 配置和统计
    const dataPath = join(dataDir, 'trading-data.json')      // 交易记录和状态
    
    // 确保data目录存在
    try {
      await mkdir(dataDir, { recursive: true })
    } catch (error) {
      // 目录已存在，忽略错误
    }
    
    // 保存配置和统计数据
    const configData = {
      config: body.config,
      stats: body.stats,
      lastSaved: Date.now(),
    }
    await writeFile(configPath, JSON.stringify(configData, null, 2), 'utf-8')
    
    // 保存交易记录和状态
    const tradingData = {
      tradingStatus: body.tradingStatus,
      tradeRecords: body.tradeRecords,
      lastSaved: Date.now(),
    }
    await writeFile(dataPath, JSON.stringify(tradingData, null, 2), 'utf-8')
    
    return { success: true, message: '数据保存成功' }
  } catch (error) {
    console.error('保存交易数据失败:', error)
    throw createError({
      statusCode: 500,
      message: '保存交易数据失败',
    })
  }
})
