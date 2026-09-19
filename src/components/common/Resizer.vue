<template>
  <div
    class="resizer"
    :class="direction"
    @mousedown="startResize"
  >
    <!-- 视觉指示条 -->
    <div class="resizer-track"></div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  direction: {
    type: String,
    default: 'vertical',
  },
})

const emit = defineEmits(['resize'])
const isResizing = ref(false)
const startPos = ref(0)

const startResize = (e) => {
  isResizing.value = true
  startPos.value = props.direction === 'vertical' ? e.clientX : e.clientY
  document.body.style.cursor = props.direction === 'vertical' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()

  const onMove = (e) => {
    if (!isResizing.value) return
    const current = props.direction === 'vertical' ? e.clientX : e.clientY
    const delta = current - startPos.value
    startPos.value = current
    emit('resize', delta)
  }

  const onUp = () => {
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.resizer {
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  transition: background 0.25s ease;
}

.resizer.vertical {
  width: 8px;
  cursor: col-resize;
}

.resizer.horizontal {
  height: 8px;
  cursor: row-resize;
}

.resizer-track {
  border-radius: 0;
  background: transparent;
  transition: all 0.25s ease;
}

.resizer.vertical .resizer-track {
  width: 1px;
  height: 40%;
  min-height: 16px;
}

.resizer.horizontal .resizer-track {
  height: 1px;
  width: 40%;
  min-width: 16px;
}

.resizer:hover .resizer-track {
  background: var(--accent-soft-30);
}

.resizer:active .resizer-track {
  background: var(--accent-soft-55);
}

.resizer.vertical:active .resizer-track {
  width: 2px;
}

.resizer.horizontal:active .resizer-track {
  height: 2px;
}

.resizer:active .resizer-track {
  box-shadow: 0 0 6px var(--accent-soft-55);
}

.resizer:active {
  background: var(--accent-soft-06);
}
</style>