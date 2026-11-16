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
    keywords: '文字 文本 加字 写字 打字 输入 备注 标签 说明 图片 照片 插入图片 标志 高亮',
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
    keywords: '签名 签字 签署 手写签名 电子签名 签名图片 盖章 填写',
  },
  form: {
    name: '填写表单',
    tab: '表单',
    card: ['在表单字段里输入，勾选复选框。', '保留可填写，或拼合到页面上。'],
    keywords: '表单 填写 填表 字段 复选框 申请表 拼合',
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
    keywords: '水印 加水印 添加水印 文字水印 草稿 机密 标记',
  },
  footer: {
    name: '页眉和页脚',
    tab: '页眉页脚',
    card: ['你的名字、项目和其他信息，', '放在每一页的同一个位置。'],
    keywords: '页眉 页脚 页眉页脚 标题 日期 姓名 文件名',
  },
  numbers: {
    name: '页码',
    tab: '页码',
    card: ['加上页码，条理更清楚。', '从头到尾，按你的格式编号。'],
    keywords: '页码 加页码 添加页码 编号 编页码 页数',
  },
  pages: {
    name: '整理页面',
    tab: '整理',
    card: ['调整顺序、旋转、删除或提取，', '只留下你需要的页面。'],
    keywords: '整理 页面 排序 顺序 调整顺序 重新排列 旋转 提取 倒序 交错 插入 空白页 复制 移动',
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
    keywords: '页边距 边距 加边距 留白 空白 装订 打孔 笔记 页面',
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
    keywords: '拆分 分割 分开 切分 拆开 剪切 章节 范围',
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
    keywords: '图片 照片 图像 扫描件 转换 图片转 jpeg png',
  },
  pdftojpg: {
    name: 'PDF 转 JPG',
    tab: 'PDF 转 JPG',
    card: ['每一页都存成图片，', 'JPG 或 PNG，打包成 ZIP。'],
    keywords: '图片 图像 导出 转换 转图片 截图 jpeg png',
  },
  protect: {
    name: '加密 PDF',
    tab: '加密',
    card: ['只给该看的人看。', '为 PDF 设置打开密码。'],
    keywords: '加密 密码 设置密码 加密码 保护 安全 上锁',
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

/** Long passages of HTML, by name (passage() in i18n.js). */
export const PASSAGES = {
  privacy:
    '<div class="eyebrow">你的文件，你的空间</div><h2 id="dialog-title">隐私，从设计开始。</h2><p>QFT PDF 在这个浏览器里处理你的 PDF。编辑器不会把文档内容、文件名或你的编辑发送到任何处理服务器。</p><h3>哪些东西留在你的设备上？</h3><p>你的 PDF 文件、添加的图片和文字，以及编辑后的文档。PDF 文件和生成的结果保存在这个标签页的内存里，关闭或刷新标签页就会清除。保存的预设包含你选择的文字和设置，会一直留在这个浏览器里，直到你删除它们或清除网站数据。水印、页眉和页脚、页码的设置也一样：勾选“在这台设备上记住这些设置”时保存，取消勾选就会忘记。</p><p>密码只在这个标签页里使用：用来打开有密码保护的 PDF，以及保护你下载的文件。密码从不保存，预设里也不会有。只有你选择“保存在这台设备上”，你的签名才会留在这个浏览器里；取消勾选就会删除它。你选择的语言也记在这个浏览器里。</p><h3>哪些需要联网？</h3><p>你的浏览器会加载这个网站、它的 PDF 程序库和字体文件。托管服务商可能会收到普通的网站请求。QFT PDF 不包含广告或统计脚本。</p><p>用“下载 PDF”保存完成的副本。你的原文件不会被覆盖。</p>',
  help: '<div class="eyebrow">使用指南</div><h2 id="dialog-title">请随意使用。</h2><p>打开一个 PDF，选择一个工具，直接在页面上编辑。每个修改都立即显示，和它在你的 PDF 里的样子完全一样。“下载 PDF”会保存一份新的副本。</p><h3>能编辑什么？</h3><p>添加文字、PNG/JPG 图片、高亮、绘图、水印、页眉、页脚和页码。填写 PDF 表单。合并 PDF，或者调整页面顺序、倒序、旋转、删除、裁剪、提取和拆分页面，把双面扫描的页面交错排列，添加空白页或页边距。把页面调整到 A4 或 Letter 纸上。每张纸放 2 页或 4 页，做成讲义。批量工具把存好的预设分别应用到多个 PDF 上。</p><h3>文字、图片和高亮</h3><p>用“添加文字”时，点击页面然后输入。拖动一个项目可以移动它，拖动控制点可以调整大小。选中一个项目可以在面板里修改它，或者按 Delete 删除。选中项目后，方向键移动它，Alt 加方向键调整大小（按住 Shift 步子更大），Enter 编辑文字。</p><h3>撤销和重做</h3><p>撤销（Ctrl+Z 或 ⌘Z）撤回最近的编辑；重做（Ctrl+Shift+Z 或 ⌘⇧Z）把它们恢复。每个按钮都会写明它要撤回或恢复哪一步。重置会回到你最初打开的文档。关闭或刷新这个标签页后，工作区不会保存。</p><h3>删除页面和裁剪 PDF</h3><p>“删除页面”可以选择缩略图，或者输入页面范围，比如 2, 4-6。至少要留下一页。“裁剪 PDF”可以拖出要保留的区域，或者输入边距百分比，然后应用到当前页、选中的页面或每一页。每次裁剪都在当前的可见区域上再裁。“恢复原始裁剪”会为你选的范围找回原来的页面边界。裁剪只是隐藏内容，不是安全的涂黑。</p><p>“添加文字”是加上新的内容，不会改写原有的段落。高亮是批注，不是安全的涂黑。修改可能让已有的数字签名失效。QFT PDF 不能压缩 PDF，不能识别扫描件里的文字（OCR），也不能和 Word 互相转换。</p><h3>签名</h3><p>用“签署 PDF”时，手写你的签名，用手写字体输入你的名字，或者上传签名的图片。点击页面放置它，或者加到每一页上；拖动它可以移动，拖动一角可以调整大小。它是你签名的图片，不是基于证书的数字签名。</p><h3>表单</h3><p>用“填写表单”时，点击字段输入文字，或者勾选复选框；Tab 跳到下一个字段。在手机上，页面会放大到你点的字段，“适合”会重新显示整页。下载的文件保留可以填写的字段；打开“下载时拼合字段”，你填的内容就会成为页面的一部分。表单里内置的计算不会运行，只用 Adobe XFA 格式做的表单不能填写。</p><h3>绘图</h3><p>用“绘图”时，在页面上拖动用画笔画，或者选择直线、箭头、矩形或椭圆。每一笔是一个撤销步骤。选中一个图形可以移动它、调整大小，或者修改颜色和线宽。在触摸屏上，一根手指画画，两根手指滚动。</p><h3>文档属性</h3><p>“文档属性”显示保存在你的 PDF 里的标题、作者、主题、关键词和语言。修改它们，或者在分享文件前选择“全部删除”：它还会删掉制作 PDF 的软件和时间。语言会保留，因为读屏软件需要它。</p><h3>密码</h3><p>需要密码的 PDF 会在你打开时要求输入。下载的文件保留这个密码：可以在“加密 PDF”里修改，或者在“解锁 PDF”里去掉。只限制打印、复制或修改的 PDF 打开时不会询问，下载的文件也没有这些限制。密码只留在你的设备上，不会保存。</p><h3>支持的文件</h3><p>不设固定文件大小或页数上限的 PDF，包括有密码保护的 PDF（用证书保护的除外）。JPG 和 PNG 图片会作为页面打开（JPG 转 PDF）；“PDF 转 JPG”把页面存成图片。能处理多大的文件取决于你的设备和浏览器可用的内存。特别大的文件可能很慢，或者打不开，尤其是在手机上。要合并、删除、提取或拆分有表单字段的 PDF 的页面，先在“填写表单”里打开“下载时拼合字段”。</p><h3>字体</h3><p>支持拉丁字母和中文，还有日文假名和韩文。日文汉字和繁体中文用的是字体的简体中文字形，所以有些字看起来略有不同。只嵌入你用到的字，所以中文只会让 PDF 多几 KB。中文字体只在你第一次输入中文时下载一次：常用字（GB2312 的全部字符）约 1.4 MB，只有遇到更少见的字才下载 16 MB 的完整字体。其他文字取决于内置字体覆盖的范围。</p><h3>拆分 PDF 和批量预设</h3><p>按单页、每 N 页，或者 1-3; 4-6 这样的自定义分组拆分。分号表示开始一个新的输出 PDF。可以分别下载，或者下载一个 ZIP。批量工具可以组合水印、页眉和页脚、页码和裁剪。每个文件的编号都重新开始。预设保存在这个浏览器里；PDF 不会保存。</p>',
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
    '在页面栏里选择页面。拖动调整顺序，或者用下面的按钮。',
  'Add PDF files, then arrange their pages in the strip.': '添加 PDF 文件，然后在页面栏里排列它们的页面。',
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
    '每张纸放 2 页或 4 页，做讲义或节省纸张。拼好的纸张作为新的 PDF 下载；你的文档保持原样。',
  'Choose a password. Anyone who opens the PDF you download will need it.':
    '设一个密码。打开你下载的 PDF 的人都需要它。',
  'Download a copy of your PDF that opens without a password.': '下载一份不用密码就能打开的 PDF 副本。',
  'Draw, type or upload your signature, then click the page where it belongs. Drag it to move it, or a corner to resize it.':
    '手写、输入或上传你的签名，然后点击页面上要签名的地方。拖动它可以移动，拖动一角可以调整大小。',
  'Your JPG and PNG pictures are pages. Choose their paper size, put them in order in the page strip, then download one PDF.':
    '你的 JPG 和 PNG 图片就是页面。选择纸张尺寸，在页面栏里排好顺序，然后下载一个 PDF。',
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
  'Combined document.pdf': '合并的文档.pdf',
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
  'These pages show their original boundaries already.': '这些页面已经是原来的边界了。',
  'Restore crop': '恢复裁剪',
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
    'QFT PDF 需要新式浏览器。请使用新版的 Chrome、Edge、Firefox 或 Safari。',
  // ---- views.js
  '{tool} — QFT PDF': '{tool} · QFT PDF',
};
