<template>
  <div class="backend-logs-container">
    <el-container>
      <!-- 头部 -->
      <el-header class="header">
        <div class="header-content">
          <h1>后端日志管理</h1>
        </div>
      </el-header>

      <el-main class="main-content">
        <!-- 日志统计 -->
        <el-card shadow="hover" class="stats-card">
          <template #header>
            <div class="card-header">
              <span>日志统计</span>
            </div>
          </template>
          <div class="log-stats">
            <el-row :gutter="20">
              <el-col :xs="12" :sm="6">
                <div class="log-stat-item">
                  <div class="log-stat-label">总日志数</div>
                  <div class="log-stat-value">{{ store.backendLogStats.total }}</div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="log-stat-item">
                  <div class="log-stat-label">最近1小时</div>
                  <div class="log-stat-value">{{ store.backendLogStats.lastHour }}</div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="log-stat-item">
                  <div class="log-stat-label">最近24小时</div>
                  <div class="log-stat-value">{{ store.backendLogStats.lastDay }}</div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="log-stat-item">
                  <div class="log-stat-label">日志文件</div>
                  <div class="log-stat-value">-</div>
                </div>
              </el-col>
            </el-row>
          </div>
          
          <!-- 按级别统计 -->
          <div class="level-stats">
            <el-row :gutter="20">
              <el-col :xs="12" :sm="6">
                <div class="level-stat-item info">
                  <div class="level-stat-label">信息</div>
                  <div class="level-stat-value">{{ store.backendLogStats.byLevel.info }}</div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="level-stat-item warn">
                  <div class="level-stat-label">警告</div>
                  <div class="level-stat-value">{{ store.backendLogStats.byLevel.warn }}</div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="level-stat-item error">
                  <div class="level-stat-label">错误</div>
                  <div class="level-stat-value">{{ store.backendLogStats.byLevel.error }}</div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="level-stat-item debug">
                  <div class="level-stat-label">调试</div>
                  <div class="level-stat-value">{{ store.backendLogStats.byLevel.debug }}</div>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-card>

        <!-- 日志过滤 -->
        <el-card shadow="hover" class="filters-card">
          <template #header>
            <div class="card-header">
              <span>日志过滤</span>
            </div>
          </template>
          <div class="log-filters">
            <el-form :inline="true" :model="logFilters" class="demo-form-inline">
              <el-form-item label="日志级别">
                <el-select v-model="logFilters.level" placeholder="全部" size="small" @change="refreshBackendLogs">
                  <el-option label="全部" value="all" />
                  <el-option label="信息" value="info" />
                  <el-option label="警告" value="warn" />
                  <el-option label="错误" value="error" />
                  <el-option label="调试" value="debug" />
                </el-select>
              </el-form-item>
              <el-form-item label="搜索">
                <el-input v-model="logFilters.search" placeholder="搜索日志内容" size="small" @keyup.enter="refreshBackendLogs" />
              </el-form-item>
              <el-form-item label="显示条数">
                <el-select v-model="logFilters.limit" placeholder="100条" size="small" @change="refreshBackendLogs">
                  <el-option label="50条" :value="50" />
                  <el-option label="100条" :value="100" />
                  <el-option label="200条" :value="200" />
                  <el-option label="500条" :value="500" />
                </el-select>
              </el-form-item>
              <el-form-item label="时间范围">
                <el-date-picker
                  v-model="logFilters.timeRange"
                  type="datetimerange"
                  range-separator="至"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  size="small"
                  @change="handleTimeRangeChange"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" size="small" @click="refreshBackendLogs">
                  应用过滤
                </el-button>
                <el-button type="default" size="small" @click="resetFilters">
                  重置过滤
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-card>

        <!-- 日志列表 -->
        <el-card shadow="hover" class="logs-card">
          <template #header>
            <div class="card-header">
              <span>日志列表 ({{ store.backendLogs.length }} 条)</span>
              <div class="card-actions">
                <el-button type="primary" size="small" @click="refreshBackendLogs" :loading="loadingBackendLogs">
                  刷新
                </el-button>
                <el-button type="danger" size="small" @click="handleClearBackendLogs" :loading="clearingBackendLogs">
                  清空
                </el-button>
                <el-button type="success" size="small" @click="exportLogs">
                  导出
                </el-button>
              </div>
            </div>
          </template>
          
          <div class="backend-logs">
            <div v-if="store.backendLogs.length === 0" class="empty-logs">
              <el-empty description="暂无后端日志" />
            </div>
            <div v-else class="log-list">
              <div v-for="(log, index) in store.backendLogs" :key="index" class="backend-log-item" :class="`log-level-${log.level}`">
                <div class="log-header">
                  <span class="log-timestamp">{{ formatLogTimestamp(log.timestamp) }}</span>
                  <el-tag :type="getLogLevelType(log.level)" size="small">
                    {{ getLogLevelText(log.level) }}
                  </el-tag>
                  <span class="log-source" v-if="log.source">{{ log.source }}</span>
                  <span class="log-id">#{{ index + 1 }}</span>
                </div>
                <div class="log-message">{{ log.message }}</div>
              </div>
            </div>
          </div>
          
          <!-- 分页 -->
          <div v-if="store.backendLogs.length > 0" class="log-pagination">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[50, 100, 200, 500]"
              :total="store.backendLogStats.total"
              layout="total, prev, pager, next"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
            />
          </div>
        </el-card>

        <!-- 日志分析 -->
        <el-card shadow="hover" class="analysis-card">
          <template #header>
            <div class="card-header">
              <span>日志分析</span>
            </div>
          </template>
          <div class="log-analysis">
            <el-row :gutter="20">
              <el-col :span="12">
                <div class="analysis-item">
                  <div class="analysis-label">错误趋势 (最近24小时)</div>
                  <div class="analysis-chart">
                    <div class="chart-placeholder">
                      <el-empty description="图表组件待实现" />
                    </div>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="analysis-item">
                  <div class="analysis-label">日志级别分布</div>
                  <div class="analysis-chart">
                    <div class="chart-placeholder">
                      <el-empty description="图表组件待实现" />
                    </div>
                  </div>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-card>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useTradingStore } from '../stores/trading'

