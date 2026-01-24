<template>
  <div class="app-container">
    <NuxtPage />
    <BottomNavigation />
  </div>
</template>

<script setup lang="ts">
import BottomNavigation from './components/BottomNavigation.vue'
</script>

<style>
.app-container {
  min-height: 100vh;
  padding-bottom: 70px; /* 为底部导航留出空间 */
  box-sizing: border-box;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .app-container {
    padding-bottom: 60px;
  }
}

@media (max-width: 480px) {
  .app-container {
    padding-bottom: 55px;
  }
}

/* 桌面端适配 */
@media (min-width: 769px) {
  .app-container {
    padding-bottom: 80px;
  }
}
</style>
