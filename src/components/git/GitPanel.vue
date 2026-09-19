<template>
  <div class="git-panel">
    <!-- ===== 头部：分支 + 操作 ===== -->
    <div class="git-header">
      <button
        class="branch-btn"
        :class="{ 'not-repo': !gitStore.isRepo }"
        :disabled="!gitStore.isRepo"
        :title="gitStore.isRepo ? '点击管理分支' : ''"
        @click="openBranches"
      >
        ⎇ {{ gitStore.isRepo ? (gitStore.branch || '无分支') : '非 Git 仓库' }}
      </button>
      <div class="git-actions">
        <button v-if="gitStore.isRepo && hasRemote" class="icon-btn" title="拉取（pull）" @click="onPull">⇣</button>
        <button v-if="gitStore.isRepo && hasRemote" class="icon-btn" title="推送（push）" @click="onPush">⇡</button>
        <button v-if="gitStore.isRepo" class="icon-btn" title="提交历史" @click="openLog">◷</button>
        <button class="icon-btn" title="刷新状态" @click="onRefresh">⟳</button>
      </div>
    </div>

    <div v-if="gitStore.loading" class="git-empty">正在读取 Git 状态...</div>

    <!-- ===== 空态：未打开项目 ===== -->
    <div v-else-if="!projectStore.projectPath" class="git-empty">
      打开项目后可查看 Git 状态
    </div>

    <!-- ===== 空态：非 Git 仓库 ===== -->
    <div v-else-if="!gitStore.isRepo" class="git-empty">
      <p>当前目录不是 Git 仓库</p>
      <button class="mini-btn" @click="onInitRepo">初始化仓库</button>
    </div>

    <!-- ===== 有变更 ===== -->
    <template v-else>
      <div v-if="!gitStore.changes.length" class="git-empty">
        没有待提交的变更 ✓
      </div>

      <div v-else class="git-changes">
        <!-- 已暂存 -->
        <ChangeGroup
          v-if="gitStore.stagedChanges.length"
          title="已暂存"
          :items="gitStore.stagedChanges"
          :staged="true"
          @stage="onUnstage"
          @diff="openDiff"
        />
        <!-- 未暂存 -->
        <ChangeGroup
          v-if="gitStore.unstagedChanges.length"
          title="已修改"
          :items="gitStore.unstagedChanges"
          :staged="false"
          @stage="onStage"
          @diff="openDiff"
          @discard="onDiscard"
        />
        <!-- 未跟踪 -->
        <ChangeGroup
          v-if="gitStore.untrackedChanges.length"
          title="未跟踪"
          :items="gitStore.untrackedChanges"
          :staged="false"
          untracked
          @stage="onStage"
        />
      </div>

      <!-- ===== 提交区 ===== -->
      <div class="git-commit-bar">
        <input
          v-model="commitMessage"
          class="commit-input"
          placeholder="提交信息（如：修复登录 bug）"
          @keydown.enter="onCommit"
        />
        <button class="commit-btn" :disabled="!canCommit" @click="onCommit">
          提交
        </button>
      </div>
    </template>

    <!-- ===== Diff 预览弹窗 ===== -->
    <GitDiffDialog
      v-if="diffVisible"
      :project-path="projectStore.projectPath"
      :file-path="diffFile"
      :staged="diffStaged"
      @close="diffVisible = false"
    />

    <!-- ===== 分支管理弹窗 ===== -->
    <el-dialog
      v-model="branchDialogVisible"
      title="分支管理"
      width="420px"
      top="12vh"
      append-to-body
      class="git-sub-dialog"
    >
      <div class="branch-list">
        <div v-for="b in branches" :key="b" class="branch-row" :class="{ current: b === gitStore.branch }">
          <span class="branch-name" :title="b">{{ b }}</span>
          <span v-if="b === gitStore.branch" class="branch-current">当前</span>
          <div v-else class="branch-ops">
            <button class="op-btn" @click="switchBranch(b)">切换</button>
            <button class="op-btn danger" @click="removeBranch(b)">删除</button>
          </div>
        </div>
        <div v-if="!branches.length" class="git-empty">暂无分支</div>
      </div>
      <div class="branch-create">
        <input
          v-model="newBranchName"
          class="commit-input"
          placeholder="输入新分支名，回车创建并切换"
          @keydown.enter="createNewBranch"
        />
        <button class="commit-btn" :disabled="!newBranchName.trim()" @click="createNewBranch">新建</button>
      </div>
    </el-dialog>

    <!-- ===== 提交历史弹窗 ===== -->
    <el-dialog
      v-model="logDialogVisible"
      title="提交历史"
      width="520px"
      top="12vh"
      append-to-body
      class="git-sub-dialog"
    >
      <div class="log-list">
        <div v-for="(c, i) in commits" :key="i" class="log-row" :title="c">{{ c }}</div>
        <div v-if="!commits.length" class="git-empty">暂无提交记录</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useGitStore } from '@/stores/git'