const store = useTradingStore()

// 加载状态
const loadingBackendLogs = ref(false)
const clearingBackendLogs = ref(false)

// 日志过滤
const logFilters = ref({
  level: 'all' as 'all' | 'info' | 'warn' | 'error' | 'debug',
  limit: 100,
  search: '',
  timeRange: [] as Date[],
})

// 分页
const currentPage = ref(1)
const pageSize = ref(100)

// 日志文件信息
const logFileInfo = ref({
  size: '0 KB',
  lastModified: '',
})

// 页面加载时获取日志
onMounted(async () => {
  await refreshBackendLogs()
  await fetchLogFileInfo()
})

// 刷新后端日志
const refreshBackendLogs = async () => {
  loadingBackendLogs.value = true
  try {
    const options: any = {
      level: logFilters.value.level,
      limit: logFilters.value.limit,
      search: logFilters.value.search,
    }
    
    // 添加时间范围过滤
    if (logFilters.value.timeRange && logFilters.value.timeRange.length === 2) {
      const startTime = logFilters.value.timeRange[0]
      const endTime = logFilters.value.timeRange[1]
      if (startTime && endTime) {
        options.since = startTime.getTime()
        options.until = endTime.getTime()
      }
    }
    
    const result = await store.fetchBackendLogs(options)
    
    if (result && result.success) {
      ElMessage.success(`已获取 ${(result.data && result.data.logs ? result.data.logs.length : 0) || 0} 条日志`)
    } else {
      ElMessage.warning((result && result.message) || '获取日志失败')
    }
  } catch (error: any) {
    ElMessage.error('刷新日志失败: ' + error.message)
  } finally {
    loadingBackendLogs.value = false
  }
}

// 清空后端日志
const handleClearBackendLogs = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有后端日志吗？此操作不可恢复。',
      '确认清空',
      {
        confirmButtonText: '确定清空',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    clearingBackendLogs.value = true
    const result = await store.clearBackendLogs()
    if (result?.success) {
      ElMessage.success(result.message || '日志已清空')
    } else {
      ElMessage.warning(result?.message || '清空日志失败')
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('清空日志失败: ' + error.message)
    }
  } finally {
    clearingBackendLogs.value = false
  }
}

// 获取日志文件信息（占位函数）
const fetchLogFileInfo = async () => {
  // 这个API端点不存在，暂时返回占位数据
  logFileInfo.value = {
    size: '未知',
    lastModified: '-',
  }
}

