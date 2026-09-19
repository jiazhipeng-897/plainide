/**
 * 基础词法补全服务
 * 为 Monaco 无内置智能补全的语言（python 等）提供
 * 关键字 / 内置函数 / 常用模块 补全。
 * 纯本地字典，零 API 成本，瞬时响应。
 */

import * as monaco from 'monaco-editor'

const PY_KEYWORDS = [
  'def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else',
  'for', 'while', 'break', 'continue', 'pass', 'try', 'except', 'finally',
  'raise', 'with', 'lambda', 'yield', 'global', 'nonlocal', 'assert',
  'del', 'not', 'and', 'or', 'in', 'is', 'None', 'True', 'False',
]

const PY_BUILTINS = [
  'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set',
  'tuple', 'open', 'input', 'isinstance', 'issubclass', 'enumerate', 'zip',
  'map', 'filter', 'sorted', 'sum', 'min', 'max', 'abs', 'round', 'type',
  'repr', 'format', 'help', 'dir', 'getattr', 'setattr', 'hasattr',
  'super', 'property', 'staticmethod', 'classmethod', 'vars', 'id', 'hash',
  'iter', 'next', 'callable', 'any', 'all', 'bool', 'bytes', 'bytearray',
  'complex', 'divmod', 'eval', 'exec', 'exit', 'float', 'frozenset',
  'globals', 'locals', 'memoryview', 'object', 'oct', 'ord', 'pow',
  'reversed', 'slice', 'bin', 'chr', 'hex', 'quit', 'compile',
]

const PY_MODULES = [
  'os', 'sys', 'json', 're', 'math', 'random', 'datetime', 'time',
  'pathlib', 'subprocess', 'threading', 'multiprocessing', 'collections',
  'functools', 'itertools', 'typing', 'dataclasses', 'enum', 'logging',
  'argparse', 'asyncio', 'sqlite3', 'csv', 'hashlib', 'base64', 'uuid',
  'shutil', 'glob', 'tempfile', 'unittest', 'pytest', 'requests',
  'numpy', 'pandas', 'matplotlib', 'tkinter', 'PySide6', 'PyQt6',
]

const PROVIDERS = []

/**
 * 注册基础词法补全
 * @param {string[]} languages - 语言列表（默认 python）
 */
export function registerBasicCompletion(languages = ['python']) {
  // 幂等：重复注册前先销毁旧 provider
  disposeBasicCompletion()

  // 每个语言单独注册，避免 provider 之间互相干扰
  languages.forEach((lang) => {
    const disposable = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        // 点在后面：模块成员补全（只给常见的一级成员，避免噪音）
        if (position.column > 1) {
          const textBefore = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          })
          const dotMatch = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.$/)
          if (dotMatch) {
            const moduleName = dotMatch[1]
            const members = MODULE_MEMBERS[moduleName]
            if (members) {
              return {
                suggestions: members.map((m) => ({
                  label: m,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: m,
                  range,
                  detail: `模块成员 · ${moduleName}`,
                })),
              }
            }
            return { suggestions: [] }
          }
        }

        // 点号后的关键字/内置函数/模块
        const suggestions = [
          ...PY_KEYWORDS.map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            range,
            detail: '关键字',
          })),
          ...PY_BUILTINS.map((f) => ({
            label: f,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: f,
            range,
            detail: '内置函数',
          })),
          ...PY_MODULES.map((m) => ({
            label: m,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: m,
            range,
            detail: '常用模块',
          })),
        ]

        return { suggestions }
      },
    })
    PROVIDERS.push(disposable)
  })
}

/**
 * 销毁全部基础补全
 */
export function disposeBasicCompletion() {
  while (PROVIDERS.length) {
    const d = PROVIDERS.pop()
    d.dispose()
  }
}

// 常用模块一级成员（点到就出的高频成员）
const MODULE_MEMBERS = {
  os: ['path', 'getcwd', 'listdir', 'mkdir', 'remove', 'rename', 'walk', 'environ', 'system', 'name'],
  sys: ['argv', 'path', 'exit', 'stdout', 'stderr', 'stdin', 'version', 'platform', 'modules'],
  json: ['load', 'loads', 'dump', 'dumps'],
  re: ['match', 'search', 'findall', 'sub', 'split', 'compile', 'fullmatch'],
  math: ['pi', 'e', 'sqrt', 'pow', 'ceil', 'floor', 'fabs', 'sin', 'cos', 'tan', 'log', 'exp'],
  random: ['random', 'randint', 'choice', 'shuffle', 'uniform', 'sample', 'seed'],
  datetime: ['datetime', 'date', 'time', 'timedelta', 'now', 'strftime', 'strptime'],
  time: ['time', 'sleep', 'localtime', 'strftime', 'gmtime'],
  pathlib: ['Path', 'PurePath', 'WindowsPath'],
  subprocess: ['run', 'Popen', 'call', 'check_output', 'check_call'],
  threading: ['Thread', 'Lock', 'RLock', 'Event', 'Semaphore', 'Timer'],
  collections: ['deque', 'Counter', 'defaultdict', 'OrderedDict', 'namedtuple', 'ChainMap'],
  functools: ['wraps', 'partial', 'reduce', 'lru_cache', 'cmp_to_key'],
  itertools: ['chain', 'combinations', 'permutations', 'product', 'count', 'cycle', 'repeat'],
  typing: ['List', 'Dict', 'Set', 'Tuple', 'Optional', 'Union', 'Any', 'Callable', 'Iterable', 'Iterator'],
  dataclasses: ['dataclass', 'field', 'asdict', 'replace'],
  logging: ['info', 'debug', 'warning', 'error', 'basicConfig', 'getLogger'],
  argparse: ['ArgumentParser', 'add_argument', 'parse_args', 'parse_known_args'],
  asyncio: ['run', 'create_task', 'sleep', 'gather', 'wait_for', 'Queue'],
  sqlite3: ['connect', 'Connection', 'Cursor'],
  hashlib: ['md5', 'sha1', 'sha256', 'sha512'],
  base64: ['b64encode', 'b64decode', 'urlsafe_b64encode', 'urlsafe_b64decode'],
  shutil: ['copy', 'copy2', 'move', 'rmtree', 'make_archive'],
  glob: ['glob', 'iglob', 'escape'],
  tkinter: ['Tk', 'Frame', 'Label', 'Button', 'Entry', 'Text', 'Canvas', 'messagebox', 'filedialog'],
  'PySide6.QtWidgets': ['QApplication', 'QMainWindow', 'QLabel', 'QPushButton', 'QLineEdit', 'QVBoxLayout', 'QHBoxLayout', 'QWidget'],
}
