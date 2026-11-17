/**
 * The interface in Chinese (i18n.js): each English text the code shows, as it
 * is written there, and its Chinese. Only Chinese pages load this module.
 * tests/i18n.test.mjs keeps it whole: every t(), tn() and userError() of the
 * modules has its Chinese here, nothing here is left over, and each Chinese
 * names the same {values} as its English.
 *
 * Style: plain, short sentences, addressed as 你; Chinese punctuation; a space
 * between Chinese and Latin letters or digits ("打开 PDF", "第 3 页"). Terms:
 * README, "Chinese".
 */

/** Each tool's name, page title, tab label, card and search words in Chinese, by its id in routes.js. */
export const TOOLS = {
  text: {
    name: '添加文字',
    title: '添加文字和图片',
    tab: '文字',
    card: ['一句备注、一个标志、一点补充。', '在页面上留下你的印记。'],
    keywords:
      '文字 文本 中文 汉字 加字 写字 打字 输入 增加文字 备注 标签 说明 图片 照片 加图片 插入图片 标志 高亮',
  },
  image: {
    name: '添加图片',
    tab: '图片',
  },
  highlight: {
    name: '高亮',
    tab: '高亮',
  },
  signature: {
    name: '签署 PDF',
    tab: '签名',
    card: ['手写、输入或上传你的签名。', '放在一页或每一页上。'],
    keywords: '签名 加签名 添加签名 签字 签署 手写签名 电子签名 签名图片 盖章 填写',
  },
  form: {
    name: '填写表单',
    tab: '表单',
    card: ['在表单字段里输入，勾选复选框。', '保持可填写，或拼合到页面上。'],
    keywords: '表单 表格 填写 填表 字段 复选框 申请表 拼合',
  },
  properties: {
    name: '文档属性',
    tab: '属性',
    card: ['修改标题、作者等信息。', '或者在分享前删掉它们。'],
    keywords: '属性 元数据 信息 标题 作者 主题 关键词 语言 隐私 删除信息',
  },
  draw: {
    name: '绘图',
    tab: '绘图',
    card: ['用画笔画，或加上线条、箭头', '和形状，在页面上做标记。'],
    keywords: '绘图 画图 画笔 手绘 涂鸦 标记 画线 线条 直线 箭头 矩形 方框 圆形 椭圆 形状',
  },
  watermark: {
    name: '水印',
    tab: '水印',
    card: ['给每一页加上低调的标记，', '文字、颜色和透明度都由你定。'],
    keywords: '水印 加水印 添加水印 增加水印 文字水印 草稿 机密 标记',
  },
  footer: {
    name: '页眉和页脚',
    tab: '页眉页脚',
    card: ['你的名字、项目和其他信息，', '放在每一页的同一个位置。'],
    keywords: '页眉 页脚 页眉页脚 加页眉 加页脚 添加页眉 添加页脚 标题 日期 姓名 文件名',
  },
  numbers: {
    name: '页码',
    tab: '页码',
    card: ['加上页码，条理更清楚。', '从头到尾，按你的格式编号。'],
    keywords: '页码 加页码 添加页码 增加页码 编号 编页码 页数',
  },
  pages: {
    name: '整理页面',
    tab: '整理',
    card: ['调整顺序、旋转、删除或提取，', '只留下你需要的页面。'],
    keywords: '整理 页面 排序 顺序 调整顺序 重新排列 旋转 提取 倒序 交错 插入 空白页 添加空白页 复制 移动',
  },
  delete: {
    name: '删除页面',
    tab: '删除',
    card: ['去掉不需要的页面。', '选中、删除、保存。'],
    keywords: '删除 删页 删除页面 去掉 移除 页面',
  },
  crop: {
    name: '裁剪 PDF',
    tab: '裁剪',
    card: ['边缘少一点。', '裁掉页边，实时预览。'],
    keywords: '裁剪 剪裁 裁切 切边 去白边 白边 页边 页面',
  },
  margins: {
    name: '添加页边距',
    tab: '页边距',
    card: ['边缘多一点空间，', '用来写笔记、装订或打孔。'],
    keywords: '页边距 边距 加边距 增加页边距 增加边距 留白 空白 装订 打孔 笔记 页面',
  },
  resize: {
    name: '调整页面尺寸',
    tab: '尺寸',
    card: ['每一页都放到 A4 或 Letter 纸上。', '按比例缩放，不会裁掉内容。'],
    keywords: '尺寸 页面尺寸 页面大小 纸张 纸张大小 A4 A3 A5 Letter 信纸 缩放 放大 缩小 统一 打印 大小不一',
  },
  merge: {
    name: '合并 PDF',
    tab: '合并',
    card: ['把几份文件放在一起，', '合成一份顺序清楚的文档。'],
    keywords: '合并 合成 拼接 组合 汇总 连接 多个 页面',
  },
  split: {
    name: '拆分 PDF',
    tab: '拆分',
    card: ['按页、按章或按范围拆开，', '打包成一个 ZIP 文件下载。'],
    keywords: '拆分 分割 分开 切分 拆开 拆页 单页 剪切 章节 范围',
  },
  sheets: {
    name: '多页合一',
    tab: '多页合一',
    card: ['每张纸放两页或四页，', '打印讲义也清楚。'],
    keywords: '多页合一 二合一 四合一 2合1 4合1 一纸多页 拼版 讲义 打印 缩印',
  },
  jpgtopdf: {
    name: 'JPG 转 PDF',
    tab: 'JPG 转 PDF',
    card: ['把照片和图片变成 PDF 页面，', 'A4、Letter 或图片自己的尺寸。'],
    keywords: '图片 照片 图像 扫描件 转换 图片转 照片转 扫描件转 jpeg png',
  },
  pdftojpg: {
    name: 'PDF 转 JPG',
    tab: 'PDF 转 JPG',
    card: ['每一页都存成图片，', 'JPG 或 PNG，打包成 ZIP。'],
    keywords: '图片 图像 导出 转换 转图片 转照片 截图 jpeg png',
  },
  protect: {
    name: '加密 PDF',
    tab: '加密',
    card: ['只给该看的人看。', '为 PDF 设置打开密码。'],
    keywords: '加密 密码 设置密码 加密码 添加密码 保护 安全 上锁',
  },
  unlock: {
    name: '解锁 PDF',
    tab: '解锁',
    card: ['知道密码？那就把它去掉。', '另存一份不用密码就能打开的副本。'],
    keywords: '解锁 解密 去密码 去除密码 删除密码 移除密码 取消密码 密码 解除限制 限制',
  },
  batch: {
    name: '批量处理和预设',
    card: ['一次设置，处理多个 PDF。', '保存设置，一起处理。'],
    keywords: '批量 批处理 预设 多个文件 多个',
  },
};

/**
 * What the tool search says, by the id of a note in routes.js (SEARCH_NOTES),
 * where the site has no tool for what was typed: its sentence, the Chinese
 * searches that bring it beside the English ones, and what the note says no
 * tool does, which no tool's Chinese words may come to offer.
 */
export const NOTES = {
  compress: {
    // 缩小 as "shrink" in English: Resize pages shows beside the note.
    words: ['压缩', '缩小', '减小', '变小', '瘦身', '太大', '文件大小', '体积'],
    text: 'QFT PDF 不能压缩 PDF，但用[删除页面](tool:delete)或[拆分 PDF](tool:split) 去掉不需要的页面，可以让副本变小。',
    missing: ['压缩', '文件大小'],
  },
  ocr: {
    words: ['识别', '扫描件转文字', '图片转文字', '可搜索', '可复制'],
    text: 'QFT PDF 不能把扫描件识别成文字（OCR）：扫描的页面仍然是图片，[JPG 转 PDF](tool:jpgtopdf) 能把它们放进 PDF，但里面的文字不能搜索。',
    missing: ['识别', '可搜索'],
  },
  redact: {
    words: ['涂黑', '打码', '遮盖', '脱敏', '马赛克', '隐藏文字', '删除文字', '擦除', '抹掉'],
    text: 'QFT PDF 不能真正涂黑内容：在页面上加东西盖住，或者把它裁掉，都只是把它隐藏，它仍然留在文件里。',
    missing: ['涂黑', '打码', '脱敏'],
  },
  'edit-text': {
    words: ['修改文字', '编辑文字', '改字', '修改内容', '编辑内容', '替换文字', '改错字', '编辑原文'],
    text: 'QFT PDF 不能修改 PDF 里原有的文字；[添加文字](tool:text)会在页面上加上新的文字。',
    missing: ['修改文字', '编辑文字', '替换文字'],
  },
  office: {
    words: ['幻灯片', '演示文稿', '电子表格', '办公文档'],
    text: 'QFT PDF 不能在 PDF 和 Word、Excel 或 PowerPoint 之间转换；要把 Office 文件做成 PDF，请在制作它的软件里另存为 PDF。',
    missing: ['幻灯片', '演示文稿', '电子表格'],
  },
  'images-out': {
    words: ['提取图片', '提取照片', '取出图片'],
    text: 'QFT PDF 不能把 PDF 里的图片单独取出来；[PDF 转 JPG](tool:pdftojpg) 会把整页存成图片。',
    missing: ['提取图片', '提取照片'],
  },
  bookmarks: {
    words: ['书签', '目录', '大纲'],
    text: 'QFT PDF 不能添加或编辑书签，只有[合并 PDF](tool:merge) 可以为合并的每个 PDF 加上一个以它命名的书签。',
    missing: ['书签', '目录'],
  },
  'digital-signature': {
    words: ['数字签名', '数字证书', '证书'],
    text: '[签署 PDF](tool:signature) 放上的是你签名的图片；QFT PDF 不能添加基于证书的数字签名。',
    missing: ['数字签名', '证书'],
  },
};

