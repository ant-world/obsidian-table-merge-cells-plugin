import { Plugin, Menu, MarkdownView, Notice, MarkdownPostProcessorContext } from 'obsidian';

interface CellPosition {
    row: number;
    col: number;
}

interface TableSelection {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
}

interface MergeInfo {
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
}

export default class TableCellMergePlugin extends Plugin {
    private selectedCells: Set<HTMLTableCellElement> = new Set();
    private isSelecting: boolean = false;

    async onload() {
        console.log('加载表格单元格合并插件');

        // 注册 Markdown 后处理器，用于渲染合并单元格
        this.registerMarkdownPostProcessor((element, context) => {
            this.processTableMerges(element, context);
        });

        // 监听鼠标按下事件 - 开始选择
        this.registerDomEvent(document, 'mousedown', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const cell = target.closest('td, th') as HTMLTableCellElement;
            
            if (cell && cell.closest('.markdown-preview-view, .markdown-source-view.mod-cm6 .cm-content')) {
                // 右键点击时不清除选择
                if (evt.button === 2) { // 右键
                    if (!this.selectedCells.has(cell)) {
                        if (!evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
                            this.selectedCells.clear();
                        }
                        this.selectedCells.add(cell);
                        this.highlightSelectedCells();
                    }
                    return;
                }
                
                // 左键点击
                if (!evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
                    this.selectedCells.clear();
                }
                
                this.selectedCells.add(cell);
                this.isSelecting = true;
                this.highlightSelectedCells();
                
                evt.preventDefault();
            } else if (!evt.shiftKey && !evt.ctrlKey && !evt.metaKey && evt.button !== 2) {
                this.clearSelection();
            }
        });

        // 监听鼠标移动事件 - 拖动选择
        this.registerDomEvent(document, 'mousemove', (evt: MouseEvent) => {
            if (!this.isSelecting) return;
            
            const target = evt.target as HTMLElement;
            const cell = target.closest('td, th') as HTMLTableCellElement;
            
            if (cell) {
                this.selectedCells.add(cell);
                this.highlightSelectedCells();
            }
        });

        // 监听鼠标松开事件 - 结束选择
        this.registerDomEvent(document, 'mouseup', () => {
            this.isSelecting = false;
        });

        // 监听右键菜单
        this.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const cell = target.closest('td, th') as HTMLTableCellElement;
            const table = target.closest('table') as HTMLTableElement;
            
