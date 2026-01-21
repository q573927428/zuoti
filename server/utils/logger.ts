import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * 日志收集器 - 用于收集和存储后端日志
 */
export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private unsavedLogs: LogEntry[] = []; // 未保存的日志队列
  private maxLogs = 1000; // 内存中最多保留1000条日志（用于快速查询）
  private logDir: string;
  private currentLogFile: string;
  private saveInterval: NodeJS.Timeout | null = null;
  private readonly SAVE_INTERVAL_MS = 30 * 1000; // 每30秒保存一次
  private readonly MAX_LOG_FILES = 30; // 最多保留30天的日志文件
  private isShuttingDown = false; // 标记是否正在关闭
  
  constructor() {
    // 初始化日志目录
    this.logDir = path.join(process.cwd(), 'logs');
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    
    // 设置当前日志文件
    this.currentLogFile = this.getLogFileName();
    
    // 加载历史日志（只加载最近的部分）
    this.loadHistoricalLogs();
    
    // 重写console方法以捕获日志
    this.interceptConsole();
    
    // 启动定期保存
    this.startAutoSave();
    
    // 注册优雅关闭处理
    this.registerShutdownHandlers();
    
    // 添加启动日志
    console.log(`📁 日志持久化已启用，日志目录: ${this.logDir}`);
    console.log(`📝 日志配置: 内存保留${this.maxLogs}条，文件全量保存，保留${this.MAX_LOG_FILES}天`);
  }
  
  /**
   * 获取日志文件名
   */
  private getLogFileName(date?: Date): string {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `trading-${dateStr}.log`);
  }
  
  /**
   * 加载历史日志（只加载最近的部分到内存）
   */
  private async loadHistoricalLogs() {
    try {
      // 尝试加载今天的日志文件
      if (existsSync(this.currentLogFile)) {
        const content = await fs.readFile(this.currentLogFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        // 只加载最后 maxLogs 条到内存
        const startIdx = Math.max(0, lines.length - this.maxLogs);
        const recentLines = lines.slice(startIdx);
        
        for (const line of recentLines) {
          try {
            const logEntry = JSON.parse(line) as LogEntry;
            this.logs.push(logEntry);
          } catch {
            // 忽略解析失败的行
          }
        }
        
        console.log(`📂 从文件加载了 ${this.logs.length} 条最近日志（文件共${lines.length}条）`);
      }
    } catch (error) {
      console.error('加载历史日志失败:', error);
    }
  }
  
  /**
   * 保存日志到文件（追加模式，只保存新增的日志）
   */
  private async saveLogsToFile() {
    try {
      // 如果没有未保存的日志，直接返回
      if (this.unsavedLogs.length === 0) {
        return;
      }
      
      // 检查是否需要切换日志文件（新的一天）
      const newLogFile = this.getLogFileName();
      const isNewDay = newLogFile !== this.currentLogFile;
      
      if (isNewDay) {
        // 先保存当前未保存的日志到旧文件
        if (this.unsavedLogs.length > 0) {
          const logLines = this.unsavedLogs.map(log => JSON.stringify(log)).join('\n') + '\n';
          await fs.appendFile(this.currentLogFile, logLines, 'utf-8');
          this.unsavedLogs = [];
        }
        
        // 切换到新文件
        this.currentLogFile = newLogFile;
        console.log(`🔄 切换到新的日志文件: ${path.basename(this.currentLogFile)}`);
        
        // 清理旧日志文件
        await this.cleanupOldLogs();
        return;
      }
      
      // 批量追加未保存的日志到文件
      const logsToSave = [...this.unsavedLogs];
      const logLines = logsToSave.map(log => JSON.stringify(log)).join('\n') + '\n';
      
      await fs.appendFile(this.currentLogFile, logLines, 'utf-8');
      
      // 清空未保存队列
      this.unsavedLogs = [];
      
    } catch (error) {
      console.error('保存日志到文件失败:', error);
    }
  }
  
  /**
   * 清理旧日志文件
   */
  private async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(file => file.startsWith('trading-') && file.endsWith('.log'));
      
      if (logFiles.length > this.MAX_LOG_FILES) {
        // 按日期排序，删除最旧的
        logFiles.sort();
        const filesToDelete = logFiles.slice(0, logFiles.length - this.MAX_LOG_FILES);
        
        for (const file of filesToDelete) {
          const filePath = path.join(this.logDir, file);
          await fs.unlink(filePath);
          console.log(`🗑️  删除旧日志文件: ${file}`);
        }
      }
    } catch (error) {
      console.error('清理旧日志文件失败:', error);
    }
  }
  
  /**
   * 启动自动保存
   */
  private startAutoSave() {
    this.saveInterval = setInterval(() => {
      this.saveLogsToFile();
    }, this.SAVE_INTERVAL_MS);
  }
  
  /**
   * 停止自动保存
   */
  private stopAutoSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }
  
  /**
   * 注册优雅关闭处理
   */
  private registerShutdownHandlers() {
    const shutdownHandler = async () => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      console.log('🛑 正在关闭日志系统，保存未保存的日志...');
      
      // 停止定期保存
      this.stopAutoSave();
      
      // 保存所有未保存的日志
      await this.saveLogsToFile();
      
      console.log('✅ 日志系统已安全关闭');
    };
    
    // 监听各种退出信号
    process.on('beforeExit', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGHUP', shutdownHandler);
  }
  
  /**
   * 拦截console方法
   */
  private interceptConsole() {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
    };
    
    // 重写console.log
    console.log = (...args) => {
      this.addLog('info', args);
      originalConsole.log.apply(console, args);
    };
    
    // 重写console.warn
    console.warn = (...args) => {
      this.addLog('warn', args);
      originalConsole.warn.apply(console, args);
    };
    
    // 重写console.error
    console.error = (...args) => {
      this.addLog('error', args);
      originalConsole.error.apply(console, args);
    };
    
    // 重写console.info
    console.info = (...args) => {
      this.addLog('info', args);
      originalConsole.info.apply(console, args);
    };
    
    // 重写console.debug
    console.debug = (...args) => {
      this.addLog('debug', args);
      originalConsole.debug.apply(console, args);
    };
  }
  
  /**
   * 添加日志
   */
  private addLog(level: LogEntry['level'], args: any[]) {
    try {
      // 将参数转换为字符串
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level,
        message,
        source: this.getCallerSource(),
      };
      
      // 添加到内存日志队列（最新的在前面）
      this.logs.unshift(logEntry);
      
      // 添加到未保存队列（保持时间顺序，用于追加到文件）
      this.unsavedLogs.push(logEntry);
      
      // 限制内存中的日志数量
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(0, this.maxLogs);
      }
    } catch (error) {
      // 如果日志记录失败，至少输出到原始console
      const originalConsole = console;
      originalConsole.error('日志记录失败:', error);
    }
  }
  
  /**
   * 获取调用者源信息
   */
  private getCallerSource(): string {
    try {
      const error = new Error();
      const stack = error.stack?.split('\n') || [];
      
      // 查找第一个不是logger.ts的调用栈
      for (let i = 3; i < stack.length; i++) {
        const line = stack[i].trim();
        if (!line.includes('logger.ts') && !line.includes('Logger.addLog')) {
          // 提取文件名和行号
          const match = line.match(/\((.*):(\d+):(\d+)\)/) || line.match(/at (.*):(\d+):(\d+)/);
          if (match) {
            const filePath = match[1];
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            return `${fileName}:${match[2]}`;
          }
          return line;
        }
      }
    } catch {
      // 忽略错误
    }
    return 'unknown';
  }
  
  /**
   * 获取日志
   */
  getLogs(options?: {
    level?: LogEntry['level'] | 'all';
    limit?: number;
    since?: number;
    search?: string;
  }): LogEntry[] {
    let filteredLogs = [...this.logs];
    
    const { level = 'all', limit = 100, since = 0, search = '' } = options || {};
    
    // 按时间过滤
    if (since > 0) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= since);
    }
    
    // 按级别过滤
    if (level !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    // 按搜索词过滤
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        log.source?.toLowerCase().includes(searchLower)
      );
    }
    
    // 限制数量
    return filteredLogs.slice(0, limit);
  }
  
  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = [];
  }
  
  /**
   * 获取日志统计
   */
  getStats() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const logsLastHour = this.logs.filter(log => log.timestamp >= oneHourAgo);
    const logsLastDay = this.logs.filter(log => log.timestamp >= oneDayAgo);
    
    return {
      total: this.logs.length,
      lastHour: logsLastHour.length,
      lastDay: logsLastDay.length,
      byLevel: {
        info: this.logs.filter(log => log.level === 'info').length,
        warn: this.logs.filter(log => log.level === 'warn').length,
        error: this.logs.filter(log => log.level === 'error').length,
        debug: this.logs.filter(log => log.level === 'debug').length,
      },
    };
  }
}

// 创建全局日志实例
export const logger = new Logger();

/**
 * 获取日志实例
 */
export function getLogger() {
  return logger;
}

// 立即初始化日志收集器
// 这确保在模块加载时就开始捕获日志
logger.getLogs(); // 触发初始化
