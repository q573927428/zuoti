import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    
    const dataDir = join(process.cwd(), 'data')
    const dataPath = join(dataDir, 'trading-data.json')
    
    // 确保data目录存在
    try {
      await mkdir(dataDir, { recursive: true })
    } catch (error) {
      // 目录已存在，忽略错误
    }
    
    // 保存数据
    await writeFile(dataPath, JSON.stringify(body, null, 2), 'utf-8')
    
    return { success: true, message: '数据保存成功' }
  } catch (error) {
    console.error('保存交易数据失败:', error)
    throw createError({
      statusCode: 500,
      message: '保存交易数据失败',
    })
  }
})
