#!/usr/bin/env node
/**
 * check-hardcoded-colors.js — 硬编码色值扫描器
 *
 * 作用：扫描 src 下所有 .vue 中的硬编码色值（#hex 与 rgba/rgb），
 *       输出违规文件 + 行号 + 色值，供 Design Token 迁移回归使用。
 *
 * 用法：
 *   node scripts/check-hardcoded-colors.js              # 扫描全部
 *   node scripts/check-hardcoded-colors.js --dirs "src/components/common src/components/file-system"
 *   node scripts/check-hardcoded-colors.js --json       # JSON 输出（供脚本断言）
 *
 * 退出码：0 = 无违规；1 = 有违规
 *
 * 白名单机制：
 *   1. src/styles/ 下的 palette.css / theme.css 天然豁免（token 定义层）。
 *   2. 块注释「token-exempt」标记：以 token-exempt 开头的注释块内
 *      出现的所有色值整块跳过（典型：Monaco tokenColors、AST 节点色区）。
 *   3. <svg ...>...</svg> 内联块内的 fill/stroke 色值跳过（SVG 图标内联专用）。
 *
 * 例外：档位表特例用「scale-exempt」注释登记（theme.css 顶部特例清单同源）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGBA_RE = /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/g;

function parseArgs(argv) {
  const args = { dirs: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dirs' && i + 1 < argv.length) args.dirs = argv[++i].split(/\s+/);
    if (argv[i] === '--json') args.json = true;
  }
  return args;
}

function collectVueFiles(dirs) {
  const base = dirs ? dirs : [path.join(ROOT, 'src')];
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.vue')) out.push(full);
    }
  };
  for (const d of base) {
    const full = path.isAbsolute(d) ? d : path.join(ROOT, d);
    if (!fs.existsSync(full)) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (full.endsWith('.vue')) out.push(full);
  }
  return out;
}

/** 从源码中剔除豁免块，返回 (剩余文本, 被豁免色值计数) */
function stripExempt(src) {
  let text = src;
  let exemptCount = 0;

  // 1) SVG 内联块
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, (m) => {
    const hits = (m.match(HEX_RE) || []).length + (m.match(RGBA_RE) || []).length;
    exemptCount += hits;
    return '';
  });

  // 2) token-exempt 区间块：/* token-exempt: <原因> */ ... /* end token-exempt */
  text = text.replace(/\/\* token-exempt:[\s\S]*?\*\/[\s\S]*?\/\* end token-exempt \*\//g, (m) => {
    const hits = (m.match(HEX_RE) || []).length + (m.match(RGBA_RE) || []).length;
    exemptCount += hits;
    return '';
  });
  // 3) 单行 token-exempt 注释（块内色值）
  text = text.replace(/\/\* token-exempt:[\s\S]*?\*\//g, (m) => {
    const hits = (m.match(HEX_RE) || []).length + (m.match(RGBA_RE) || []).length;
    exemptCount += hits;
    return '';
  });

  // 3) 普通注释块（不含标记）内残留色值不豁免（注释也会误导后续维护，报告之）
  return { text, exemptCount };
}

function scan() {
  const args = parseArgs(process.argv.slice(2));
  const files = collectVueFiles(args.dirs);
  const violations = [];
  let totalExempt = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8');
    const { text, exemptCount } = stripExempt(src);
    totalExempt += exemptCount;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = [];
      for (const m of line.matchAll(HEX_RE)) matches.push(m[0]);
      for (const m of line.matchAll(RGBA_RE)) matches.push(m[0]);
      if (matches.length) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        violations.push({ file: rel, line: i + 1, colors: matches });
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ violations, exemptCount: totalExempt }, null, 2));
    return violations.length ? 1 : 0;
  }

  if (violations.length === 0) {
    console.log(`✅ 无硬编码色值违规（豁免 ${totalExempt} 处）`);
    return 0;
  }

  console.log(`❌ 发现 ${violations.length} 处硬编码色值（豁免 ${totalExempt} 处）：\n`);
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}  ${v.colors.join(' ')}`);
  }
  console.log('\n提示：迁移为 theme.css 语义变量（--surface-*/--text-*/--status-*/--accent-*）；\n' +
              '第三方/技术性色块用 /* token-exempt: <原因> */ 注释豁免。');
  return 1;
}

process.exit(scan());
