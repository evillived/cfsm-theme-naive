#!/usr/bin/env node
/**
 * 把主题构建产物同步到独立的发布仓库，并提交推送到 GitHub。
 *
 * 主题产物只包含 `dist/index.html` 与 `dist/assets/`（见 theme-develop.md），
 * 这里把它们原样搬到 `../cfsm-theme-naive-dist`，提交后推送：
 *
 *   https://github.com/evillived/cfsm-theme-naive-dist
 *
 * 用法：
 *   node scripts/publish-dist.mjs              # 同步 + 提交 + 推送
 *   node scripts/publish-dist.mjs --no-push    # 只同步 + 提交
 *   node scripts/publish-dist.mjs --dry-run    # 只打印将要执行的操作
 *
 * 注意：同步会先删除目标仓库里的 `assets/` 再做覆盖复制（产物完全由构建生成，
 * 不做增量合并，避免残留上一版带哈希的旧文件）。执行前会校验目标目录名。
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const THEME_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = path.join(THEME_ROOT, 'dist')
const TARGET_DIR = path.resolve(THEME_ROOT, '..', 'cfsm-theme-naive-dist')

/** 安全闸：只有目录名完全匹配时才允许清理目标内容 */
const EXPECTED_TARGET_NAME = 'cfsm-theme-naive-dist'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const noPush = args.has('--no-push')

function log(message) {
  console.log(`[publish-dist] ${message}`)
}

function fail(message) {
  console.error(`[publish-dist] 错误：${message}`)
  process.exit(1)
}

function git(gitArgs, options = {}) {
  return execFileSync('git', ['-C', TARGET_DIR, ...gitArgs], {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
}

/** 本地时间戳，如 `2026-09-17 10:55`（不依赖 locale，便于跨机器复现） */
function timestamp() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/** 取主题仓库当前的提交号，写进发布提交信息便于溯源（dist 已被 .gitignore 忽略） */
function sourceRevision() {
  try {
    return execFileSync('git', ['-C', THEME_ROOT, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim()
  }
  catch {
    return ''
  }
}

// ===== 1. 校验产物与目标仓库 =====
if (!existsSync(path.join(DIST_DIR, 'index.html'))) {
  fail(`未找到 ${path.join(DIST_DIR, 'index.html')}，请先执行 pnpm build`)
}
if (!existsSync(path.join(DIST_DIR, 'assets')) || !statSync(path.join(DIST_DIR, 'assets')).isDirectory()) {
  fail(`未找到 ${path.join(DIST_DIR, 'assets')} 目录，请先执行 pnpm build`)
}
if (path.basename(TARGET_DIR) !== EXPECTED_TARGET_NAME) {
  fail(`目标目录名不是 ${EXPECTED_TARGET_NAME}（实际：${TARGET_DIR}），为安全起见中止`)
}
if (!existsSync(path.join(TARGET_DIR, '.git'))) {
  fail(`目标目录不是 git 仓库：${TARGET_DIR}`)
}

log(`源产物：${DIST_DIR}`)
log(`目标仓库：${TARGET_DIR}`)

// ===== 2. 同步 index.html 与 assets/ =====
const targetAssets = path.join(TARGET_DIR, 'assets')

if (dryRun) {
  log(`[dry-run] 将删除 ${targetAssets}`)
  log(`[dry-run] 将复制 ${path.join(DIST_DIR, 'assets')} → ${targetAssets}`)
  log(`[dry-run] 将复制 ${path.join(DIST_DIR, 'index.html')} → ${path.join(TARGET_DIR, 'index.html')}`)
}
else {
  // 整目录替换：产物带内容哈希，增量复制会留下上一版的旧文件
  rmSync(targetAssets, { recursive: true, force: true })
  cpSync(path.join(DIST_DIR, 'assets'), targetAssets, { recursive: true })
  cpSync(path.join(DIST_DIR, 'index.html'), path.join(TARGET_DIR, 'index.html'))
  log('已同步 index.html 与 assets/')
}

// ===== 3. 提交 =====
if (dryRun) {
  log(`[dry-run] 将提交到 ${TARGET_DIR}（分支与上游沿用仓库现有配置）`)
  log('[dry-run] 跳过提交与推送')
  process.exit(0)
}

git(['add', '-A'])
const staged = git(['status', '--porcelain'], { capture: true }).trim()

if (!staged) {
  log('产物与仓库当前内容一致，无需提交')
  process.exit(0)
}

const revision = sourceRevision()
const message = `build: 同步主题产物 ${timestamp()}${revision ? ` (src ${revision})` : ''}`

git(['commit', '-m', message])
log(`已提交：${message}`)

// ===== 4. 推送 =====
if (noPush) {
  log('已跳过推送（--no-push）')
  process.exit(0)
}

git(['push'])
log('已推送到 origin')
