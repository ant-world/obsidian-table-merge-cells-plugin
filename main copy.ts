import { Plugin, Editor, Menu, MarkdownView, Notice } from 'obsidian';
// 编辑模式下的合并单元格
export default class TableMergePlugin extends Plugin {
  async onload() {
    console.log('Table Merge Plugin loaded');

    // 注册右键菜单事件
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				console.log("????")
        // 检查是否为 Markdown 视图且有选中内容
        if (view.getViewType() !== 'markdown') return;
        const selection = editor.getSelection();
        if (!selection) return;

        // 检查选中内容是否在表格中（所在行包含 | 分隔符）
        const cursorLine = editor.getCursor().line;
        const lineContent = editor.getLine(cursorLine);
        if (!lineContent.includes('|')) return;

				console.log("?????????",menu)

        // 添加“合并单元格”菜单项
        menu.addItem((item) => {
          item
            .setTitle('合并单元格')
            .setIcon('table')
            .onClick(() => {
              this.mergeSelectedCells(editor);
            });
        });
      })
    );
  }

  // 合并选中单元格的核心逻辑（修正版）
  private mergeSelectedCells(editor: Editor) {
    // 1. 获取选区范围（替换 getSelectionRange()）
    const from = editor.getCursor('from'); // 选区起始位置
    const to = editor.getCursor('to');   // 选区结束位置

    // 2. 判断合并方向（横向/纵向）
    const isHorizontal = from.line === to.line; // 同一行 = 横向合并
    const isVertical = from.line !== to.line && this.isSameColumn(editor, from, to); // 同一列 = 纵向合并

    if (!isHorizontal && !isVertical) {
      new Notice('仅支持横向或纵向连续单元格合并');
      return;
    }

    // 3. 横向合并（跨列）
    if (isHorizontal) {
      this.handleHorizontalMerge(editor, from, to);
    }

    // 4. 纵向合并（跨行）
    if (isVertical) {
      this.handleVerticalMerge(editor, from, to);
    }
  }

  // 辅助函数：判断是否为同一列（通过 | 分隔符位置计算）
  private isSameColumn(editor: Editor, from: CodeMirror.Position, to: CodeMirror.Position): boolean {
    // 获取起始行和结束行的内容
    const fromLine = editor.getLine(from.line);
    const toLine = editor.getLine(to.line);

    // 计算光标在当前行的列索引（通过 | 分割）
    const getColumnIndex = (line: string, ch: number) => {
      const segments = line.split('|');
      let totalLength = 0;
      for (let i = 0; i < segments.length; i++) {
        totalLength += segments[i].length + 1; // +1 是 | 本身的长度
        if (ch < totalLength) {
          return i; // 返回列索引
        }
      }
      return segments.length - 1;
    };

    const fromColumn = getColumnIndex(fromLine, from.ch);
    const toColumn = getColumnIndex(toLine, to.ch);
    return fromColumn === toColumn;
  }

  // 横向合并实现（跨列）
  private handleHorizontalMerge(editor: Editor, from: CodeMirror.Position, to: CodeMirror.Position) {
    const lineNumber = from.line;
    const lineContent = editor.getLine(lineNumber);
    const lineSegments = lineContent.split('|'); // 按 | 分割列

    // 计算选中的起始列和结束列
    const startCol = this.getColumnIndex(lineContent, from.ch);
    const endCol = this.getColumnIndex(lineContent, to.ch);

    if (endCol - startCol < 1) {
      new Notice('请至少选中2个连续单元格');
      return;
    }

    // 合并逻辑：将 [startCol, endCol] 合并为一个单元格（保留第一个内容，其余替换为 ||）
    const mergedSegments = [...lineSegments];
    const mergedContent = mergedSegments[startCol].trim(); // 保留起始列内容
    // 清除合并范围内的其他列内容
    for (let i = startCol + 1; i <= endCol; i++) {
      mergedSegments[i] = '';
    }
    mergedSegments[startCol] = mergedContent;

    // 重新拼接行内容（用 | 连接）
    const newLineContent = mergedSegments.join('|');
    editor.setLine(lineNumber, newLineContent);

    // 选中合并后的单元格
    editor.setSelection(
      { line: lineNumber, ch: newLineContent.indexOf(mergedContent) },
      { line: lineNumber, ch: newLineContent.indexOf(mergedContent) + mergedContent.length }
    );

    new Notice(`已合并 ${endCol - startCol + 1} 列`);
  }

  // 纵向合并实现（跨行）
  private handleVerticalMerge(editor: Editor, from: CodeMirror.Position, to: CodeMirror.Position) {
    const columnIndex = this.getColumnIndex(editor.getLine(from.line), from.ch);

    // 从下往上标记合并（在下方单元格添加 ^^ 语法，兼容 Table Extended 插件）
    for (let line = from.line + 1; line <= to.line; line++) {
      const lineContent = editor.getLine(line);
      const segments = lineContent.split('|');

      // 在目标列添加 ^^ 标记
      if (segments[columnIndex]) {
        segments[columnIndex] = `^^${segments[columnIndex]}`;
      } else {
        segments[columnIndex] = '^^';
      }

      // 更新行内容
      editor.setLine(line, segments.join('|'));
    }

    new Notice(`已合并 ${to.line - from.line + 1} 行`);
  }

  // 辅助函数：根据光标位置计算列索引
  private getColumnIndex(lineContent: string, ch: number): number {
    const segments = lineContent.split('|');
    let currentLength = 0;
    for (let i = 0; i < segments.length; i++) {
      currentLength += segments[i].length + 1; // +1 是 | 的长度
      if (ch < currentLength) {
        return i;
      }
    }
    return segments.length - 1;
  }

  onunload() {
    console.log('Table Merge Plugin unloaded');
  }
}