import GitDiffDialog from './GitDiffDialog.vue'
import ChangeGroup from './ChangeGroup.vue'

const projectStore = useProjectStore()
const gitStore = useGitStore()

const commitMessage = ref('')

// 项目路径变化时自动跟随刷新 Git 状态
watch(
  () => projectStore.projectPath,
  async (p) => {
    if (p) {
      await gitStore.refresh(p)
      await refreshRemote()
    } else {
      gitStore.reset()
      hasRemote.value = false
    }
  },
  { immediate: true }
)

const canCommit = computed(
  () => gitStore.changes.some((c) => c.staged) && commitMessage.value.trim().length > 0
)

const diffVisible = ref(false)
const diffFile = ref('')
const diffStaged = ref(false)

const onRefresh = async () => {
  await gitStore.refresh(projectStore.projectPath)
  await refreshRemote()
}

// 是否有远端仓库（决定显示拉取/推送按钮）
const hasRemote = ref(false)
const refreshRemote = async () => {
  if (!projectStore.projectPath || !gitStore.isRepo) {
    hasRemote.value = false
    return
  }
  try {
    const r = await gitStore.getRemote(projectStore.projectPath)
    hasRemote.value = r.hasRemote
  } catch {
    hasRemote.value = false
  }
}

// ---- 分支管理 ----
const branchDialogVisible = ref(false)
const branches = ref([])
const newBranchName = ref('')

const openBranches = async () => {
  branchDialogVisible.value = true
  newBranchName.value = ''
  await loadBranches()
}

