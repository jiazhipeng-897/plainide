<template>
  <el-dialog
    v-model="visible"
    title="选择终端类型"
    width="380px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleCancel"
  >
    <div class="selector-body">
      <!-- 终端类型选择 -->
      <div class="option-group">
        <div
          class="option-item"
          :class="{ active: selectedShell === 'cmd' }"
          @click="selectedShell = 'cmd'"
        >
          <span class="option-label">CMD</span>
          <span class="option-check" v-if="selectedShell === 'cmd'">✓</span>
        </div>
        <div
          class="option-item"
          :class="{ active: selectedShell === 'powershell' }"
          @click="selectedShell = 'powershell'"
        >
          <span class="option-label">PowerShell</span>
          <span class="option-check" v-if="selectedShell === 'powershell'">✓</span>
        </div>
      </div>

      <!-- 记住上一次 -->
      <div class="remember-group">
        <span class="remember-label">记住上一次？</span>
        <el-radio-group v-model="rememberChoice" size="small">
          <el-radio-button :value="true">是</el-radio-button>
          <el-radio-button :value="false">否</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <template #footer>
      <!-- 确定放左边，取消放右边 -->
      <el-button size="default" type="primary" @click="handleConfirm">确定</el-button>
      <el-button size="default" @click="handleCancel">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const visible = ref(false)
const selectedShell = ref('cmd')
const rememberChoice = ref(false)

watch(() => props.modelValue, (val) => {
  visible.value = val
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

function reset() {
  selectedShell.value = 'cmd'
  rememberChoice.value = false
}

function handleConfirm() {
  emit('confirm', {
    shell: selectedShell.value,
    remember: rememberChoice.value
  })
  visible.value = false
  reset()
}

function handleCancel() {
  emit('cancel')
  visible.value = false
  reset()
}

defineExpose({
  open: () => {
    visible.value = true
    selectedShell.value = 'cmd'
    rememberChoice.value = false
  },
  close: () => {
    visible.value = false
  }
})
</script>

<style scoped>
.selector-body {
  padding: 8px 0;
}

.option-group {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.option-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: var(--space-12) var(--space-16);
  border: 2px solid var(--border-default);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--surface-window);
  position: relative;
}

.option-item:hover {
  border-color: var(--border-raised);
  background: var(--surface-panel-1);
}

.option-item.active {
  border-color: var(--info);
  background: var(--surface-detail);
}

.option-label {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

.option-check {
  margin-left: auto;
  color: var(--info);
  font-size: 16px;
  font-weight: bold;
}

.remember-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.remember-label {
  color: var(--text-subtle);
  font-size: 13px;
}

/* ===== Element Plus 组件样式覆盖 ===== */
:deep(.el-radio-button__inner) {
  background: var(--surface-window) !important;
  border-color: var(--border-default) !important;
  color: var(--text-subtle) !important;
}

:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--info) !important;
  border-color: var(--info) !important;
  color: var(--text-inverse) !important;
}

:deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: 4px 0 0 4px !important;
}

:deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 4px 4px 0 !important;
}

:deep(.el-button--primary) {
  background: var(--info) !important;
  border-color: var(--info) !important;
}

:deep(.el-button--primary:hover) {
  background: var(--info-hover) !important;
  border-color: var(--info-hover) !important;
}

/* 底部按钮：确定在左，取消在右 */
:deep(.el-dialog__footer) {
  display: flex !important;
  flex-direction: row !important;
  gap: 10px !important;
  justify-content: flex-start !important;
}
</style>

<style>
/* ===== 弹窗位置：垂直居中偏下，距离顶部 20% ===== */
.terminal-selector-dialog .el-dialog {
  margin-top: 20vh !important;
}
</style>