/** Long passages of HTML, by name (passage() in i18n.js). */
export const PASSAGES = {
  privacy:
    '<div class="eyebrow">你的文件，你的空间</div><h2 id="dialog-title">隐私，从设计开始。</h2><p>QFT PDF 在这个浏览器里处理你的 PDF。编辑器不会把文档内容、文件名或你的编辑发送到任何处理服务器。</p><h3>哪些东西留在你的设备上？</h3><p>你的 PDF 文件、添加的图片和文字，以及编辑后的文档。PDF 文件和生成的结果保存在这个标签页的内存里，关闭或刷新标签页就会清除。保存的预设包含你选择的文字和设置，会一直留在这个浏览器里，直到你删除它们或清除网站数据。水印、页眉和页脚、页码的设置也一样：勾选“在这台设备上记住这些设置”时保存，取消勾选就会忘记。</p><p>密码只在这个标签页里使用：用来打开有密码保护的 PDF，以及保护你下载的文件。密码从不保存，预设里也不会有。只有你选择“保存在这台设备上”，你的签名才会留在这个浏览器里；取消勾选就会删除它。你选择的语言也记在这个浏览器里。</p><h3>哪些需要联网？</h3><p>你的浏览器会加载这个网站、它的 PDF 程序库和字体文件。托管服务商可能会收到普通的网站请求。QFT PDF 不包含广告或统计脚本。</p><p>用“下载 PDF”保存完成的副本。你的原文件不会被覆盖。</p>',
  help: '<div class="eyebrow">使用指南</div><h2 id="dialog-title">请随意使用。</h2><p>打开一个 PDF，选择一个工具，直接在页面上编辑。每个修改都立即显示，和它在你的 PDF 里的样子完全一样。“下载 PDF”会保存一份新的副本。</p><h3>能编辑什么？</h3><p>添加文字、PNG/JPG 图片、高亮、绘图、水印、页眉、页脚和页码。填写 PDF 表单。合并 PDF，或者调整页面顺序、倒序、旋转、删除、裁剪、提取和拆分页面，把双面扫描的页面交错排列，添加空白页或页边距。把页面调整到 A4 或 Letter 纸上。每张纸放 2 页或 4 页，做成讲义。批量工具把存好的预设分别应用到多个 PDF 上。</p><h3>文字、图片和高亮</h3><p>用“添加文字”时，点击页面然后输入。拖动一个项目可以移动它，拖动控制点可以调整大小。选中一个项目可以在面板里修改它，或者按 Delete 删除。选中项目后，方向键移动它，Alt 加方向键调整大小（按住 Shift 步子更大），Enter 编辑文字。</p><h3>撤销和重做</h3><p>撤销（Ctrl+Z 或 ⌘Z）撤回最近的编辑；重做（Ctrl+Shift+Z 或 ⌘⇧Z）把它们恢复。每个按钮都会写明它要撤回或恢复哪一步。重置会回到你最初打开的文档。关闭或刷新这个标签页后，工作区不会保存。</p><h3>删除页面和裁剪 PDF</h3><p>在“删除页面”里，可以选择缩略图，或者输入页面范围，比如 2, 4-6。至少要留下一页。在“裁剪 PDF”里，可以拖出要保留的区域，或者输入边距百分比，然后应用到当前页、选中的页面或每一页。每次裁剪都在当前的可见区域上再裁。“恢复原始裁剪”会为你选的范围找回原来的页面边界。裁剪只是隐藏内容，不是安全的涂黑。</p><p>“添加文字”是加上新的内容，不会改写原有的段落。高亮是批注，不是安全的涂黑。修改可能让已有的数字签名失效。QFT PDF 不能压缩 PDF，不能识别扫描件里的文字（OCR），也不能和 Word 互相转换。</p><h3>签名</h3><p>用“签署 PDF”时，手写你的签名，输入你的名字（手写字体只有拉丁字母），或者上传签名的图片。点击页面放置它，或者加到每一页上；拖动它可以移动，拖动一角可以调整大小。它是你签名的图片，不是基于证书的数字签名。</p><h3>表单</h3><p>用“填写表单”时，点击字段输入文字，或者勾选复选框；Tab 跳到下一个字段。在手机上，页面会放大到你点的字段，“适合宽度”会重新显示整页。下载的文件保留可以填写的字段；打开“下载时拼合字段”，你填的内容就会成为页面的一部分。表单里内置的计算不会运行，只用 Adobe XFA 格式做的表单不能填写。</p><h3>绘图</h3><p>用“绘图”时，在页面上拖动用画笔画，或者选择直线、箭头、矩形或椭圆。每一笔是一个撤销步骤。选中一个图形可以移动它、调整大小，或者修改颜色和线宽。在触摸屏上，一根手指画画，两根手指滚动。</p><h3>文档属性</h3><p>“文档属性”显示保存在你的 PDF 里的标题、作者、主题、关键词和语言。修改它们，或者在分享文件前选择“全部删除”：它还会删掉 PDF 由哪个软件、在什么时候制作的记录。语言会保留，因为读屏软件需要它。</p><h3>密码</h3><p>需要密码的 PDF 会在你打开时要求输入。下载的文件保留这个密码：可以在“加密 PDF”里修改，或者在“解锁 PDF”里去掉。只限制打印、复制或修改的 PDF 打开时不会询问，下载的文件也没有这些限制。密码只留在你的设备上，不会保存。</p><h3>支持的文件</h3><p>PDF 文件不设固定的大小或页数上限，包括有密码保护的 PDF（用证书保护的除外）。JPG 和 PNG 图片会作为页面打开（JPG 转 PDF）；“PDF 转 JPG”把页面存成图片。能处理多大的文件取决于你的设备和浏览器可用的内存。特别大的文件可能很慢，或者打不开，尤其是在手机上。要合并、删除、提取或拆分有表单字段的 PDF 的页面，先在“填写表单”里打开“下载时拼合字段”。</p><h3>字体</h3><p>支持拉丁字母和中文，还有日文假名和韩文。日文汉字和繁体中文用的是字体的简体中文字形，所以有些字看起来略有不同。只嵌入你用到的字，所以中文通常只让 PDF 多几十 KB。需要显示中文时，先加载约 1.4 MB 的常用字体（GB2312 的全部字符）；遇到它没有收录的字符，再加载约 16 MB 的完整字体。字体会缓存在浏览器里，供以后使用。其他文字取决于内置字体覆盖的范围。</p><h3>拆分 PDF 和批量预设</h3><p>按单页、每 N 页，或者 1-3; 4-6 这样的自定义分组拆分。分号表示开始一个新的输出 PDF。可以分别下载，或者下载一个 ZIP。批量工具可以组合水印、页眉和页脚、页码和裁剪。每个文件的编号都重新开始。预设保存在这个浏览器里；PDF 不会保存。</p>',
};

