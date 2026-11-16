/**
 * The Chinese of the page template, dist/index.html (scripts/pages/localize.mjs):
 * each English text of the template, as it is written there, and its Chinese.
 * The home page, the editor, the dialogs and every tool page share these words.
 * The build stops when the template has a text without Chinese here, or this
 * has Chinese for a text the template no longer has.
 *
 * Style: plain, short sentences, addressed as 你; Chinese punctuation; a space
 * between Chinese and Latin letters or digits ("打开 PDF", "第 3 页").
 * Terms: README, "Chinese".
 */

/** Texts that stay as they are in Chinese. */
export const SAME_IN_CHINESE = new Set(['QFT', 'PDF', 'QFT PDF']);

export const SHELL_ZH = {
  'Skip to content': '跳到主要内容',
  'QFT PDF home': 'QFT PDF 首页',
  'Main navigation': '主导航',
  'All tools': '全部工具',
  'Your privacy': '隐私',
  'Private. Practical. PDF.': '私密 · 实用 · PDF',
  'YOUR PDF WORKSPACE': '你的 PDF 工作台',
  'Every PDF.': '每一份 PDF，',
  'A little simpler.': '都简单一点。',
  'Edit one document. Prepare a whole stack. Useful PDF tools, with your files kept on your device.':
    '编辑一份文档，或者处理一整叠。实用的 PDF 工具，文件始终留在你的设备上。',
  'Free to use': '免费使用',
  'No sign-up': '无需注册',
  'Stays on your device': '留在你的设备上',
  'Start with your PDF.': '从你的 PDF 开始。',
  'Drop a file here to open your workspace.': '把文件拖到这里，打开你的工作台。',
  'Choose a PDF': '选择 PDF',
  'PDF files · no fixed size or page limit': 'PDF 文件 · 不设大小和页数上限',
  'Working with several files? Open batch tools': '要处理多个文件？打开批量工具',
  'Just exploring?': '只是看看？',
  'Try a sample': '用示例文件试试',
  'THE TOOLKIT': '工具箱',
  'The right tool. Right here.': '合适的工具，就在这里。',
  'Choose a task to get started.': '选一项任务，马上开始。',
  'Filter tools': '筛选工具',
  'Edit &amp; annotate': '编辑和标注',
  Organize: '整理',
  Automate: '自动化',
  'Find a tool': '查找工具',
  'No tools match. Try “split”, “crop”, or “footer”.': '没有匹配的工具。试试“拆分”“裁剪”或“页脚”。',
  'LESS FRICTION. MORE FINISHED.': '少些麻烦，多些成果',
  'From open': '从打开',
  to: '到',
  'all done.': '完成。',
  'Bring your PDF.': '带上你的 PDF。',
  'Choose a file from your device. It stays in your browser.':
    '从你的设备选择一个文件，它只留在你的浏览器里。',
  'Make it yours.': '按你的需要修改。',
  'Add your finishing touches and check the live document preview.': '做最后的修饰，在实时预览里查看效果。',
  'Take it with you.': '带走成品。',
  'Download your edited copy. Your original file stays untouched.': '下载编辑后的副本，原文件不会被改动。',
  'Your documents stay with you.': '你的文档始终在你手里。',
  'PDF processing happens on your device. No document uploads, no account to create.':
    'PDF 在你的设备上处理。不上传文档，也不用注册账号。',
  'How we handle files': '我们如何处理文件',
  'PDF tools that respect your time and your privacy.': '尊重你的时间和隐私的 PDF 工具。',
  'Help &amp; supported files': '帮助和支持的文件',
  'Open-source credits': '开源许可',
  'PDF editor': 'PDF 编辑器',
  'Back to all tools': '返回全部工具',
  'Document.pdf': '文档.pdf',
  'On your device': '在你的设备上',
  'Open PDF': '打开 PDF',
  Undo: '撤销',
  Redo: '重做',
  Reset: '重置',
  'Download PDF': '下载 PDF',
  '(protected with a password)': '（有密码保护）',
  'Editing tools and settings': '编辑工具和设置',
  'MAKE IT YOURS': '开始编辑',
  'Add text': '添加文字',
  'Editor help': '编辑器帮助',
  'Hide tool settings': '隐藏工具设置',
  'Choose a tool': '选择工具',
  'Batch &amp; saved presets': '批量处理和保存的预设',
  'Open another PDF': '打开另一个 PDF',
  'Reset document': '重置文档',
  'Edits show at once and stay on your device until you download.':
    '修改即时显示，下载之前一直只在你的设备上。',
  'Previous page': '上一页',
  Page: '页码',
  'Go to page': '跳转到页面',
  'of 1': '/ 1',
  'Next page': '下一页',
  'Zoom out': '缩小视图',
  'Fit page to available width': '让页面适合可用宽度',
  Fit: '适合',
  'Zoom in': '放大视图',
  'Document preview': '文档预览',
  'Text on the page': '页面上的文字',
  'Arrow keys move it and, with Alt, resize it, with Shift for bigger steps. Delete removes it. Enter edits text. Escape deselects.':
    '方向键移动它，按住 Alt 调整大小，同时按 Shift 步子更大。Delete 删除，Enter 编辑文字，Escape 取消选择。',
  'Escape or Control+Enter finishes typing.': '按 Escape 或 Control+Enter 结束输入。',
  'Your document, ready for a little finishing touch.': '你的文档已就绪，可以开始修饰了。',
  Tools: '工具',
  'Document pages': '文档页面',
  Pages: '页面',
  'Add another PDF': '再添加一个 PDF',
  'Add PDF': '添加 PDF',
  Notification: '通知',
  'Dismiss notification': '关闭通知',
  'Opening your PDF…': '正在打开你的 PDF…',
  'Working in your browser': '在你的浏览器里处理',
  Cancel: '取消',
  'Close dialog': '关闭对话框',
  'Got it': '知道了',
  Confirm: '确定',
  'PASSWORD-PROTECTED PDF': '有密码保护的 PDF',
  'Enter the password': '输入密码',
  'needs a password to open. It’s used only here, on your device, and isn’t kept.':
    '需要密码才能打开。密码只在你的设备上使用，不会保存。',
  Password: '密码',
  'Show password': '显示密码',
  'QFT PDF needs JavaScript to process PDFs in your browser. Please enable JavaScript to use the editor.':
    'QFT PDF 需要 JavaScript 才能在浏览器里处理 PDF。请启用 JavaScript 后使用编辑器。',
};