            if (cell && table && this.selectedCells.size > 0) {
                evt.preventDefault();
                evt.stopPropagation();
                this.showTableContextMenu(evt, table);
            }
        });

        // 添加命令
        this.addCommand({
            id: 'merge-table-cells',
            name: '合并选中的表格单元格',
            callback: () => {
                this.mergeSelectedCells();
            }
        });
    }

    processTableMerges(element: HTMLElement, context: MarkdownPostProcessorContext) {
        const tables = element.querySelectorAll('table');
        
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            const mergeMap: Map<string, MergeInfo> = new Map();
            
            rows.forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('td, th');
                let colOffset = 0;
                
                cells.forEach((cell, cellIndex) => {
                    const actualCol = cellIndex + colOffset;
                    const cellText = cell.textContent?.trim() || '';
                    
                    // 检查是否是空单元格（表示被合并）
                    if (cellText === '' && cell.textContent === '') {
                        // 查找左侧或上方的合并信息
                        const leftKey = `${rowIndex}-${actualCol - 1}`;
                        const upKey = `${rowIndex - 1}-${actualCol}`;
                        
                        if (mergeMap.has(leftKey)) {
                            const mergeInfo = mergeMap.get(leftKey)!;
                            mergeInfo.colspan++;
                            cell.remove();
                            colOffset--;
                        } else if (mergeMap.has(upKey)) {
                            const mergeInfo = mergeMap.get(upKey)!;
                            mergeInfo.rowspan++;
                            cell.remove();
                            colOffset--;
                        }
                    } else {
                        // 检查下一个单元格是否为空（横向合并）
                        let colspan = 1;
                        let nextCell = cells[cellIndex + 1];
                        while (nextCell && nextCell.textContent?.trim() === '') {
                            colspan++;
                            nextCell = cells[cellIndex + colspan];
                        }
                        
                        if (colspan > 1) {
                            mergeMap.set(`${rowIndex}-${actualCol}`, {
                                row: rowIndex,
                                col: actualCol,
                                rowspan: 1,
                                colspan: colspan
                            });
                            (cell as HTMLTableCellElement).colSpan = colspan;
                        }
                    }
                });
            });
        });
    }

    highlightSelectedCells() {
        document.querySelectorAll('.table-cell-selected').forEach(cell => {
            cell.removeClass('table-cell-selected');
        });

        this.selectedCells.forEach(cell => {
            cell.addClass('table-cell-selected');
        });

        if (!document.getElementById('table-merge-styles')) {
            const style = document.createElement('style');
            style.id = 'table-merge-styles';
            style.textContent = `
                .table-cell-selected {
                    background-color: rgba(100, 150, 255, 0.3) !important;
                    outline: 2px solid rgba(100, 150, 255, 0.6) !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    clearSelection() {
        this.selectedCells.clear();
        document.querySelectorAll('.table-cell-selected').forEach(cell => {
            cell.removeClass('table-cell-selected');
        });
    }

    showTableContextMenu(evt: MouseEvent, table: HTMLTableElement) {
        const menu = new Menu();
        
        console.log('显示菜单时，选中单元格数量:', this.selectedCells.size);

        if (this.selectedCells.size >= 2) {
            const selectedCells = new Set(this.selectedCells);
            
            menu.addItem((item) => {
                item
                    .setTitle(`合并单元格 (${selectedCells.size} 个)`)
                    .setIcon('merge-horizontal')
                    .onClick(() => {
                        this.selectedCells = selectedCells;
                        this.mergeCellsFromTable(table);
                    });
            });
        }

        menu.addItem((item) => {
            item
                .setTitle('拆分单元格')
                .setIcon('split')
                .onClick(() => {
                    const cell = Array.from(this.selectedCells)[0];
                    if (cell) {
                        this.splitCell(table, cell);
                    }
                });
        });

        menu.addItem((item) => {
            item
                .setTitle('清除选择')
                .setIcon('x')
                .onClick(() => {
                    this.clearSelection();
                });
        });

        menu.showAtMouseEvent(evt);
    }

    mergeSelectedCells() {
        if (this.selectedCells.size < 2) {
            new Notice('请选择至少两个单元格');
            return;
        }

        const firstCell = Array.from(this.selectedCells)[0];
        const table = firstCell.closest('table') as HTMLTableElement;
        
        if (table) {
            this.mergeCellsFromTable(table);
        }
    }

    mergeCellsFromTable(table: HTMLTableElement) {
        console.log('开始合并，选中单元格数量:', this.selectedCells.size);
        
        if (this.selectedCells.size < 2) {
            new Notice('请选择至少两个单元格');
            return;
        }

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            new Notice('无法获取活动编辑器');
            return;
        }

        const cellPositions = this.calculateCellPositions();
        console.log('单元格位置:', cellPositions);
        
        if (!cellPositions) {
            new Notice('无法计算单元格位置');
            return;
        }

        const tablePosition = this.findTablePosition(view, table);
        console.log('表格位置:', tablePosition);
        
        if (!tablePosition) {
            new Notice('无法定位表格位置');
            return;
        }

        const editor = view.editor;
        
        const tableLines = this.getTableLines(editor, tablePosition.start, tablePosition.end);
        console.log('表格行数:', tableLines.length);
        
        const parsedTable = this.parseTable(tableLines);
        console.log('解析后的表格:', parsedTable);
        
        if (!parsedTable) {
            new Notice('无法解析表格');
            return;
        }

        const mergedTable = this.performMerge(parsedTable, cellPositions);
        console.log('合并后的表格:', mergedTable);

        const newTableText = this.generateTableText(mergedTable);

        editor.replaceRange(
            newTableText,
            { line: tablePosition.start, ch: 0 },
            { line: tablePosition.end, ch: editor.getLine(tablePosition.end).length }
        );

        this.clearSelection();
        
        new Notice('单元格已合并');
    }

    calculateCellPositions(): TableSelection | null {
        if (this.selectedCells.size === 0) return null;

        const cells = Array.from(this.selectedCells);
        const positions = cells.map(cell => ({
            row: (cell.parentElement as HTMLTableRowElement).rowIndex,
            col: cell.cellIndex
        }));

        const minRow = Math.min(...positions.map(p => p.row));
        const maxRow = Math.max(...positions.map(p => p.row));
        const minCol = Math.min(...positions.map(p => p.col));
        const maxCol = Math.max(...positions.map(p => p.col));

        return { minRow, maxRow, minCol, maxCol };
    }

    findTablePosition(view: MarkdownView, table: HTMLTableElement): { start: number, end: number } | null {
        const editor = view.editor;
        
        const cursor = editor.getCursor();
        let tableStart = cursor.line;
        let tableEnd = cursor.line;

        while (tableStart > 0) {
            const line = editor.getLine(tableStart - 1);
            if (!line.trim().startsWith('|')) break;
            tableStart--;
        }

        while (tableEnd < editor.lineCount() - 1) {
            const line = editor.getLine(tableEnd + 1);
            if (!line.trim().startsWith('|')) break;
            tableEnd++;
        }

        if (!editor.getLine(tableStart).trim().startsWith('|')) {
            for (let i = 0; i < editor.lineCount(); i++) {
                const line = editor.getLine(i);
                if (line.trim().startsWith('|')) {
                    tableStart = i;
                    tableEnd = i;
                    
                    while (tableEnd < editor.lineCount() - 1) {
                        const nextLine = editor.getLine(tableEnd + 1);
                        if (!nextLine.trim().startsWith('|')) break;
                        tableEnd++;
                    }
                    break;
                }
            }
        }

        return { start: tableStart, end: tableEnd };
    }

    getTableLines(editor: any, start: number, end: number): string[] {
        const lines: string[] = [];
        for (let i = start; i <= end; i++) {
            lines.push(editor.getLine(i));
        }
        return lines;
    }

    parseTable(lines: string[]): string[][] | null {
        if (lines.length < 2) return null;

        const rows: string[][] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (/^[\|\s\-:]+$/.test(line)) {
                continue;
            }

            const cells = line
                .split('|')
                .slice(1, -1)
                .map(cell => cell.trim());

            rows.push(cells);
        }

        return rows;
    }

    performMerge(table: string[][], selection: TableSelection): string[][] {
        const { minRow, maxRow, minCol, maxCol } = selection;

        // 收集所有单元格的内容
        const contents: string[] = [];
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                if (row < table.length && col < table[row].length) {
                    const content = table[row][col];
                    if (content && content.trim()) {
                        contents.push(content.trim());
                    }
                }
            }
        }

        // 合并内容
        const mergedContent = contents.join(' ');

        // 创建新表格
        const newTable: string[][] = [];
        
        for (let row = 0; row < table.length; row++) {
            const newRow: string[] = [];
            
            for (let col = 0; col < table[row].length; col++) {
                // 如果是合并区域的左上角
                if (row === minRow && col === minCol) {
                    newRow.push(mergedContent);
                }
                // 如果在合并区域内
                else if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
                    // 在源码中用空字符串表示被合并的单元格
                    newRow.push('');
                }
                // 不在合并区域内
                else {
                    newRow.push(table[row][col]);
                }
            }
            
            newTable.push(newRow);
        }

        return newTable;
    }

    splitCell(table: HTMLTableElement, cell: HTMLTableCellElement) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const tablePosition = this.findTablePosition(view, table);
        if (!tablePosition) return;

        const editor = view.editor;
        const tableLines = this.getTableLines(editor, tablePosition.start, tablePosition.end);
        const parsedTable = this.parseTable(tableLines);
        if (!parsedTable) return;

        const cellRow = (cell.parentElement as HTMLTableRowElement).rowIndex;
        const cellCol = cell.cellIndex;
        
        // 查找该单元格对应的合并区域
        let foundMerge = false;
        for (let row = 0; row < parsedTable.length; row++) {
            for (let col = 0; col < parsedTable[row].length; col++) {
                // 检查是否是合并单元格的起始位置
                if (row === cellRow && col === cellCol) {
                    // 查找后续的空单元格，填充内容
                    let hasEmpty = false;
                    for (let r = row; r < parsedTable.length; r++) {
                        for (let c = (r === row ? col : 0); c < parsedTable[r].length; c++) {
                            if (r === row && c === col) continue;
                            if (parsedTable[r][c] === '') {
                                parsedTable[r][c] = parsedTable[row][col];
                                hasEmpty = true;
                            } else if (hasEmpty) {
                                break;
                            }
                        }
                        if (hasEmpty && r > row) break;
                    }
                    foundMerge = true;
                    break;
                }
            }
            if (foundMerge) break;
        }

        const newTableText = this.generateTableText(parsedTable);
        
        editor.replaceRange(
            newTableText,
            { line: tablePosition.start, ch: 0 },
            { line: tablePosition.end, ch: editor.getLine(tablePosition.end).length }
        );

        this.clearSelection();
        new Notice('单元格已拆分');
    }

    generateTableText(table: string[][]): string {
        if (table.length === 0) return '';

        const lines: string[] = [];

        // 表头
        lines.push('| ' + table[0].join(' | ') + ' |');

        // 分隔行
        const separatorCells = table[0].map(() => '---');
        lines.push('| ' + separatorCells.join(' | ') + ' |');

        // 数据行
        for (let i = 1; i < table.length; i++) {
            lines.push('| ' + table[i].join(' | ') + ' |');
        }

        return lines.join('\n');
    }

    onunload() {
        this.clearSelection();
        
        const style = document.getElementById('table-merge-styles');
        if (style) {
            style.remove();
        }
        
        console.log('卸载表格单元格合并插件');
    }
}