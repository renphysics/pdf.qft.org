/**
 * The Chinese of the page template, dist/index.html (scripts/pages/localize.mjs):
 * each English text of the template, as it is written there, and its Chinese.
 * The home page, the editor, the dialogs and every tool page share these words.
 * The build stops when the template has a text without Chinese here, or this
 * has Chinese for a text the template no longer has.
 *
 * Style (README, "Chinese"): plain, short sentences, addressed as 你. Titles say
 * what a visitor gains, buttons what happens when pressed (选择 PDF 文件, not 带上你的
 * PDF). Files are chosen or opened, never 上传: they are not uploaded. 你的 only where
 * it says where the work happens (你的浏览器). Short headings, buttons and labels
 * end without 。. Chinese punctuation; a space between Chinese and Latin letters or
 * digits ("打开 PDF", "第 3 页").
 */

/** Texts that stay as they are in Chinese. */
export const SAME_IN_CHINESE = new Set(['QFT', 'PDF', 'QFT PDF']);

/**
 * Where the template's markup does not suit Chinese, a whole fragment of it (each
 * must be in the template once). The steps' heading is one line in Chinese,
 * 三步处理 PDF, where the English breaks "From open / to all done."; the home
 * page's line under its title breaks after its list, not inside a word.
 */
export const SHELL_ZH_HTML = {
  '<h2>From open<br> to <em>all done.</em></h2>': '<h2>三步处理 PDF</h2>',
  '<p>Edit one document. Prepare a whole stack. Useful PDF tools, with your files kept on your device.</p>':
    '<p>合并、拆分、添加文字、填写表单，<br>常用操作在浏览器中就能完成。</p>',
};

export const SHELL_ZH = {
  'Skip to content': '跳到主要内容',
  'QFT PDF home': 'QFT PDF 首页',
  'Main navigation': '主导航',
  'All tools': '全部工具',
  'Your privacy': '隐私',
  'Private. Practical. PDF.': '在浏览器中处理 PDF',
  'YOUR PDF WORKSPACE': 'PDF 工具箱',
  'Every PDF.': '让 PDF 处理',
  'A little simpler.': '更简单',
  'Free to use': '免费使用',
  'No sign-up': '无需注册',
  'Stays on your device': '文件不上传',
  'Start with your PDF.': '选择文件，开始处理',
  'Drop a file here to open your workspace.': '将 PDF 拖到这里，或点击下方按钮选择文件。',
  'Choose a PDF': '选择 PDF 文件',
  'PDF files · no fixed size or page limit': 'PDF 文件 · 不设固定大小或页数上限',
  'Working with several files? Open batch tools': '多份文件要做相同的修改？使用批量处理',
  'Just exploring?': '想先体验一下？',
  'Try a sample': '试用示例文档',
  'THE TOOLKIT': '工具列表',
  'The right tool. Right here.': '常用 PDF 工具',
  'Choose a task to get started.': '选择需要的功能。',
  'Filter tools': '筛选工具',
  'Edit &amp; annotate': '编辑和标注',
  Organize: '整理',
  Automate: '自动化',
  'Find a tool': '查找工具',
  'No tools match. Try “split”, “crop”, or “footer”.': '没有匹配的工具。试试“拆分”“裁剪”或“页脚”。',
  'LESS FRICTION. MORE FINISHED.': '使用方法',
  'Bring your PDF.': '选择文件',
  'Choose a file from your device. It stays in your browser.': '从设备中选择 PDF，或直接拖入页面。',
  'Make it yours.': '按需处理',
  'Add your finishing touches and check the live document preview.': '选择需要的工具，边操作边查看效果。',
  'Take it with you.': '下载结果',
  'Download your edited copy. Your original file stays untouched.': '下载处理后的文件，原文件不会被覆盖。',
  'Your documents stay with you.': '文件在本机处理',
  'PDF processing happens on your device. No document uploads, no account to create.':
    'PDF 在你的浏览器中处理，文档内容不会上传到服务器。',
  'How we handle files': '查看隐私说明',
  'PDF tools that respect your time and your privacy.': '让 PDF 处理更简单',
  'Help &amp; supported files': '帮助和支持的文件',
  'Open-source credits': '开源许可（英文）',
  'PDF editor': 'PDF 编辑器',
  'Back to all tools': '返回全部工具',
  'Document.pdf': '文档.pdf',
  'On your device': '本机处理',
  'Open PDF': '打开 PDF',
  Undo: '撤销',
  Redo: '重做',
  Reset: '重置',
  'Download PDF': '下载 PDF',
  '(protected with a password)': '（有密码保护）',
  'Editing tools and settings': '工具和设置',
  'MAKE IT YOURS': '当前工具',
  'Add text': '添加文字',
  'Editor help': '编辑器帮助',
  'Hide tool settings': '隐藏工具设置',
  'Choose a tool': '选择工具',
  'Batch &amp; saved presets': '批量处理和保存的预设',
  'Open another PDF': '打开另一个 PDF',
  'Reset document': '重置文档',
  'Edits show at once and stay on your device until you download.': '修改即时显示，下载前文件只在本机。',
  'Previous page': '上一页',
  Page: '页码',
  'Go to page': '跳转到页面',
  'of 1': '/ 1',
  'Next page': '下一页',
  'Zoom out': '缩小视图',
  'Fit page to available width': '缩放到适合窗口',
  Fit: '适合窗口',
  'Zoom in': '放大视图',
  'Document preview': '文档预览',
  'Text on the page': '页面上的文字',
  'Arrow keys move it and, with Alt, resize it, with Shift for bigger steps. Delete removes it. Enter edits text. Escape deselects.':
    '方向键移动它，按住 Alt 调整大小，同时按 Shift 步子更大。Delete 删除，Enter 编辑文字，Escape 取消选择。',
  'Escape or Control+Enter finishes typing.': '按 Escape 或 Control+Enter 结束输入。',
  'Your document, ready for a little finishing touch.': '文档已打开，选择工具开始处理。',
  Tools: '工具',
  'Document pages': '文档页面',
  Pages: '页面',
  'Add another PDF': '再添加一个 PDF',
  'Add PDF': '添加 PDF',
  Notification: '通知',
  'Dismiss notification': '关闭通知',
  'Opening your PDF…': '正在打开 PDF…',
  'Working in your browser': '在浏览器中处理',
  Cancel: '取消',
  'Close dialog': '关闭对话框',
  'Got it': '知道了',
  Confirm: '确定',
  'PASSWORD-PROTECTED PDF': '有密码保护的 PDF',
  'Enter the password': '输入密码',
  'needs a password to open. It’s used only here, on your device, and isn’t kept.':
    '需要密码才能打开。密码只在本机使用，不会保存。',
  Password: '密码',
  'Show password': '显示密码',
  'QFT PDF needs JavaScript to process PDFs in your browser. Please enable JavaScript to use the editor.':
    'QFT PDF 需要 JavaScript 才能在浏览器里处理 PDF。请启用 JavaScript 后使用编辑器。',
};