const loadBranches = async () => {
  try {
    const r = await gitStore.listBranches(projectStore.projectPath)
    branches.value = r.branches
    if (r.current) gitStore.branch = r.current
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const switchBranch = async (b) => {
  try {
    await gitStore.checkout(projectStore.projectPath, b)
    ElMessage.success('已切换到 ' + b)
    await loadBranches()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const createNewBranch = async () => {
  const name = newBranchName.value.trim()
  if (!name) return
  try {
    await gitStore.createBranch(projectStore.projectPath, name)
    ElMessage.success('已创建并切换到 ' + name)
    newBranchName.value = ''
    await loadBranches()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const removeBranch = async (b) => {
  try {
    await ElMessageBox.confirm(`确定删除分支 "${b}" 吗？未合并的改动将无法找回。`, '删除分支', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await gitStore.deleteBranch(projectStore.projectPath, b)
    ElMessage.success('已删除 ' + b)
    await loadBranches()
  } catch (e) {
    if (e !== 'cancel' && !String(e?.message || '').includes('cancel')) {
      ElMessage.error(e?.message || '删除失败')
    }
  }
}

// ---- 提交历史 ----
const logDialogVisible = ref(false)
const commits = ref([])

const openLog = async () => {
  logDialogVisible.value = true
  commits.value = []
  try {
    commits.value = await gitStore.getLog(projectStore.projectPath, 50)
  } catch (e) {
    ElMessage.error(e.message)
  }
}

// ---- 远端同步 ----
const onPull = async () => {
  try {
    const r = await gitStore.pull(projectStore.projectPath)
    ElMessage.success('拉取完成')
    await gitStore.refresh(projectStore.projectPath)
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const onPush = async () => {
  try {
    await gitStore.push(projectStore.projectPath)
    ElMessage.success('推送完成')
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const onInitRepo = async () => {
  try {
    await ElMessageBox.confirm('将在当前目录初始化 Git 仓库（git init），确定吗？', '初始化仓库', {
      confirmButtonText: '初始化',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const res = await window.electronAPI.gitInit?.(projectStore.projectPath)
    if (res?.ok) {
      ElMessage.success('仓库已初始化')
      await gitStore.refresh(projectStore.projectPath)
    } else {
      ElMessage.error(res?.error || '初始化失败')
    }
  } catch {
    // 取消
  }
}

const onStage = async (file) => {
  try {
    await gitStore.stage(projectStore.projectPath, [file.path])
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const onUnstage = async (file) => {
  try {
    await gitStore.unstage(projectStore.projectPath, [file.path])
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const onCommit = async () => {
  const msg = commitMessage.value.trim()
  if (!msg) return
  try {
    const ok = await gitStore.commit(projectStore.projectPath, msg)
    if (ok) {
      commitMessage.value = ''
      ElMessage.success('提交成功')
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const onDiscard = async (file) => {
  try {
    await ElMessageBox.confirm(
      `将丢弃文件 "${file.path}" 的工作区改动，此操作不可恢复。确定吗？`,
      '丢弃改动',
      { confirmButtonText: '丢弃', cancelButtonText: '取消', type: 'warning' }
    )
    await gitStore.discard(projectStore.projectPath, file.path)
    ElMessage.success('已丢弃改动')
  } catch {
    // 取消
  }
}

const openDiff = (file) => {
  diffFile.value = file.path
  diffStaged.value = !!file.staged
  diffVisible.value = true
}

defineExpose({ refresh: onRefresh })
</script>

<style scoped>
.git-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-size: 12px;
}

.git-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.branch-btn {
  border: none;
  background: transparent;
  color: var(--text-bright);
  font-size: 12px;
  font-weight: 600;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.branch-btn:not(.not-repo):hover {
  background: var(--surface-selected-soft);
  color: var(--info);
}

.branch-btn.not-repo {
  color: var(--text-muted);
  font-weight: 400;
  cursor: default;
}

.branch-btn:disabled {
  cursor: default;
}

.git-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}

.icon-btn:hover {
  color: var(--text-bright);
  background: var(--surface-selected-soft);
}

.git-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
  padding: 16px;
  text-align: center;
}

.mini-btn {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-subtle);
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.mini-btn:hover {
  color: var(--info);
  border-color: var(--info);
  background: var(--info-subtle);
}

.git-changes {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
}

.git-changes::-webkit-scrollbar {
  width: 4px;
}

.git-changes::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}

.change-group-title {
  font-size: 11px;
  color: var(--text-muted);
  padding: 6px 12px 2px;
  font-weight: 600;
}

.change-count {
  color: var(--text-subtle);
}

.change-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  cursor: default;
}

.change-item:hover {
  background: var(--surface-selected-soft);
}

.change-status {
  font-weight: 700;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.change-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.change-ops {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.change-item:hover .change-ops {
  opacity: 1;
}

.op-btn {
  border: none;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  font-size: 12px;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1;
}

.op-btn:hover {
  color: var(--info);
  background: var(--info-subtle);
}

.op-btn.discard:hover {
  color: var(--status-err);
  background: var(--status-err-subtle);
}

.git-commit-bar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.commit-input {
  flex: 1;
  min-width: 0;
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
}

.commit-input:focus {
  border-color: var(--info);
}

.commit-btn {
  border: none;
  background: var(--info);
  color: #fff;
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

.commit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ===== 分支管理弹窗 ===== */
.branch-list {
  max-height: 46vh;
  overflow: auto;
  margin-bottom: 12px;
}

.branch-list::-webkit-scrollbar {
  width: 4px;
}

.branch-list::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}

.branch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
}

.branch-row:hover {
  background: var(--surface-selected-soft);
}

.branch-row.current {
  background: var(--info-subtle);
}

.branch-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.branch-row.current .branch-name {
  color: var(--info);
  font-weight: 600;
}

.branch-current {
  font-size: 11px;
  color: var(--info);
  font-weight: 600;
  flex-shrink: 0;
}

.branch-ops {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.op-btn.danger:hover {
  color: var(--status-err);
  background: var(--status-err-subtle);
}

.branch-create {
  display: flex;
  gap: 6px;
}

/* ===== 提交历史弹窗 ===== */
.log-list {
  max-height: 46vh;
  overflow: auto;
}

.log-list::-webkit-scrollbar {
  width: 4px;
}

.log-list::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}

.log-row {
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  font-family: var(--font-mono, Consolas, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-row:hover {
  background: var(--surface-selected-soft);
}
</style>
