import { Plugin, Editor, Menu, MarkdownView, App } from 'obsidian';

// 扩展 App 类型，添加 internalPlugins 声明（仅为类型提示，不影响运行）
declare module 'obsidian' {
    interface App {
        internalPlugins: {
            getPluginById(id: string): { enabled: boolean } | null;
        };
    }
}

export default class TableMergePlugin extends Plugin {
    async onload() {
        console.log('Table Merge Plugin loaded');

        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
                if (view.getMode() === 'source') {
                    // 判断实时预览是否开启
                    const isLivePreview = this.isLivePreviewEnabled();

                    if (isLivePreview) {
                        console.log("编辑视图（实时预览）下右键触发了！");
                    } else {
                        console.log("纯源码模式下右键触发了！");
                    }
                } else if (view.getMode() === 'preview') {
                    console.log("阅读模式下右键触发了！");
                }
            })
        );
    }

    // 检查实时预览是否开启（核心方法）
    private isLivePreviewEnabled(): boolean {
        // 使用类型断言绕过类型检查，获取内部插件
        const livePreviewPlugin = (this.app as any).internalPlugins.getPluginById('live-preview');
        return livePreviewPlugin?.enabled ?? false;
    }
}