// 格式化日志时间戳
const formatLogTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// 获取日志级别类型
const getLogLevelType = (level: string) => {
  const typeMap: Record<string, any> = {
    'info': 'info',
    'warn': 'warning',
    'error': 'danger',
    'debug': 'success',
  }
  return typeMap[level] || 'info'
}

// 获取日志级别文本
const getLogLevelText = (level: string) => {
  const textMap: Record<string, string> = {
    'info': '信息',
    'warn': '警告',
    'error': '错误',
    'debug': '调试',
  }
  return textMap[level] || level
}

// 处理时间范围变化
const handleTimeRangeChange = () => {
  refreshBackendLogs()
}

// 重置过滤
const resetFilters = () => {
  logFilters.value = {
    level: 'all',
    limit: 100,
    search: '',
    timeRange: [],
  }
  refreshBackendLogs()
}

// 导出日志（前端实现）
const exportLogs = () => {
  try {
    if (store.backendLogs.length === 0) {
      ElMessage.warning('没有日志可导出')
      return
    }
    
    // 创建导出数据
    const exportData = {
      meta: {
        exportedAt: new Date().toISOString(),
        totalLogs: store.backendLogs.length,
        filters: logFilters.value,
      },
      logs: store.backendLogs,
      stats: store.backendLogStats,
    }
    
    // 创建JSON字符串
    const jsonString = JSON.stringify(exportData, null, 2)
    
    // 创建Blob和下载链接
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `logs_${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    
    // 清理URL对象
    URL.revokeObjectURL(url)
    
    ElMessage.success(`已导出 ${store.backendLogs.length} 条日志`)
  } catch (error: any) {
    ElMessage.error('导出日志失败: ' + error.message)
  }
}

// 处理分页大小变化
const handleSizeChange = (size: number) => {
  pageSize.value = size
  logFilters.value.limit = size
  refreshBackendLogs()
}

// 刷新后端日志（带offset参数）
const refreshBackendLogsWithOffset = async (offset: number) => {
  loadingBackendLogs.value = true
  try {
    const options: any = {
      level: logFilters.value.level,
      limit: pageSize.value,
      offset: offset,
      search: logFilters.value.search,
    }
    
    // 添加时间范围过滤
    if (logFilters.value.timeRange && logFilters.value.timeRange.length === 2) {
      const startTime = logFilters.value.timeRange[0]
      const endTime = logFilters.value.timeRange[1]
      if (startTime && endTime) {
        options.since = startTime.getTime()
        options.until = endTime.getTime()
      }
    }
    
    const result = await store.fetchBackendLogs(options)
    
    if (result && result.success) {
      ElMessage.success(`已获取第${currentPage.value}页日志 (${(result.data && result.data.logs ? result.data.logs.length : 0) || 0} 条)`)
    } else {
      ElMessage.warning((result && result.message) || '获取日志失败')
    }
  } catch (error: any) {
    ElMessage.error('刷新日志失败: ' + error.message)
  } finally {
    loadingBackendLogs.value = false
  }
}

// 处理当前页变化
const handleCurrentChange = (page: number) => {
  currentPage.value = page
  // 计算offset：从0开始，所以第1页offset=0，第2页offset=pageSize，以此类推
  const offset = (page - 1) * pageSize.value
  // 调用API获取对应页面的数据
  refreshBackendLogsWithOffset(offset)
}
</script>

<style scoped>
.backend-logs-container {
  min-height: calc(100vh - 70px); /* 减去底部导航高度 */
  background: #f5f7fa;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .backend-logs-container {
    min-height: calc(100vh - 60px);
  }
}

@media (max-width: 480px) {
  .backend-logs-container {
    min-height: calc(100vh - 55px);
  }
}

/* 桌面端适配 */
@media (min-width: 769px) {
  .backend-logs-container {
    min-height: calc(100vh - 80px);
  }
}

.header {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.header-content h1 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.main-content {
  padding: 20px;
}

/* 统计卡片 */
.stats-card {
  margin-bottom: 20px;
}

.log-stats {
  margin-bottom: 20px;
}

.log-stat-item {
  text-align: center;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.log-stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.log-stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.level-stats {
  margin-top: 20px;
}

.level-stat-item {
  text-align: center;
  padding: 15px;
  border-radius: 4px;
}

.level-stat-item.info {
  background: #ecf5ff;
  border: 1px solid #409eff;
}

.level-stat-item.warn {
  background: #fdf6ec;
  border: 1px solid #e6a23c;
}

.level-stat-item.error {
  background: #fef0f0;
  border: 1px solid #f56c6c;
}

.level-stat-item.debug {
  background: #f0f9eb;
  border: 1px solid #67c23a;
}

.level-stat-label {
  font-size: 14px;
  margin-bottom: 8px;
  font-weight: bold;
}

.level-stat-item.info .level-stat-label {
  color: #409eff;
}

.level-stat-item.warn .level-stat-label {
  color: #e6a23c;
}

.level-stat-item.error .level-stat-label {
  color: #f56c6c;
}

.level-stat-item.debug .level-stat-label {
  color: #67c23a;
}

.level-stat-value {
  font-size: 20px;
  font-weight: bold;
}

.level-stat-item.info .level-stat-value {
  color: #409eff;
}

.level-stat-item.warn .level-stat-value {
  color: #e6a23c;
}

.level-stat-item.error .level-stat-value {
  color: #f56c6c;
}

.level-stat-item.debug .level-stat-value {
  color: #67c23a;
}

/* 过滤卡片 */
.filters-card {
  margin-bottom: 20px;
}

.log-filters {
  padding: 15px;
}

/* 日志卡片 */
.logs-card {
  margin-bottom: 20px;
}

.backend-logs {
  max-height: 500px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.backend-log-item {
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.backend-log-item:hover {
  background: #f5f7fa;
}

.backend-log-item.log-level-error {
  background-color: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.backend-log-item.log-level-warn {
  background-color: #fdf6ec;
  border-left: 3px solid #e6a23c;
}

.backend-log-item.log-level-info {
  background-color: #f4f4f5;
  border-left: 3px solid #909399;
}

.backend-log-item.log-level-debug {
  background-color: #f0f9eb;
  border-left: 3px solid #67c23a;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.card-actions{
  /* //显示在右侧 */
  display: flex;
  justify-content: space-between;
  gap: 10px;

}

.log-timestamp {
  color: #909399;
  font-size: 11px;
}

.log-source {
  color: #409eff;
  font-size: 11px;
  background: #ecf5ff;
  padding: 2px 6px;
  border-radius: 3px;
}

.log-id {
  color: #909399;
  font-size: 11px;
  margin-left: auto;
}

.log-message {
  color: #606266;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-logs {
  padding: 40px 0;
}

.log-pagination {
  margin-top: 20px;
  text-align: center;
}

/* 分析卡片 */
.analysis-card {
  margin-bottom: 20px;
}

.log-analysis {
  padding: 10px 0;
}

.analysis-item {
  padding: 15px;
}

.analysis-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 10px;
  font-weight: bold;
}

.analysis-chart {
  height: 200px;
  background: #f5f7fa;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-placeholder {
  text-align: center;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
    padding: 10px 0;
  }
  
  .header-content h1 {
    font-size: 18px;
    width: 100%;
  }
  
  .header-actions {
    margin-top: 10px;
    width: 100%;
    justify-content: flex-start;
  }
  
  .main-content {
    padding: 10px;
  }
  
  .log-stat-item {
    padding: 10px 5px;
    margin-bottom: 10px;
  }
  
  .log-stat-value {
    font-size: 20px;
  }
  
  .log-stat-label {
    font-size: 12px;
  }
  
  .level-stat-item {
    padding: 10px 5px;
  }
  
  .level-stat-value {
    font-size: 18px;
  }
  
  .level-stat-label {
    font-size: 12px;
  }
  
  .log-filters {
    padding: 10px;
  }
  
  .log-filters :deep(.el-form-item) {
    margin-bottom: 10px;
    width: 100%;
  }
  
  .log-filters :deep(.el-form-item__label) {
    text-align: left;
  }
  
  .backend-logs {
    max-height: 300px;
  }
  
  .backend-log-item {
    padding: 8px;
    font-size: 11px;
  }
  
  .log-header {
    gap: 5px;
  }
  
  .log-timestamp {
    font-size: 10px;
  }
  
  .log-source, .log-id {
    font-size: 10px;
  }
}
</style>
