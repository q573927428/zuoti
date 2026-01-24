<template>
  <div class="bottom-navigation">
    <div class="nav-container">
      <div 
        v-for="item in navItems" 
        :key="item.path"
        class="nav-item"
        :class="{ 'active': isActive(item.path) }"
        @click="navigateTo(item.path)"
      >
        <div class="nav-icon">
          {{ item.icon }}
        </div>
        <div class="nav-label">{{ item.label }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from '#imports'

const router = useRouter()

// 导航项配置 - 使用简单的文本图标
const navItems = ref([
  {
    path: '/',
    label: '首页',
    icon: '🏠'
  },
  {
    path: '/manual-trading',
    label: '手动交易',
    icon: '📊'
  },
  {
    path: '/backend-logs',
    label: '后端日志',
    icon: '📋'
  }
])

// 检查当前路由是否激活
const isActive = (path: string) => {
  const currentPath = router.currentRoute.value.path
  if (path === '/') {
    return currentPath === path
  }
  return currentPath.startsWith(path)
}

// 导航到指定页面
const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<style scoped>
.bottom-navigation {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  padding: 8px 0;
  border-top: 1px solid #ebeef5;
}

.nav-container {
  display: flex;
  justify-content: space-around;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 8px;
  min-width: 80px;
}

.nav-item:hover {
  background-color: #f5f7fa;
}

.nav-item.active {
  color: #409eff;
}

.nav-item.active .nav-icon {
  color: #409eff;
}

.nav-item.active .nav-label {
  font-weight: 600;
}

.nav-icon {
  font-size: 20px;
  margin-bottom: 4px;
  color: #909399;
  transition: color 0.3s ease;
  line-height: 1;
}

.nav-label {
  font-size: 12px;
  color: #606266;
  transition: color 0.3s ease;
  text-align: center;
  line-height: 1.2;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .nav-item {
    padding: 6px 12px;
    min-width: 70px;
  }
  
  .nav-icon {
    font-size: 18px;
    margin-bottom: 3px;
  }
  
  .nav-label {
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .nav-item {
    padding: 4px 8px;
    min-width: 60px;
  }
  
  .nav-icon {
    font-size: 16px;
    margin-bottom: 2px;
  }
  
  .nav-label {
    font-size: 10px;
  }
}

/* 桌面端适配 */
@media (min-width: 769px) {
  .bottom-navigation {
    padding: 12px 0;
  }
  
  .nav-item {
    padding: 10px 20px;
    min-width: 100px;
  }
  
  .nav-icon {
    font-size: 24px;
    margin-bottom: 6px;
  }
  
  .nav-label {
    font-size: 14px;
  }
}
</style>