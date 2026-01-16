/**
 * 获取当前日期（本地时区，格式：YYYY-MM-DD）
 */
export function getCurrentDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取指定时间戳的日期（本地时区，格式：YYYY-MM-DD）
 */
export function getDateFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 判断两个时间戳是否是同一天（本地时区）
 */
export function isSameDay(timestamp1: number, timestamp2: number): boolean {
  return getDateFromTimestamp(timestamp1) === getDateFromTimestamp(timestamp2)
}
