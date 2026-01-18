# 交易机器人模块化架构

## 概述

本目录包含重构后的交易机器人核心模块，采用面向对象和模块化设计，提高了代码的可维护性、可测试性和可扩展性。

## 架构设计

### 模块结构

```
server/modules/trading-bot/
├── DataManager.ts           # 数据持久化管理
├── OrderManager.ts          # 订单操作管理
├── DailyResetHandler.ts     # 日切处理逻辑
├── StateHandlers.ts         # 交易状态处理器
├── index.ts                 # 模块导出
└── README.md                # 本文档
```

### 核心模块

#### 1. DataManager (数据管理器)

**职责：**
- 加载和保存交易配置、状态、记录和统计数据
- 提供默认配置和初始化逻辑
- 实现数据保存的重试机制

**主要方法：**
- `loadConfig()` - 加载配置和统计数据
- `loadTradingData()` - 加载交易数据和状态
- `saveData()` - 保存所有数据（带重试）
- `getDefaultConfig()` - 获取默认配置
- `getDefaultStatus()` - 获取默认状态
- `getDefaultStats()` - 获取默认统计

**使用示例：**
```typescript
const dataManager = new DataManager()
const { config, stats } = await dataManager.loadConfig()
await dataManager.saveData(config, stats, status, records)
```

---

#### 2. OrderManager (订单管理器)

**职责：**
- 封装所有订单相关操作
- 提供订单查询和状态检查
- 管理订单生命周期

**主要方法：**
- `createBuy()` - 创建买单
- `createSell()` - 创建卖单
- `getOrderStatus()` - 查询订单状态
- `cancel()` - 取消订单
- `getCurrentPrice()` - 获取当前价格
- `isFullyFilled()` - 检查是否完全成交
- `isCanceled()` - 检查是否已取消
- `getActualPrice()` - 获取实际成交价格
- `getActualAmount()` - 获取实际成交数量
- `getOrderActiveTime()` - 获取订单活跃时间

**使用示例：**
```typescript
const orderManager = new OrderManager()
const buyOrder = await orderManager.createBuy(symbol, amount, price)
const status = await orderManager.getOrderStatus(symbol, orderId)
```

---

#### 3. DailyResetHandler (日切处理器)

**职责：**
- 检测日期变更
- 处理未完成的交易（强制平仓）
- 重置每日统计数据
- 处理日切时的各种状态

**主要方法：**
- `checkAndReset()` - 检查并执行日切处理
- `handlePendingTrades()` - 处理未完成的交易
- `handlePendingBuyOrder()` - 处理未成交买单
- `handlePendingSellOrder()` - 处理未成交卖单
- `handleBoughtState()` - 处理已买入状态
- `forceSell()` - 强制市价卖出

**使用示例：**
```typescript
const resetHandler = new DailyResetHandler(orderManager)
const result = await resetHandler.checkAndReset(stats, status, records)
if (result.needsReset) {
  // 更新状态和统计
}
```

---

#### 4. StateHandlers (状态处理器)

**职责：**
- 处理所有交易状态的业务逻辑
- 实现状态机的各个状态转换
- 包含所有安全检查和保护机制

**主要方法：**
- `handleIdle()` - 处理空闲状态（寻找机会）
- `handleBuyOrderPlaced()` - 处理买单已挂状态
- `handleBought()` - 处理已买入状态（挂卖单）
- `handleSellOrderPlaced()` - 处理卖单已挂状态
- `checkBalance()` - 余额检查
- `validatePrecision()` - 交易精度验证
- `checkStopLoss()` - 硬止损检查
- `executeStopLoss()` - 执行止损

**状态流转：**
```
IDLE → BUY_ORDER_PLACED → BOUGHT → SELL_ORDER_PLACED → DONE → IDLE
  ↓           ↓              ↓             ↓
  ↓           ↓              ↓             ↓
  └─────── 各种保护机制和超时处理 ─────────┘
```

**使用示例：**
```typescript
const stateHandlers = new StateHandlers(orderManager, config)
const newStatus = await stateHandlers.handleIdle(status, records, stats)
```

---

## 主程序集成

### TradingBot 类

主交易机器人类整合所有模块：

```typescript
class TradingBot {
  private dataManager: DataManager
  private orderManager: OrderManager
  private dailyResetHandler: DailyResetHandler
  private stateHandlers: StateHandlers
  
  constructor() {
    this.dataManager = new DataManager()
    this.orderManager = new OrderManager()
    this.dailyResetHandler = new DailyResetHandler(this.orderManager)
  }
  
  async initialize() { /* 初始化 */ }
  async tradingLoop() { /* 主循环 */ }
  async processCurrentState() { /* 状态处理 */ }
}
```

---

## 设计优势

### 1. 模块化
- 每个模块职责单一，易于理解和维护
- 模块之间低耦合，可独立测试

### 2. 可扩展性
- 新增功能只需修改对应模块
- 易于添加新的交易策略或状态

### 3. 可维护性
- 代码结构清晰，逻辑分层明确
- 减少重复代码，统一处理逻辑

### 4. 可测试性
- 每个模块可独立单元测试
- 依赖注入便于模拟测试

### 5. 代码复用
- 通用逻辑封装在基础模块中
- 避免代码重复，提高代码质量

---

## 功能完整性

重构后保留了所有原有功能：

- ✅ 自动交易循环
- ✅ 市场分析和交易机会识别
- ✅ 买单/卖单自动挂单和监控
- ✅ 订单超时处理
- ✅ 价格保护机制
- ✅ 硬止损机制（-3%）
- ✅ 日切强制平仓
- ✅ 余额和精度验证
- ✅ 部分成交处理
- ✅ 交易记录和统计
- ✅ 数据持久化（带重试）
- ✅ 并发锁保护

---

## 使用指南

### 修改配置

如需修改配置，只需在 `DataManager` 中调整默认值：

```typescript
getDefaultConfig(): SystemConfig {
  return {
    isTestnet: false,
    isAutoTrading: false,
    symbols: ['ETH/USDT', 'BTC/USDT'],
    investmentAmount: 100,
    amplitudeThreshold: 0.5,
    trendThreshold: 5.0,
    orderTimeout: 60 * 60 * 1000,
  }
}
```

### 添加新功能

1. **新增状态处理逻辑**：在 `StateHandlers` 中添加方法
2. **新增数据字段**：在 `types/trading.ts` 中定义类型
3. **新增订单操作**：在 `OrderManager` 中封装
4. **新增日切逻辑**：在 `DailyResetHandler` 中实现

---

## 注意事项

1. **数据一致性**：所有状态更新后必须调用 `saveData()`
2. **错误处理**：每个模块都有适当的错误处理和日志
3. **并发控制**：主循环有并发锁，防止重复执行
4. **依赖关系**：StateHandlers 依赖 OrderManager 和 Config

---

## 维护建议

1. 定期检查日志，确保所有功能正常
2. 测试环境先验证新功能
3. 备份数据文件再更新
4. 保持模块职责单一
5. 遵循现有代码风格

---

## 版本历史

- **v2.0** (2026-01-18): 完成模块化重构
  - 拆分为4个核心模块
  - 面向对象设计
  - 提高代码可维护性

- **v1.0** (之前): 单文件实现
  - 所有功能在一个文件中
  - 过程式编程风格