/** Each English text of the interface, and its Chinese. */
export const ZH = {
  // ---- editor-core.js: what each tool does, and messages
  'Click the page where your text should start, then type. Drag text to move it.':
    '点击页面上文字开始的地方，然后输入。拖动文字可以移动它。',
  'Add a PNG or JPG to this page, then drag it into place. Drag a corner to resize it.':
    '在这一页上添加 PNG 或 JPG 图片，再拖到合适的位置。拖动一角可以调整大小。',
  'Drag across the page to highlight an area. Drag a highlight to move it.':
    '在页面上拖动，高亮一块区域。拖动高亮可以移动它。',
  'A text mark across your pages, as bold or as subtle as you like. Changes show as you make them.':
    '横跨页面的文字标记，醒目或低调随你。修改立即显示。',
  'Put the same details in a consistent place on your pages. Type in any position to add it.':
    '把同样的信息放在每一页的固定位置。在任意位置输入即可添加。',
  'Give your document an easy-to-follow sequence. Changes show as you make them.':
    '给文档编上清楚的页码。修改立即显示。',
  'Choose pages in the strip. Drag to reorder, or use the buttons below.':
    '在页面列表里选择页面。拖动调整顺序，或者用下面的按钮。',
  'Add PDF files, then arrange their pages in the strip.': '添加 PDF 文件，然后在页面列表里排列它们的页面。',
  'Select the pages to remove using their checkboxes or a page range. Undo brings them back.':
    '用复选框或页面范围选择要删除的页面。撤销可以把它们找回来。',
  'Drag across the page to choose the area to keep, or set the margins below.':
    '在页面上拖动，选出要保留的区域，或者在下面设定边距。',
  'Add blank space around your pages: room for notes, binding or punching.':
    '在页面周围加上空白：留出写笔记、装订或打孔的空间。',
  'Put your pages on A4 or Letter paper, each scaled to fit: one size for a document of mixed or odd sizes.':
    '把页面放到 A4 或 Letter 纸上，每一页缩放到合适大小：让大小不一的文档统一尺寸。',
  'Create separate PDFs from this document, including your edits.': '把这份文档拆成几个 PDF，带上你的编辑。',
  'Put 2 or 4 pages on each sheet, for handouts or to save paper. The sheets download as a new PDF; your document stays as it is.':
    '每张纸放 2 页或 4 页，做讲义或节省纸张。排好的纸张作为新的 PDF 下载；你的文档保持原样。',
  'Choose a password. Anyone who opens the PDF you download will need it.':
    '设一个密码。打开你下载的 PDF 的人都需要它。',
  'Download a copy of your PDF that opens without a password.': '下载一份不用密码就能打开的 PDF 副本。',
  'Draw, type or upload your signature, then click the page where it belongs. Drag it to move it, or a corner to resize it.':
    '手写、输入或上传你的签名，然后点击页面上要签名的地方。拖动它可以移动，拖动一角可以调整大小。',
  'Your JPG and PNG pictures are pages. Choose their paper size, put them in order in the page strip, then download one PDF.':
    '你的 JPG 和 PNG 图片就是页面。选择页面尺寸，在页面列表里排好顺序，然后下载一个 PDF。',
  'Save pages as JPG or PNG pictures, exactly as they look with your edits.':
    '把页面存成 JPG 或 PNG 图片，和加上编辑后看到的一模一样。',
  'Click a field to type in it, or tick its box. Tab moves to the next field.':
    '点击字段输入文字，或者勾选复选框。按 Tab 跳到下一个字段。',
  'The title, author and other details saved in your PDF. Change them, or remove them before you share it.':
    '保存在你的 PDF 里的标题、作者等信息。修改它们，或者在分享前删掉。',
  'Draw on the page with a pen, or drag to add a line, an arrow, a rectangle or an ellipse.':
    '用画笔在页面上画，或者拖动添加直线、箭头、矩形或椭圆。',
  DRAFT: '草稿',
  'Page {page} of {total}': '第 {page} 页，共 {total} 页',
  'Working on your PDF…': '正在处理你的 PDF…',
  'That did not work. Please try a different PDF.': '没有成功。请换一个 PDF 试试。',
  // ---- editor.js
  'Your download will need its password to open': '下载的文件需要密码才能打开',
  'Undo: {step}': '撤销：{step}',
  'Redo: {step}': '重做：{step}',
  'Undone: {step}.': '已撤销：{step}。',
  'Redone: {step}.': '已重做：{step}。',
  'Combined document.pdf': '合并后的文档.pdf',
  '{count} page · {size}': '{count} 页 · {size}',
  '{count} pages · {size}': '{count} 页 · {size}',
  Reset: '重置',
  'Back to your original document. Undo brings your edits back.':
    '已回到原来的文档。撤销可以把你的编辑找回来。',
  'Stop the batch or wait for it to finish before switching workspaces.':
    '先停止批量处理，或者等它完成，再切换工作区。',
  'Stopping after the current output…': '当前文件完成后停止…',
  'Opening the sample document…': '正在打开示例文档…',
  'The sample could not load. Please choose your own PDF.': '示例文档没能加载。请选择你自己的 PDF。',
  'A little room to create.pdf': '示例文档.pdf',
  'START FRESH': '重新开始',
  'Reset this document?': '要重置这份文档吗？',
  'This clears your edits and added PDFs and returns to the document you first opened. Undo brings your edits back. Your original files are unchanged.':
    '这会清除你的编辑和添加的 PDF，回到你最初打开的文档。撤销可以把编辑找回来。你的原文件不会被改动。',
  'Reset document': '重置文档',
  'Remove password': '去掉密码',
  'Password removed. Your download will open without one.': '密码已去掉。下载的文件不用密码就能打开。',
  'These pages show their original boundaries already.': '这些页面显示的已经是原来的边界。',
  'Restore crop': '恢复原始裁剪',
  'Original page boundaries restored.': '已恢复原来的页面边界。',
  'Every field is filled in.': '每个字段都已填写。',
  'Enter a page number from 1 to {count}.': '请输入 1 到 {count} 之间的页码。',
  'Page {page} selected, in place of page {opened}, which the document opened with.':
    '已选中第 {page} 页，取代打开文档时选中的第 {opened} 页。',
  'Wait for the current task to finish, or stop it, before leaving this view.':
    '先等当前任务完成，或者停止它，再离开这个视图。',
  'CHANGE LANGUAGE': '切换语言',
  'Leave your document?': '要离开你的文档吗？',
  'The page opens again in the other language, without your document. Download your edited PDF first if you want to keep it.':
    '页面会用另一种语言重新打开，你的文档不会带过去。如果想保留它，请先下载编辑后的 PDF。',
  'Change language': '切换语言',
  // ---- app.js
  'QFT PDF was updated while this page was open. Please reload the page.':
    'QFT PDF 在这个页面打开期间更新了。请重新加载页面。',
  'The editor could not be loaded. Check your connection, then reload the page.':
    '编辑器没能加载。请检查网络连接，然后重新加载页面。',
  'You are on {tool}: {link}.': '你在“{tool}”页面：{link}。',
  'use it on your open document': '用在你打开的文档上',
  'You are on {tool}: {action} above.': '你在“{tool}”页面：请在上方{action}。',
  'QFT PDF has been updated, so this page was reloaded. Please try again.':
    'QFT PDF 已经更新，所以这个页面重新加载了。请再试一次。',
  'QFT PDF needs a modern browser. Please use a recent version of Chrome, Edge, Firefox, or Safari.':
    'QFT PDF 需要较新的浏览器。请使用新版的 Chrome、Edge、Firefox 或 Safari。',
  // ---- views.js
  '{tool} — QFT PDF': '{tool} · QFT PDF',
  // ---- documents.js
  'The PDF could not be created. Please try again.': '无法生成 PDF，请重试。',
  'The PDF could not be created.': '无法生成 PDF。',
  Cancel: '取消',
  'Stopped. Your document is unchanged.': '已停止，你的文档没有改动。',
  'Preparing your PDF…': '正在准备你的 PDF…',
  document: '文档',
  '-protected': '-已加密',
  '-unlocked': '-已解锁',
  '-converted': '-已转换',
  '-merged': '-已合并',
  '-numbered': '-已加页码',
  '-watermarked': '-已加水印',
  '-edited': '-已编辑',
  '-signed': '-已签名',
  '-cropped': '-已裁剪',
  '-resized': '-已调整尺寸',
  '-filled': '-已填写',
  '-organized': '-已整理',
  '-selected': '-选中的页面',
  'PDF/A files can’t have a password': 'PDF/A 文件不能设置密码',
  'added text and marks don’t meet PDF/A rules': '添加的文字和标记不符合 PDF/A 的规定',
  'comments, links or fields outside the visible page were hidden, which PDF/A doesn’t allow':
    '页面可见区域以外的批注、链接或字段被隐藏了，而 PDF/A 不允许这样做',
  'changing its details removes the metadata that declares PDF/A': '修改文档信息会删掉声明 PDF/A 的元数据',
  'page labels (such as i, ii, iii)': '页码标签（比如 i、ii、iii）',
  'attached files': '附件',
  'accessibility tags': '无障碍标签',
  'It’s no longer marked as PDF/A (archival), because {reasons}.':
    '它不再标记为 PDF/A（长期存档格式），因为{reasons}。',
  ', and ': '，而且',
  'Their pages were copied into new PDFs, without the original’s {list}.':
    '这些页面已复制到新的 PDF 中，没有带上原文件的{list}。',
  'Its pages were copied into a new PDF, without the original’s {list}.':
    '它的页面已复制到一个新的 PDF 中，没有带上原文件的{list}。',
  'The original was digitally signed: its signature isn’t valid in these copies.':
    '原文件有数字签名：这个签名在这些副本里不再有效。',
  'The original was digitally signed: its signature isn’t valid in this copy.':
    '原文件有数字签名：这个签名在这份副本里不再有效。',
  'What you added isn’t tagged for screen readers; they skip the page numbers, headers, footers and watermark, which are marked as artifacts.':
    '你添加的内容没有为读屏软件加标签。页码、页眉、页脚和水印被标记为非正文内容，读屏软件会跳过它们。',
  'Your protected PDF has been downloaded. It needs your password to open.':
    '已下载加密的 PDF。打开它需要你的密码。',
  'Your unlocked PDF has been downloaded.': '已下载解锁后的 PDF。',
  'Your edited PDF has been downloaded.': '已下载编辑后的 PDF。',
  'Preparing selected pages…': '正在准备选中的页面…',
  '{count} selected page downloaded.': '已下载选中的 {count} 页。',
  '{count} selected pages downloaded.': '已下载选中的 {count} 页。',
  'The PDF needs your password to open.': '打开这个 PDF 需要你的密码。',
  'Skip this file': '跳过这个文件',
  'Enter the password.': '请输入密码。',
  'Opening…': '正在打开…',
  'Open PDF': '打开 PDF',
  'Everything happens on your device.': '一切都在你的设备上完成。',
  'Your picture is a PDF page now. Download it, or add more pictures.':
    '你的图片已经变成 PDF 页面。可以下载，也可以再添加图片。',
  'Your {count} pictures are PDF pages now. Put them in order, then download one PDF.':
    '你的 {count} 张图片已经变成 PDF 页面。排好顺序，然后下载成一个 PDF。',
  '{count} page added. Arrange them, then download.': '已添加 {count} 页。排好顺序，然后下载。',
  '{count} pages added. Arrange them, then download.': '已添加 {count} 页。排好顺序，然后下载。',
  'Your PDF is unlocked. Download a copy that opens without a password and without limits on printing, copying or changes.':
    '你的 PDF 已解锁。下载一份副本，打开时不需要密码，打印、复制和修改也不受限制。',
  'Your PDF is unlocked. Download a copy that opens without a password.':
    '你的 PDF 已解锁。下载一份副本，打开时不需要密码。',
  'Your PDF is unlocked for editing, here on your device.': '你的 PDF 已在这台设备上解锁，可以编辑了。',
  'Your PDF has fields to fill in: click one to type in it.':
    '你的 PDF 有可以填写的字段：点击一个字段就能输入。',
  'Your PDF is ready.': '你的 PDF 已经打开。',
  'Your download will keep the same password. Change it in Protect PDF.':
    '下载的文件会保留同样的密码。可以在“加密 PDF”里修改。',
  'It had limits on printing, copying or changes, which your download won’t have.':
    '它原来限制了打印、复制或修改，下载的文件不会有这些限制。',
  '{names} wasn’t opened.': '{names}没有打开。',
  '{names} weren’t opened.': '{names}没有打开。',
  'Updating the pages made from pictures…': '正在更新由图片生成的页面…',
  'Page size': '页面尺寸',
  'Please choose PDF files, or JPG and PNG pictures to make pages from.':
    '请选择 PDF 文件，或者用来生成页面的 JPG 和 PNG 图片。',
  'START A NEW DOCUMENT': '打开新文档',
  'Replace your current document?': '要替换当前的文档吗？',
  'Your edits will be cleared. Download your edited PDF first if you want to keep it.':
    '你的编辑会被清除。如果想保留，请先下载编辑后的 PDF。',
  'Open new PDF': '打开新的 PDF',
  'Opening your PDF…': '正在打开你的 PDF…',
  'Opening your PDFs…': '正在打开你的 PDF…',
  'PDFs with form fields can only be combined with other files once their fields are flattened. Turn on “Flatten fields on download” in Fill form, then add the file again.':
    '有表单字段的 PDF 要先拼合字段，才能和其他文件合并。请在“填写表单”里打开“下载时拼合字段”，然后再添加这个文件。',
  'Add files': '添加文件',
  'Return to your open document': '回到你打开的文档',
  // ---- editor.js
  'Redone.': '已重做。',
  'Undone.': '已撤销。',
  '-split': '-已拆分',
  '{tool} preset': '{tool}预设',
  // ---- layout.js
  'Page rotation must be a multiple of 90 degrees.': '页面旋转角度必须是 90 度的倍数。',
  'The available font cannot display “{character}”. Remove that character or use a supported alphabet.':
    '可用的字体无法显示“{character}”。请删掉这个字符，或者改用支持的文字。',
  'Crop margins must be less than 100% of the page, and added margins less than {times} times its size.':
    '裁剪的边距必须小于页面的 100%，添加的边距必须小于页面尺寸的 {times} 倍。',
  'Crop margins must leave some of the page visible.': '裁剪后必须留下一部分页面。',
  'The cropped page must be at least 1 PDF point wide and high.': '裁剪后的页面宽度和高度都至少要有 1 磅。',
  'Choose a paper size: A4 or Letter.': '请选择纸张尺寸：A4 或 Letter。',
  'These margins leave no room for the page on its sheet. Make them smaller.':
    '这些边距让纸上放不下页面。请把边距调小。',
  'A text annotation extends below its page. Move it up or use a smaller font.':
    '有一段文字超出了页面底部。请把它往上移，或者用小一点的字号。',
  'The header or footer is too long. Shorten it or use more than one text position.':
    '页眉或页脚太长了。请缩短文字，或者把它分放到几个位置。',
  'The page number text is too long for the page. Shorten it or use a smaller size.':
    '页码文字太长，页面放不下。请缩短文字，或者用小一点的字号。',
  // ---- pdf-engine.js
  'The PDF tools did not load. Check your connection, then try again.':
    'PDF 工具没有加载成功。请检查网络连接，然后重试。',
  'The text font engine did not load. Check your connection, then try again.':
    '文字字体引擎没有加载成功。请检查网络连接，然后重试。',
  'Choose a PDF file to continue.': '请选择一个 PDF 文件继续。',
  'Enter a password to protect your PDF.': '请输入用来保护 PDF 的密码。',
  'Passwords can’t contain control characters.': '密码不能包含控制字符。',
  'This password is too long. Use a shorter one.': '这个密码太长了，请用短一点的密码。',
  'That password didn’t open this PDF. Check it and try again.': '这个密码打不开这个 PDF。请检查后重试。',
  'This PDF is password-protected. Enter its password to open it.': '这个 PDF 有密码保护。请输入密码打开它。',
  'This PDF is protected in a way QFT PDF can’t open, such as with a certificate. Remove the protection in the app that made it, then try again.':
    '这个 PDF 的保护方式（比如证书保护）QFT PDF 打不开。请在制作它的软件里去掉保护，然后重试。',
  'This file could not be opened as a PDF. Try opening it in a PDF reader and saving a new copy.':
    '这个文件无法作为 PDF 打开。可以试试用 PDF 阅读器打开它，再另存一份新的副本。',
  'This PDF has no pages.': '这个 PDF 没有页面。',
  '“{field}” can’t take this value. {reason}': '“{field}”不能填写这个值。{reason}',
  '“{field}”: {reason}': '“{field}”：{reason}',
  'The font for this text could not be loaded. Check your connection, then try again.':
    '这段文字需要的字体没有加载成功。请检查网络连接，然后重试。',
  'Page {page}: {message}': '第 {page} 页：{message}',
  'Choose a PNG or JPEG image to add to the PDF.': '请选择要添加到 PDF 的 PNG 或 JPEG 图片。',
  'This image could not be added. Choose a valid PNG or JPEG image.':
    '无法添加这张图片。请选择有效的 PNG 或 JPEG 图片。',
  'Keep at least one page before exporting your PDF.': '导出 PDF 前至少要保留一页。',
  'The page list contains duplicate page IDs. Reload this document and try again.':
    '页面列表里有重复的页面编号。请重新加载这个文档，然后重试。',
  'A source PDF is missing. Add the file again before exporting.':
    '缺少一个源 PDF。请在导出前重新添加这个文件。',
  'A selected page does not exist in its source PDF. Reload the file and try again.':
    '选中的一页在源 PDF 里不存在。请重新加载文件，然后重试。',
  'This PDF lists one of its pages twice. To change its pages, QFT PDF copies them, and a form’s pages can be copied only once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.':
    '这个 PDF 把它的某一页列了两次。要修改页面，QFT PDF 需要复制页面，而表单的页面要先拼合字段才能复制。请在“填写表单”里打开“下载时拼合字段”，然后重试。',
  'Pages of a PDF with form fields can only be combined, duplicated or extracted once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.':
    '有表单字段的 PDF 要先拼合字段，才能合并、复制或提取它的页面。请在“填写表单”里打开“下载时拼合字段”，然后重试。',
  'A blank page must be between 1 and 14,400 points wide and high.':
    '空白页的宽度和高度必须在 1 到 14,400 磅之间。',
  'Choose at least one JPG or PNG picture.': '请至少选择一张 JPG 或 PNG 图片。',
  'Choose a page size: the picture’s own size, A4 or Letter.':
    '请选择页面尺寸：图片原来的尺寸、A4 或 Letter。',
  'A picture could not be read. Choose JPG or PNG files.': '有一张图片无法读取。请选择 JPG 或 PNG 文件。',
  'The margins leave no room for the pages. Make them smaller.': '这些边距让页面没有地方放了。请把边距调小。',
  'Choose 2 or 4 pages per sheet.': '请选择每张纸放 2 页或 4 页。',
  'Choose A4 or Letter paper.': '请选择 A4 或 Letter 纸张。',
  'Margins and gaps can’t be negative.': '边距和间距不能是负数。',
  'A PDF with form fields goes on sheets once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.':
    '有表单字段的 PDF 要先拼合字段，才能排到纸上。请在“填写表单”里打开“下载时拼合字段”，然后重试。',
  'Open a PDF before choosing a page range.': '请先打开一个 PDF，再选择页面范围。',
  'Use page numbers like 1-3, 5.': '请用 1-3, 5 这样的页码格式。',
  'Choose page numbers between 1 and {count}, with each range in ascending order.':
    '请选择 1 到 {count} 之间的页码，每个范围从小到大写。',
  // ---- workflows.js
  '{label} must be a number.': '{label}必须是数字。',
  '{label} must be a whole number between {minimum} and {maximum}.':
    '{label}必须是 {minimum} 到 {maximum} 之间的整数。',
  '{label} must be a number between {minimum} and {maximum}.':
    '{label}必须是 {minimum} 到 {maximum} 之间的数字。',
  '{label} must be text.': '{label}必须是文字。',
  '{label} can contain up to {limit} characters.': '{label}最多可以有 {limit} 个字符。',
  'Enter {label}.': '请输入{label}。',
  '{label} contains unsupported control characters.': '{label}包含不支持的控制字符。',
  '{label} must be a six-digit hex color, such as #244e41.':
    '{label}必须是六位十六进制颜色值，比如 #244e41。',
  'Choose a valid {label}.': '请选择有效的{label}。',
  '{label} settings must be an object.': '{label}的设置必须是一个对象。',
  'Choose or create a valid preset.': '请选择或新建一个有效的预设。',
  'This preset version is not supported.': '不支持这个版本的预设。',
  'Untitled preset': '未命名预设',
  'Preset name': '预设名称',
  Watermark: '水印',
  'Watermark text': '水印文字',
  'Watermark size': '水印字号',
  'Watermark color': '水印颜色',
  'Watermark opacity': '水印不透明度',
  'Watermark angle': '水印角度',
  'Watermark position': '水印位置',
  'Headers and footers': '页眉和页脚',
  'Header or footer text': '页眉或页脚文字',
  'Enter text in at least one header or footer position.': '请至少在一个页眉或页脚位置输入文字。',
  'Header/footer size': '页眉/页脚字号',
  'Header/footer color': '页眉/页脚颜色',
  'Header/footer margin': '页眉/页脚边距',
  'Page numbers': '页码',
  'Page number format': '页码格式',
  'First page number': '起始页码',
  'Page number size': '页码字号',
  'Page number color': '页码颜色',
  'Page number margin': '页码边距',
  'Page number position': '页码位置',
  Crop: '裁剪',
  'Crop left margin': '左侧裁剪边距',
  'Crop top margin': '顶部裁剪边距',
  'Crop right margin': '右侧裁剪边距',
  'Crop bottom margin': '底部裁剪边距',
  'Crop margins must keep more than 1% of each page’s width and height.':
    '裁剪后，每页的宽度和高度都必须保留 1% 以上。',
  'Set at least one crop margin above zero, or turn off cropping.':
    '请至少把一个裁剪边距设为大于零，或者关闭裁剪。',
  'Enable at least one operation: watermark, header/footer, page numbers, or crop.':
    '请至少打开一项操作：水印、页眉和页脚、页码或裁剪边距。',
  'Open a PDF before choosing how to split it.': '请先打开一个 PDF，再选择拆分方式。',
  'Choose how to split this PDF.': '请选择这个 PDF 的拆分方式。',
  'Pages per PDF': '每个 PDF 的页数',
  'Enter page groups such as 1-3; 4-6; 7. Each semicolon starts a new PDF.':
    '请输入页面分组，比如 1-3; 4-6; 7。每个分号开始一个新的 PDF。',
  'Each page group needs at least one page. Remove empty groups or a trailing semicolon.':
    '每个页面分组至少要有一页。请删掉空的分组，或者末尾多余的分号。',
  'Output {number}: {message}': '第 {number} 个文件：{message}',
  'Choose individual pages, a fixed number of pages, or custom page groups.':
    '请选择按单页、按固定页数，或者按自定义分组拆分。',
  'Splitting stopped. Your original PDF is unchanged.': '已停止拆分，原来的 PDF 没有改动。',
  'Choose at least one output page group.': '请至少选择一个输出的页面分组。',
  'Each output must contain valid page numbers between 1 and {total}.':
    '每个输出文件都必须包含 1 到 {total} 之间的有效页码。',
  'A PDF with form fields can only be split once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.':
    '有表单字段的 PDF 要先拼合字段才能拆分。请在“填写表单”里打开“下载时拼合字段”，然后重试。',
  '{title} — part {part}': '{title}（第 {part} 部分）',
  'This PDF needs a password. Remove it with Unlock PDF, then add the unlocked copy here.':
    '这个 PDF 需要密码。请先用“解锁 PDF”去掉密码，再把解锁后的副本添加到这里。',
  'This ZIP would exceed the ZIP32 format’s size or file-count limit. Download the PDFs individually or use smaller groups.':
    '这个 ZIP 会超过 ZIP32 格式的大小或文件数量上限。请分别下载 PDF，或者把分组调小。',
  'There are no completed PDFs to download.': '没有可以下载的已完成 PDF。',
  'A completed PDF is missing its file data.': '有一个已完成的 PDF 缺少文件数据。',
  // ---- batch-ui.js
  'Draft copy': '草稿副本',
  'Numbered document': '加页码的文档',
  'Lecture handout': '课程讲义',
  'Course notes': '课程笔记',
  'Swap left and right on even pages': '偶数页左右互换',
  '{operation} settings': '{operation}设置',
  'Batch processing and saved presets': '批量处理和保存的预设',
  'All tools': '全部工具',
  'Processed on your device': '在你的设备上处理',
  'A WORKFLOW WORTH REPEATING': '值得反复使用的流程',
  'One setup. <em>Every PDF.</em>': '一次设置，<em>处理每一份 PDF。</em>',
  'Apply a saved combination of edits to separate files, then download them together.':
    '把保存好的一组编辑分别应用到多个文件，然后一起下载。',
  'BATCH &amp; PRESETS': '批量处理和预设',
  'Batch preset settings': '批量预设设置',
  'Set up your edits': '设置你的编辑',
  'Start with a preset, then make it yours.': '从一个预设开始，再按你的需要调整。',
  Preset: '预设',
  'e.g. Course handout': '比如：课程讲义',
  'Save preset': '保存预设',
  'Saved presets stay in this browser. PDF files are never saved with them.':
    '保存的预设只留在这个浏览器里。PDF 文件不会随预设一起保存。',
  'Delete saved preset': '删除保存的预设',
  'Repeat a text stamp on every page.': '在每一页上重复一段文字标记。',
  'Text size (pt)': '字号（磅）',
  'Opacity (%)': '不透明度（%）',
  'Angle (°)': '角度（°）',
  Center: '居中',
  Top: '顶部',
  Bottom: '底部',
  'Headers & footers': '页眉和页脚',
  'Consistent details at the page edges.': '在页面边缘加上统一的信息。',
  'Use {page} and {total} for page numbers within each file, {date} for today’s date and {filename} for each file’s name.':
    '用 {page} 和 {total} 表示每个文件里的页码和总页数，{date} 表示今天的日期，{filename} 表示每个文件的名称。',
  Header: '页眉',
  Footer: '页脚',
  'Header left': '页眉左侧',
  'Header center': '页眉中间',
  'Header right': '页眉右侧',
  'Footer left': '页脚左侧',
  'Footer center': '页脚中间',
  'Footer right': '页脚右侧',
  'Size (pt)': '字号（磅）',
  'Margin (pt)': '边距（磅）',
  'Text color': '文字颜色',
  'Number each document independently.': '每个文档单独编号。',
  'Number format': '页码格式',
  'Use {page} for the number and {total} for each file’s page count. {date} and {filename} work too.':
    '用 {page} 表示页码，{total} 表示每个文件的总页数。也可以用 {date} 和 {filename}。',
  'Number position': '页码位置',
  'Bottom right': '右下角',
  'Bottom center': '底部居中',
  'Bottom left': '左下角',
  'Start numbering at': '起始页码',
  'Number size (pt)': '页码字号（磅）',
  'Number margin (pt)': '页码边距（磅）',
  'Number color': '页码颜色',
  'Crop margins': '裁剪边距',
  'Trim the same percentage from each page.': '从每一页裁掉相同的百分比。',
  'Top margin (%)': '上边距（%）',
  'Bottom margin (%)': '下边距（%）',
  'Left margin (%)': '左边距（%）',
  'Right margin (%)': '右边距（%）',
  'Margins follow each page’s visible orientation. Cropping hides content; it is not secure redaction.':
    '边距按每一页显示的方向计算。裁剪只是隐藏内容，不是安全的涂黑。',
  'Add your PDFs': '添加你的 PDF',
  'Each file stays separate. Your originals stay unchanged.': '每个文件分别处理，原文件保持不变。',
  'Choose PDFs or drop them here': '选择 PDF，或者拖到这里',
  'Multiple files · no fixed size or page limit': '可以选多个文件 · 不设大小和页数上限',
  'Clear list': '清空列表',
  'Files in this batch': '这一批的文件',
  'Large batches depend on available browser memory. Files are processed one at a time.':
    '一批能处理多少，取决于浏览器可用的内存。文件会一个接一个地处理。',
  'Process and download': '处理并下载',
  'Settings changed. Existing downloads use the previous settings; process again to update them.':
    '设置已更改。已经处理好的文件用的是之前的设置，重新处理就能更新。',
  'Preparing files…': '正在准备文件…',
  'Batch processing progress': '批量处理进度',
  'Add PDFs to get started.': '请先添加 PDF。',
  'Process PDFs': '处理 PDF',
  'Stop after this file': '处理完这个文件后停止',
  'Download ZIP': '下载 ZIP',
  'Download individual files from the list, or collect successful results in one ZIP.':
    '可以在列表里逐个下载，也可以把处理成功的文件打包成一个 ZIP。',
  'Custom settings': '自定义设置',
  'Ready to use': '现成的预设',
  'Your saved presets': '你保存的预设',
  'Browser storage is unavailable. Presets are available in this tab only.':
    '浏览器存储不可用。预设只能在这个标签页里使用。',
  '{operations}. Applied to every page of each file.': '{operations}。应用到每个文件的每一页。',
  'Enable at least one edit in your preset.': '请在预设里至少打开一项编辑。',
  'Custom preset': '自定义预设',
  'Give your preset a name before saving it.': '保存前请先给预设起个名字。',
  '“{name}” saved in this browser.': '“{name}”已保存在这个浏览器里。',
  '“{name}” is saved for this tab only. Browser storage is unavailable.':
    '“{name}”只保存在这个标签页里。浏览器存储不可用。',
  'The preset could not be saved.': '无法保存这个预设。',
  'Saved preset deleted. Its settings remain here until you change them.':
    '已删除保存的预设。它的设置会留在这里，直到你修改。',
  'Preset removed from this tab. Browser storage could not be updated.':
    '已从这个标签页移除预设。浏览器存储无法更新。',
  Ready: '待处理',
  Processing: '处理中',
  'Ready to download': '可以下载',
  'Could not process': '无法处理',
  'Download {name}': '下载 {name}',
  Download: '下载',
  'Remove {name} from batch': '从这一批里移除 {name}',
  '{count} PDF · {size}': '{count} 个 PDF · {size}',
  '{count} PDFs · {size}': '{count} 个 PDF · {size}',
  'Processing…': '正在处理…',
  'Process {count} PDF again': '重新处理 {count} 个 PDF',
  'Process {count} PDFs again': '重新处理 {count} 个 PDF',
  'Process {count} PDF': '处理 {count} 个 PDF',
  'Process {count} PDFs': '处理 {count} 个 PDF',
  'Stopping after this file…': '处理完这个文件后停止…',
  'Download ZIP ({count})': '下载 ZIP（{count}）',
  'Wait for this batch to finish, or stop after the current file, before adding PDFs.':
    '请等这一批处理完，或者在当前文件之后停止，再添加 PDF。',
  '{count} PDF added. Choose your settings, then process the batch.':
    '已添加 {count} 个 PDF。选好设置，然后开始处理。',
  '{count} PDFs added. Choose your settings, then process the batch.':
    '已添加 {count} 个 PDF。选好设置，然后开始处理。',
  'Only PDF files were added. Choose PNG/JPG images in the single-document editor.':
    '只添加了 PDF 文件。PNG/JPG 图片请在单个文档的编辑器里选择。',
  '{name} downloaded.': '已下载 {name}。',
  '-batch': '-批量处理',
  '{count} processed PDF downloaded in a ZIP.': '已下载 ZIP，里面有 {count} 个处理好的 PDF。',
  '{count} processed PDFs downloaded in a ZIP.': '已下载 ZIP，里面有 {count} 个处理好的 PDF。',
  'The ZIP could not be created. Download files individually instead.': '无法生成 ZIP。请改为逐个下载文件。',
  'Check your preset settings.': '请检查预设的设置。',
  'File {number} of {total} · {name}': '第 {number} 个文件，共 {total} 个 · {name}',
  'Applying “{preset}” to file {number} of {total}.':
    '正在把“{preset}”应用到第 {number} 个文件（共 {total} 个）。',
  '-processed': '-已处理',
  'This PDF could not be processed.': '无法处理这个 PDF。',
  'Stopped after the current file': '已在当前文件之后停止',
  'Batch complete': '批量处理完成',
  '{count} file ready': '{count} 个文件已完成',
  '{count} files ready': '{count} 个文件已完成',
  '{count} could not be processed': '{count} 个无法处理',
  '{count} not processed': '{count} 个未处理',
  '{summary}.': '{summary}。',
  'The current file will finish; remaining files will stay unprocessed.':
    '当前文件会处理完，剩下的文件不会处理。',
  'This preset could not be opened.': '无法打开这个预设。',
  'Finish this batch, or stop after the current file, before switching workspaces.':
    '请等这一批处理完，或者在当前文件之后停止，再切换工作区。',
  // ---- tool-panel.js
  Color: '颜色',
  'Width (%)': '宽度（%）',
  'Height (%)': '高度（%）',
  Alignment: '对齐',
  Left: '靠左',
  Right: '靠右',
  'Use these settings in batch': '在批量处理里使用这些设置',
  'Apply this tool to every page in separate PDFs, and save it as a preset.':
    '把这个工具应用到多个 PDF 的每一页，还可以保存为预设。',
  'ON THIS PAGE': '这一页上的内容',
  'Delete {item}': '删除{item}',
  'This number': '这个数字',
  '“{label}” can be {min} to {max}, so it’s set to {value}.':
    '“{label}”的范围是 {min} 到 {max}，所以已设为 {value}。',
  'Resize signature': '调整签名大小',
  'Resize image': '调整图片大小',
  // ---- panel-settings.js
  'Remember these settings on this device': '在这台设备上记住这些设置',
  'Kept in this browser only: the text and options above, not your PDF or which pages. This tool starts from them next time; untick to forget them.':
    '只保存在这个浏览器里：上面的文字和选项，不包括你的 PDF，也不包括选了哪些页。下次打开这个工具时会用这些设置；取消勾选就会忘掉它们。',
  'Your saved watermark is shown on every page. Undo takes it away.':
    '已在每一页显示你保存的水印。撤销可以去掉它。',
  'Your saved headers and footers are shown on every page. Undo takes them away.':
    '已在每一页显示你保存的页眉和页脚。撤销可以去掉它们。',
  'Your saved page numbers are shown on every page. Undo takes them away.':
    '已在每一页显示你保存的页码。撤销可以去掉它们。',
  'Watermark “DRAFT” shown on every page. Undo takes it away.': '已在每一页显示水印“草稿”。撤销可以去掉它。',
  'Page numbers shown on every page. Undo takes them away.': '已在每一页显示页码。撤销可以去掉它们。',
  'For printing on both sides: text on the right of odd pages goes on the left of even pages, so it stays on the outer edge.':
    '用于双面打印：奇数页右侧的文字在偶数页放到左侧，这样它总在外侧边缘。',
  'Show on': '显示在',
  'Every page': '每一页',
  'Only some pages': '部分页面',
  'e.g. 1-3, 5': '比如 1-3, 5',
  'Numbers follow the current page order.': '页码按当前的页面顺序计算。',
  'Use the selected pages': '使用选中的页面',
  'Enter the page numbers to show this on, for example 1-3, 5.': '请输入要在哪些页上显示，比如 1-3, 5。',
  '{tool} shown.': '已显示{tool}。',
  '{tool} hidden.': '已隐藏{tool}。',
  'Show the watermark': '显示水印',
  'e.g. DRAFT': '比如：草稿',
  Opacity: '不透明度',
  Angle: '角度',
  Position: '位置',
  'Center of page': '页面中央',
  'Top of page': '页面顶部',
  'Bottom of page': '页面底部',
  'Show headers & footers': '显示页眉和页脚',
  'Type <strong>{page}</strong> for the page number and <strong>{total}</strong> for the number of pages: “Page {page} of {total}” shows as “Page 2 of 5”. <strong>{date}</strong> is today’s date and <strong>{filename}</strong> the file’s name.':
    '输入 <strong>{page}</strong> 表示页码，<strong>{total}</strong> 表示总页数：“第 {page} 页，共 {total} 页”会显示为“第 2 页，共 5 页”。<strong>{date}</strong> 是今天的日期，<strong>{filename}</strong> 是文件名。',
  HEADER: '页眉',
  FOOTER: '页脚',
  'e.g. Project name': '比如：项目名称',
  'e.g. Your name': '比如：你的名字',
  'e.g. © Your organization': '比如：© 你的单位',
  'e.g. Page {page}': '比如：第 {page} 页',
  'Edge margin (pt)': '离边缘的距离（磅）',
  'Show page numbers': '显示页码',
  '<strong>{page}</strong> is the page number. <strong>{total}</strong> is the document page count. <strong>{date}</strong> and <strong>{filename}</strong> work too.':
    '<strong>{page}</strong> 是页码，<strong>{total}</strong> 是文档的总页数。也可以用 <strong>{date}</strong> 和 <strong>{filename}</strong>。',
  'This browser could not keep these settings.': '这个浏览器无法保存这些设置。',
  'These settings will be remembered on this device.': '这台设备会记住这些设置。',
  'These settings are no longer remembered.': '不再记住这些设置。',
  'Use the {count} selected page': '使用选中的 {count} 页',
  'Use the {count} selected pages': '使用选中的 {count} 页',
  'Select pages in the strip to use them': '先在页面列表里选择页面',
  // ---- page-items.js
  'Delete text': '删除文字',
  'Resize text': '调整文字框大小',
  'Add highlight': '添加高亮',
  'Add drawing': '添加绘图',
  'Add image': '添加图片',
  'Width {width}% of the page.': '宽度为页面的 {width}%。',
  'Width {width}% of the page, height {height}%.': '宽度为页面的 {width}%，高度为 {height}%。',
  '{item} deleted.': '已删除{item}。',
  'Edit text': '编辑文字',
  'Please choose a PNG or JPG image.': '请选择 PNG 或 JPG 图片。',
  'Please choose an image smaller than 15 MB.': '请选择小于 15 MB 的图片。',
  'Choose an image with fewer than 30 million pixels.': '请选择少于 3000 万像素的图片。',
  'Image added. Drag it into place, or drag a corner to resize it.':
    '已添加图片。把它拖到合适的位置，或者拖动一角调整大小。',
  'Move text': '移动文字',
  'Move image': '移动图片',
  'Move highlight': '移动高亮',
  'Move signature': '移动签名',
  'Move drawing': '移动绘图',
  'Resize highlight': '调整高亮大小',
  'Resize drawing': '调整绘图大小',
  'Delete image': '删除图片',
  'Delete highlight': '删除高亮',
  'Delete signature': '删除签名',
  'Delete drawing': '删除绘图',
  'Make your signature first: draw, type or upload it in the panel.':
    '请先制作签名：在面板里手写、输入或上传。',
  'Add signature': '添加签名',
  'Your signature is on all {count} pages. Drag any of them to adjust it.':
    '你的签名已放到全部 {count} 页上。拖动其中任意一个就能调整。',
  'Signature added to {count} more page.': '签名已添加到另外 {count} 页。',
  'Signature added to {count} more pages.': '签名已添加到另外 {count} 页。',
  // ---- page-view.js
  Fit: '适合宽度',
  'Keep this area': '保留这个区域',
  'Page {page} of {total}, marked for deletion': '第 {page} 页，共 {total} 页，已标记为删除',
  'Could not preview page {page}. {reason}': '无法预览第 {page} 页。{reason}',
  Text: '文字',
  Line: '直线',
  Arrow: '箭头',
  Rectangle: '矩形',
  Ellipse: '椭圆',
  Drawing: '绘图',
  Image: '图片',
  Signature: '签名',
  Highlight: '高亮',
  'Text: “{text}”': '文字：“{text}”',
  'Text: empty': '文字：空',
  'Current page ({page})': '当前页（第 {page} 页）',
  'Your edits show here as you make them.': '你的编辑会实时显示在这里。',
  'Type your text. Click outside it when you are done.': '输入文字。完成后点击文字框外面。',
  'Click the page where your text should start.': '点击页面上文字开始的位置。',
  'Drag the image to move it. Drag a corner to resize it.': '拖动图片可以移动它，拖动一角可以调整大小。',
  'Choose an image to add it to this page.': '选择一张图片，把它添加到这一页。',
  'Drag across the page to highlight an area.': '在页面上拖动，高亮一块区域。',
  'Drag the drawing to move it. Drag a handle to resize it.': '拖动图形可以移动它，拖动控制点可以调整大小。',
  'Drag on the page to draw.': '在页面上拖动来绘图。',
  'Drag the signature to move it. Drag a corner to resize it.': '拖动签名可以移动它，拖动一角可以调整大小。',
  'Click the page where your signature belongs.': '点击页面上要放签名的位置。',
  'Make your signature in the panel, then click the page to place it.':
    '先在面板里制作签名，再点击页面放置它。',
  'Drag across the page to choose the area to keep.': '在页面上拖动，选出要保留的区域。',
  'This PDF has no form fields to fill in.': '这个 PDF 没有可以填写的表单字段。',
  'Tap a field to fill it in. The page zooms to it; Fit shows it whole.':
    '点按一个字段来填写。页面会放大到这个字段，“适合宽度”会重新显示整页。',
  'Click a field to fill it in. Tab moves to the next one.': '点击一个字段来填写。按 Tab 跳到下一个字段。',
  'Choose pages with the checkboxes in the page strip.': '用页面列表里的复选框选择页面。',
  'Check this page: {problem}': '请检查这一页：{problem}',
  'Page {page} · {count} selected': '第 {page} 页 · 已选 {count} 页',
  // ---- pages.js
  'This PDF has form fields, so its pages can’t be removed, extracted or combined with other files while the fields stay fillable. Turn on “Flatten fields on download” in Fill form, then try again.':
    '这个 PDF 有表单字段。字段保持可填写时，不能删除或提取它的页面，也不能和其他文件合并。请在“填写表单”里打开“下载时拼合字段”，然后重试。',
  'This PDF has form fields. To split it, turn on “Flatten fields on download” in Fill form.':
    '这个 PDF 有表单字段。要拆分它，请在“填写表单”里打开“下载时拼合字段”。',
  'This page is already the first.': '这已经是第一页了。',
  'This page is already the last.': '这已经是最后一页了。',
  'Move page': '移动页面',
  'Page moved to position {position}.': '页面已移到第 {position} 位。',
  'Reverse pages': '倒序排列页面',
  'The pages are in reverse order.': '页面已倒序排列。',
  'Interleave pages': '交错排列页面',
  'Fronts and backs are interleaved: each front is followed by its back.':
    '正面和背面已交错排列：每个正面后面紧跟着它的背面。',
  'This PDF has form fields, so pages can’t be added while the fields stay fillable. Turn on “Flatten fields on download” in Fill form, then try again.':
    '这个 PDF 有表单字段。字段保持可填写时，不能添加页面。请在“填写表单”里打开“下载时拼合字段”，然后重试。',
  'Adding a blank page…': '正在添加空白页…',
  'Blank page': '空白页',
  'Add a blank page': '添加空白页',
  'Blank page added as page {page}.': '已添加空白页，作为第 {page} 页。',
  'Select one or more pages using the checkboxes in the page strip.':
    '请用页面列表里的复选框选择一页或多页。',
  'Rotate pages': '旋转页面',
  'Page rotated.': '页面已旋转。',
  '{count} pages rotated.': '已旋转 {count} 页。',
  'Keep at least one page. Deselect a page before removing the others.':
    '至少要保留一页。删除其他页面前，请先取消选择其中一页。',
  'Delete pages': '删除页面',
  'Page deleted. You can undo this.': '页面已删除。可以撤销。',
  '{count} pages deleted. You can undo this.': '已删除 {count} 页。可以撤销。',
  'View page {page}': '查看第 {page} 页',
  'Select page {page}': '选择第 {page} 页',
  Delete: '删除',
  'Hide tool settings': '隐藏工具设置',
  'Show tool settings': '显示工具设置',
  'of {total}': '/ {total}',
  // ---- panel-signature.js
  Black: '黑色',
  Blue: '蓝色',
  Width: '宽度',
  'Drag the signature to move it, or a corner to resize it. Arrow keys move it, and with Alt they resize it.':
    '拖动签名可以移动它，拖动一角可以调整大小。方向键可以移动它，按住 Alt 再按方向键可以调整大小。',
  'Put it here on every page': '在每一页的这个位置都放上它',
  'Your signature': '你的签名',
  'Add it to page {page}': '添加到第 {page} 页',
  'Add it to every page': '添加到每一页',
  'Or click the page where it belongs.': '也可以直接点击页面上要放的位置。',
  'Keep it on this device for next time': '保存在这台设备上，下次还能用',
  'Make a new signature': '制作新的签名',
  Draw: '手写',
  Type: '输入',
  Upload: '上传',
  'Make your signature': '制作你的签名',
  'Signature drawing area': '签名手写区域',
  'Sign with your finger or a pen.': '用手指或触控笔签名。',
  'Sign with your mouse, trackpad or pen.': '用鼠标、触控板或触控笔签名。',
  Clear: '清除',
  'Your name': '你的名字',
  'The handwriting style has Latin letters only: the rest of your name is drawn in a plain font.':
    '手写字体只有拉丁字母：名字里的其他文字会用普通字体显示。',
  'Choose a picture of it': '选择签名的图片',
  'Make the paper transparent': '把纸张背景变成透明',
  'A PNG or JPG of your signature on light paper.': '在浅色纸上签名，拍成 PNG 或 JPG 图片。',
  Ink: '墨水颜色',
  'Use this signature': '使用这个签名',
  'This browser could not keep your signature. It stays until you close this tab.':
    '这个浏览器无法保存你的签名。关闭这个标签页之前，签名会一直保留。',
  'Your signature is ready. Click the page where it belongs.': '签名已经准备好。点击页面上要放签名的位置。',
  'Your signature will be kept on this device.': '这台设备会保存你的签名。',
  'Your signature is no longer kept.': '不再保存你的签名。',
  'Edit signature': '编辑签名',
  // ---- signature.js
  'The signature font could not be loaded. Check your connection, then try again.':
    '签名字体没有加载成功。请检查网络连接，然后重试。',
  'There is no signature yet. Draw, type or upload one first.': '还没有签名。请先手写、输入或上传一个。',
  'The signature could not be made. Please try again.': '无法生成签名，请重试。',
  'Type your name to make a signature.': '请输入你的名字来生成签名。',
  'Choose a PNG or JPG picture of your signature.': '请选择签名的 PNG 或 JPG 图片。',
  'Choose a picture smaller than 15 MB.': '请选择小于 15 MB 的图片。',
  'This picture could not be read. Choose a PNG or JPG file.': '无法读取这张图片。请选择 PNG 或 JPG 文件。',
  // ---- panel-convert.js
  'Same as the picture': '和图片一样',
  Margin: '边距',
  None: '无',
  Small: '小',
  Large: '大',
  '<strong>{count} of {total} pages</strong> are pictures. A4 and Letter pages turn to suit each picture.':
    '<strong>{total} 页中有 {count} 页</strong>是图片。A4 和 Letter 页面会按每张图片的方向自动转向。',
  'No pages here are pictures yet. Add JPG or PNG pictures to make pages from them.':
    '这里还没有由图片生成的页面。添加 JPG 或 PNG 图片，就能把它们变成页面。',
  'Add pictures or PDFs': '添加图片或 PDF',
  'Drag pages in the page strip to put them in order. Download PDF saves them as one PDF.':
    '在页面列表里拖动页面来排好顺序。“下载 PDF”会把它们保存成一个 PDF。',
  'Picture format': '图片格式',
  Quality: '质量',
  'Screen (72 dpi)': '屏幕（72 dpi）',
  'Standard (150 dpi)': '标准（150 dpi）',
  'High, for print (300 dpi)': '高，用于打印（300 dpi）',
  Pages: '页面',
  'Selected pages ({count})': '选中的页面（{count}）',
  'Save as pictures': '保存为图片',
  'Each page is saved as it looks with your edits. Several pages download together as a ZIP.':
    '每一页都按加上编辑后的样子保存。多页会打包成一个 ZIP 一起下载。',
  'Pictures can’t have a password.': '图片不能设置密码。',
  'Select pages in the page strip first.': '请先在页面列表里选择页面。',
  'Saving pages as pictures…': '正在把页面保存为图片…',
  '-pictures': '-图片',
  'Your picture has been downloaded.': '图片已下载。',
  '{count} pictures have been downloaded in a ZIP.': '已下载 ZIP，里面有 {count} 张图片。',
  // ---- convert.js
  'This picture could not be made. Please try again.': '无法生成这张图片，请重试。',
  'Choose JPG or PNG pictures, or PDF files.': '请选择 JPG 或 PNG 图片，或者 PDF 文件。',
  '“{name}” is larger than 50 MB. Choose a smaller picture.': '“{name}”大于 50 MB。请选择小一点的图片。',
  '“{name}” could not be read. Choose JPG or PNG pictures.': '无法读取“{name}”。请选择 JPG 或 PNG 图片。',
  '“{name}” has more than 40 million pixels. Choose a smaller picture.':
    '“{name}”超过了 4000 万像素。请选择小一点的图片。',
  'Stopped. No pictures were saved.': '已停止，没有保存图片。',
  '-page-{number}': '-第{number}页',
  // ---- panel-pages.js
  'Rotate {count} pages': '旋转 {count} 页',
  'Remove {count} pages': '删除 {count} 页',
  'Download {count} pages': '下载 {count} 页',
  'Rotate 90°': '旋转 90°',
  Remove: '删除',
  'Download selected pages': '下载选中的页面',
  'Rotate page {page}': '旋转第 {page} 页',
  'Remove page {page}': '删除第 {page} 页',
  'Download page {page}': '下载第 {page} 页',
  'Select all': '全选',
  'Clear selection': '清除选择',
  '<strong>{count} of {total} pages selected.</strong> Select pages with the checkboxes beneath each thumbnail.':
    '<strong>已选 {count} 页，共 {total} 页。</strong>用每个缩略图下面的复选框选择页面。',
  'Select page numbers': '按页码选择',
  'Select range': '选择范围',
  'SELECTED PAGES': '选中的页面',
  'CURRENT PAGE · {page}': '当前页 · 第 {page} 页',
  'Move earlier': '往前移',
  'Move later': '往后移',
  'Add a blank page after it': '在它后面添加空白页',
  'PAGE ORDER': '页面顺序',
  Reverse: '倒序',
  Interleave: '交错',
  'Backs scanned from the last sheet': '背面是从最后一张开始扫描的',
  'For pages printed on both sides and scanned one side at a time: the first half are the fronts, the rest the backs. Interleave puts each back after its front.':
    '适用于双面打印、每次只扫描一面的文件：前一半是正面，后一半是背面。“交错”会把每个背面放到它的正面后面。',
  '<strong>{count} of {total} pages selected for deletion.</strong><br>{remaining} pages will remain.':
    '<strong>共 {total} 页，已选 {count} 页要删除。</strong><br>会保留 {remaining} 页。',
  'Page numbers to delete': '要删除的页码',
  'e.g. 2, 4-6': '比如 2, 4-6',
  'Numbers follow the current page order. Checked thumbnails are the pages to delete.':
    '页码按当前的页面顺序计算。勾选的缩略图就是要删除的页面。',
  'Delete {count} selected page': '删除选中的 {count} 页',
  'Delete {count} selected pages': '删除选中的 {count} 页',
  'Keep at least one page. Deselect a page to continue.': '至少要保留一页。请取消选择其中一页再继续。',
  'Deleted pages leave at once. Undo brings them back.': '删除的页面会立即移除，撤销可以恢复它们。',
  'Add another PDF': '再添加一个 PDF',
  'New pages are added at the end. Use <strong>Organize pages</strong> to change their order, then download the combined PDF.':
    '新页面会添加到末尾。用<strong>整理页面</strong>调整顺序，然后下载合并后的 PDF。',
  'Add a bookmark for each file': '为每个文件添加书签',
  'Named after the file, it leads to the file’s first page; the file’s own bookmarks go under it.':
    '书签用文件名命名，指向这个文件的第一页；文件自带的书签放在它下面。',
  'Organize pages': '整理页面',
  'File bookmarks': '文件书签',
  'Each file will have a bookmark.': '每个文件都会有一个书签。',
  'Files won’t have bookmarks of their own.': '不会为每个文件单独添加书签。',
  // ---- panel-crop.js
  'Margins are percentages of each page’s <strong>current visible area</strong>. The outlined area is kept.':
    '边距是每一页<strong>当前可见区域</strong>的百分比。框出的区域会被保留。',
  'Top (%)': '上（%）',
  'Bottom (%)': '下（%）',
  'Left (%)': '左（%）',
  'Right (%)': '右（%）',
  'Apply to': '应用到',
  'Current page': '当前页',
  'Selected pages': '选中的页面',
  'Crop to the outlined area': '裁剪到框出的区域',
  'Clear margins': '清除边距',
  'Restore original crop for scope': '为所选范围恢复原始裁剪',
  'Cropping hides content outside the boundary; it does not securely remove it. Text and graphics keep their original quality.':
    '裁剪只是隐藏边界以外的内容，并不会安全地删除它。文字和图形保持原来的质量。',
  'A resized page stays on its sheet: what you keep of it is fitted to the sheet again.':
    '调整过尺寸的页面仍在它的纸上：保留的部分会重新适配到纸上。',
  'Reuse last applied crop in batch': '在批量处理里使用上次的裁剪',
  'Keep more than 1% of the width and height. Reduce the crop margins.':
    '宽度和高度都要保留 1% 以上。请把裁剪边距调小。',
  'Keep {width}% of width × {height}% of height.': '保留宽度的 {width}% × 高度的 {height}%。',
  'Select at least one page in the page strip, or choose Every page.':
    '请在页面列表里至少选择一页，或者选择“每一页”。',
  'Set a margin or drag an area to keep before cropping.': '裁剪前，请先设置边距，或者拖出要保留的区域。',
  'On page {page}, the outlined area is on the blank part of its sheet. Outline part of the page itself.':
    '在第 {page} 页，框出的区域落在纸张的空白部分。请框选页面本身的一部分。',
  'Page cropped.': '页面已裁剪。',
  '{count} pages cropped.': '已裁剪 {count} 页。',
  'The outlined area keeps the whole page: only blank sheet lies outside it. Outline less of the page.':
    '框出的区域包含了整页，框外只有空白的纸。请少框选一些页面内容。',
  // ---- panel-margins.js
  'Top (mm)': '上（毫米）',
  'Bottom (mm)': '下（毫米）',
  'Left (mm)': '左（毫米）',
  'Right (mm)': '右（毫米）',
  'A wide right margin for notes': '写笔记用的宽右边距',
  'Add margins': '添加边距',
  'Remove added margins': '去掉添加的边距',
  'The margins are blank space around each page. A page you resized to A4 or Letter stays on that paper, so it is made smaller to leave room for them; on other pages nothing moves or shrinks.':
    '边距是每一页四周的空白。调整成 A4 或 Letter 的页面仍在那张纸上，所以会缩小一点，为边距留出空间；其他页面的内容不会移动或缩小。',
  'The margins are blank space around each page: nothing on it moves or shrinks.':
    '边距是每一页四周的空白：页面上的内容不会移动或缩小。',
  'Page numbers, headers and footers go to the new edges.': '页码、页眉和页脚会移到新的边缘。',
  'Enter the margins to add, in millimetres.': '请输入要添加的边距，单位是毫米。',
  'A page can’t be larger than 5 metres (200 inches).': '页面不能大于 5 米（200 英寸）。',
  'These margins are too large for page {page}: more than 20 times its size. Make them smaller.':
    '这些边距对第 {page} 页来说太大了：超过了页面尺寸的 20 倍。请把边距调小。',
  'Margins added to the page.': '已给页面添加边距。',
  'Margins added to {count} pages.': '已给 {count} 页添加边距。',
  'These pages have no added margins.': '这些页面没有添加过边距。',
  'Remove margins': '去掉边距',
  'The added margins are removed.': '已去掉添加的边距。',
  'Added margins removed from {count} pages.': '已去掉 {count} 页上添加的边距。',
  // ---- panel-resize.js
  'The page goes on {paper} paper.': '这一页会放到 {paper} 纸上。',
  'Both pages go on {paper} paper.': '两页都会放到 {paper} 纸上。',
  'All {total} pages go on {paper} paper.': '全部 {total} 页都会放到 {paper} 纸上。',
  'The page is on {paper} paper already.': '这一页已经在 {paper} 纸上了。',
  'Both pages are on {paper} paper already.': '两页都已经在 {paper} 纸上了。',
  'All {total} pages are on {paper} paper already.': '全部 {total} 页都已经在 {paper} 纸上了。',
  '{count} of {total} pages goes on {paper} paper; {same} is that size already.':
    '共 {total} 页，其中 {count} 页会放到 {paper} 纸上；{same} 页已经是这个尺寸。',
  '{count} of {total} pages goes on {paper} paper; {same} are that size already.':
    '共 {total} 页，其中 {count} 页会放到 {paper} 纸上；{same} 页已经是这个尺寸。',
  '{count} of {total} pages go on {paper} paper; {same} is that size already.':
    '共 {total} 页，其中 {count} 页会放到 {paper} 纸上；{same} 页已经是这个尺寸。',
  '{count} of {total} pages go on {paper} paper; {same} are that size already.':
    '共 {total} 页，其中 {count} 页会放到 {paper} 纸上；{same} 页已经是这个尺寸。',
  'Resize pages': '调整页面尺寸',
  'The page is already on {paper} paper.': '这一页已经在 {paper} 纸上了。',
  'These pages are already on {paper} paper.': '这些页面已经在 {paper} 纸上了。',
  'The page is on {paper} paper now.': '页面已放到 {paper} 纸上。',
  '{count} page is on {paper} paper now.': '{count} 页已放到 {paper} 纸上。',
  '{count} pages are on {paper} paper now.': '{count} 页已放到 {paper} 纸上。',
  '{count} was that size already.': '{count} 页原本就是这个尺寸。',
  '{count} were that size already.': '{count} 页原本就是这个尺寸。',
  'This page has its own size already.': '这一页已经是它原来的尺寸。',
  'These pages have their own size already.': '这些页面已经是它们原来的尺寸。',
  'Restore page size': '恢复页面尺寸',
  'The page has its own size again.': '页面已恢复原来的尺寸。',
  '{count} pages have their own size again.': '{count} 页已恢复原来的尺寸。',
  Paper: '纸张',
  'Restore original size': '恢复原来的尺寸',
  'Each page is scaled to fit its sheet and centred, in its own orientation. Nothing is cut off, and text stays text. Links, comments and form fields move with the page; page numbers, headers and footers go to the edges of the sheet. A resized page stays on its sheet when you crop it or add margins. Pages you add later keep their own size.':
    '每一页都按比例缩放到适合纸张的大小，居中放置，保持它自己的方向。不会裁掉任何内容，文字仍然是文字。链接、批注和表单字段跟着页面移动；页码、页眉和页脚放到纸张的边缘。调整过尺寸的页面在裁剪或添加边距时仍留在它的纸上。之后添加的页面保持自己的尺寸。',
  // ---- panel-split.js
  'Split by': '拆分方式',
  'Every N pages': '每 N 页',
  'Custom page groups': '自定义分组',
  'Page groups': '页面分组',
  'Separate PDFs with a semicolon. Use commas for pages within one PDF.':
    '用分号分开不同的 PDF，同一个 PDF 里的页面用逗号分开。',
  'Create split PDFs': '生成拆分后的 PDF',
  '{count} PDFs ready': '{count} 个 PDF 已准备好',
  'Your source is unchanged.': '原文件没有改动。',
  'Download all as ZIP': '全部打包成 ZIP 下载',
  '{count} output PDF · {used} of {total} pages included.':
    '输出 {count} 个 PDF · 包含 {total} 页中的 {used} 页。',
  '{count} output PDFs · {used} of {total} pages included.':
    '输出 {count} 个 PDF · 包含 {total} 页中的 {used} 页。',
  '{count} page is outside these groups.': '有 {count} 页不在这些分组里。',
  '{count} pages are outside these groups.': '有 {count} 页不在这些分组里。',
  'Creating split PDFs…': '正在生成拆分后的 PDF…',
  'Cancel splitting': '取消拆分',
  '-part-{number}': '-第{number}部分',
  '{count} PDF is ready to download.': '{count} 个 PDF 可以下载了。',
  '{count} PDFs are ready to download.': '{count} 个 PDF 可以下载了。',
  'It needs your password to open.': '打开它需要你的密码。',
  'Each needs your password to open.': '每个文件打开时都需要你的密码。',
  'Splitting cancelled. Your document is unchanged.': '已取消拆分，你的文档没有改动。',
  // ---- panel-sheets.js
  'Pages per sheet': '每张纸的页数',
  'Margin (mm)': '边距（毫米）',
  'Gap (mm)': '间距（毫米）',
  'A thin border around each page': '每页四周加一圈细边框',
  'Download the sheets': '下载多页合一 PDF',
  'Each page goes on its sheet as it looks with your edits, as large as fits, and text and drawings stay sharp. Links and comments don’t carry over; form fields are flattened, so their answers do.':
    '每一页都按加上编辑后的样子、以放得下的最大尺寸排到纸上，文字和图形保持清晰。链接和批注不会带过去；表单字段会被拼合，所以填写的内容会保留。',
  landscape: '横放',
  portrait: '竖放',
  '{count} page on {sheets} {orientation} {paper} sheet: {columns} across, {rows} down.':
    '{count} 页排在 {sheets} 张{orientation}的 {paper} 纸上：每张 {columns} 列 {rows} 行。',
  '{count} pages on {sheets} {orientation} {paper} sheet: {columns} across, {rows} down.':
    '{count} 页排在 {sheets} 张{orientation}的 {paper} 纸上：每张 {columns} 列 {rows} 行。',
  '{count} pages on {sheets} {orientation} {paper} sheets: {columns} across, {rows} down.':
    '{count} 页排在 {sheets} 张{orientation}的 {paper} 纸上：每张 {columns} 列 {rows} 行。',
  'Putting the pages on sheets…': '正在把页面排到纸上…',
  '-{count}-per-sheet': '-每张{count}页',
  'Your sheet has been downloaded.': '多页合一 PDF 已下载。',
  'Your {count} sheets have been downloaded.': '多页合一 PDF 已下载，共 {count} 张纸。',
  // ---- panel-protect.js
  Password: '密码',
  'Show password': '显示密码',
  'Download protected PDF': '下载加密的 PDF',
  'Encrypted with AES-256. Keep the password somewhere safe: QFT PDF doesn’t store it and can’t recover it.':
    '使用 AES-256 加密。请把密码存放在安全的地方：QFT PDF 不会保存密码，也无法找回。',
  'Your download will need this password to open.': '下载的文件需要这个密码才能打开。',
  'Type a password to protect your download.': '输入一个密码来保护下载的文件。',
  'Your download will need a password to open.': '下载的文件需要密码才能打开。',
  'Remove the password': '去掉密码',
  'Your original file isn’t changed, and Undo brings the password back.':
    '原文件不会改变，撤销可以恢复密码。',
  'This PDF doesn’t have a password, so your download won’t need one either.':
    '这个 PDF 没有密码，所以下载的文件也不需要密码。',
  'Add a password instead': '改为添加密码',
  'Unlocked. Your download will open without a password, and without limits on printing, copying or changes.':
    '已解锁。下载的文件打开时不需要密码，打印、复制和修改也不受限制。',
  'Unlocked. Your download will open without a password.': '已解锁。下载的文件打开时不需要密码。',
  'Download unlocked PDF': '下载解锁后的 PDF',
  'Your original file isn’t changed.': '原文件不会改变。',
  // ---- form-ui.js
  'Fill in a field': '填写字段',
  '<strong>{filled} of {count} field filled in.</strong>':
    '<strong>已填写 {filled} 个字段，共 {count} 个。</strong>',
  '<strong>{filled} of {count} fields filled in.</strong>':
    '<strong>已填写 {filled} 个字段，共 {count} 个。</strong>',
  '{count} required field is still empty.': '还有 {count} 个必填字段是空的。',
  '{count} required fields are still empty.': '还有 {count} 个必填字段是空的。',
  'This PDF’s form has no fields to type in.': '这个 PDF 的表单里没有可以输入的字段。',
  'To write on a page, use Add text.': '要在页面上写字，请用“添加文字”。',
  'Add text': '添加文字',
  'Signature fields stay empty here. To sign, use Sign PDF.':
    '签名字段在这里保持空白。要签名，请用“签署 PDF”。',
  'Calculations and checks built into this form don’t run here.': '表单里内置的计算和检查不会在这里运行。',
  'This PDF also has an XFA version of its form, which some apps show instead. Once you fill in fields here, the download has these fields only.':
    '这个 PDF 还有一个 XFA 版本的表单，有些软件会改为显示它。在这里填写字段后，下载的文件只保留这些字段。',
  'Go to the next empty field': '跳到下一个空字段',
  'Flatten fields on download': '下载时拼合字段',
  'Flattened fields become part of the page: the PDF looks the same in every app, but its fields can no longer be changed. Flattening also lets you combine these pages with other PDFs.':
    '拼合后的字段会成为页面的一部分：PDF 在任何软件里看起来都一样，但字段不能再修改。拼合之后，这些页面也能和其他 PDF 合并。',
  'Download filled PDF': '下载填好的 PDF',
  'Clear all fields': '清空所有字段',
  'Clear the form': '清空表单',
  'Fields cleared. Undo brings their values back.': '字段已清空。撤销可以恢复填写的内容。',
  'Flatten fields': '拼合字段',
  'Fields will be flattened on download.': '下载时会拼合字段。',
  'Fields will stay fillable.': '字段会保持可填写。',
  // ---- panel-text.js
  'Edit image': '编辑图片',
  'Edit highlight': '编辑高亮',
  'Drag the text to move it, or its right edge to set where lines wrap. With the text selected, arrow keys move it, and with Alt they set where lines wrap.':
    '拖动文字可以移动它，拖动右边缘可以设置换行的位置。选中文字后，方向键可以移动它，按住 Alt 再按方向键可以设置换行的位置。',
  'Add text to page {page}': '在第 {page} 页添加文字',
  'Drag the image to move it, or a corner to resize it. Arrow keys move it, and with Alt they resize it.':
    '拖动图片可以移动它，拖动一角可以调整大小。方向键可以移动它，按住 Alt 再按方向键可以调整大小。',
  'PNG or JPG · up to 15 MB': 'PNG 或 JPG · 最大 15 MB',
  'Choose another image': '换一张图片',
  'Choose an image': '选择图片',
  'Drag the highlight to move it, or a handle to resize it. Arrow keys move it, and with Alt they resize it. Width and height are shares of the page.':
    '拖动高亮可以移动它，拖动控制点可以调整大小。方向键可以移动它，按住 Alt 再按方向键可以调整大小。宽度和高度是相对页面的比例。',
  'Add a highlight to page {page}': '在第 {page} 页添加高亮',
  // ---- panel-draw.js
  Pen: '画笔',
  'Delete line': '删除直线',
  'Delete arrow': '删除箭头',
  'Delete rectangle': '删除矩形',
  'Delete ellipse': '删除椭圆',
  'Add a line to page {page}': '在第 {page} 页添加直线',
  'Add an arrow to page {page}': '在第 {page} 页添加箭头',
  'Add a rectangle to page {page}': '在第 {page} 页添加矩形',
  'Add an ellipse to page {page}': '在第 {page} 页添加椭圆',
  'Draw with': '绘图工具',
  'Line width': '线宽',
  ' pt': ' 磅',
  'Drag it to move it, or a handle to resize it. Arrow keys move it, and with Alt they resize it. Width and height are shares of the page.':
    '拖动它可以移动，拖动控制点可以调整大小。方向键可以移动它，按住 Alt 再按方向键可以调整大小。宽度和高度是相对页面的比例。',
  'Draw on the page with a mouse, a pen or a finger. On a touch screen, two fingers scroll.':
    '用鼠标、触控笔或手指在页面上绘图。在触摸屏上，用两根手指滚动。',
  'Edit drawing': '编辑绘图',
  // ---- panel-properties.js
  'made with {app}': '由 {app} 制作',
  'saved by {app}': '由 {app} 保存',
  'created on {date}': '创建于 {date}',
  Title: '标题',
  Author: '作者',
  Subject: '主题',
  Keywords: '关键词',
  'Separated by commas': '用逗号分隔',
  Language: '语言',
  'For example en-GB, de or zh-CN': '比如 zh-CN、en-GB 或 de',
  'Also in the file: {details}.': '文件里还有：{details}。',
  ', ': '，',
  'Your download keeps only the details above.': '下载的文件只保留上面的信息。',
  'Remove all': '全部删除',
  'Removes the title, author, subject and keywords, and what apps add without asking: which app made the PDF, when, and a second copy of these details. The language stays, because screen readers need it.':
    '删除标题、作者、主题和关键词，以及软件自动加上的信息：用哪个软件、在什么时候制作了这个 PDF，以及这些信息的第二份副本。语言会保留，因为读屏软件需要它。',
  'Remove details': '删除文档信息',
  'Details removed. Your download won’t include them.': '已删除文档信息，下载的文件不会包含它们。',
};
