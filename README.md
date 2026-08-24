# Add to Copilot Chat

一个独立、零依赖的 VS Code 扩展：把编辑器中选中的代码、资源管理器里的文件或文件夹转换为路径引用文本，并尝试自动插入当前 Copilot Chat 输入框保留的光标位置。

它不依赖 DeepSeek Harness，也不读取或上传文件内容；生成的只是普通文本，因此适用于任何 Copilot Chat 模型或自定义语言模型提供方。

## 引用格式

与 dsh-drop-caret 的代码段格式保持一致：

| 来源 | 生成文本 |
| --- | --- |
| 选中单行代码 | C:\\repo\\src\\auth.ts:25 |
| 选中多行代码 | C:\\repo\\src\\auth.ts:25-68 |
| 文件 | C:\\repo\\src\\auth.ts |
| 文件夹 | C:\\repo\\src\\auth |

默认使用绝对路径；可在 addToCopilotChat.pathStyle 改为 workspaceRelative。

## 使用方式

### 编辑器中的代码段

1. 在编辑器中选中代码；
2. 右键点击 Add to Copilot Chat，或按 Ctrl+Alt+Shift+A；macOS 使用 Cmd+Ctrl+Shift+A；
3. 扩展生成 路径:起始行-结束行，聚焦 Copilot Chat 并尝试粘贴；
4. 输入框原有文本不应被替换，引用应插入其保留光标位置；继续输入或发送即可。

### 资源管理器中的文件或文件夹

1. 在 VS Code Explorer 中右键文件或文件夹；
2. 点击 Add to Copilot Chat；
3. 路径将被插入 Copilot Chat。多选资源时，每条路径单独占一行。

### 稳定回退：仅复制

如果 VS Code 版本、Chat 状态或远程环境导致自动粘贴未生效，扩展会把引用保留在剪贴板并提示你在 Copilot Chat 目标位置按 Ctrl+V 或 Cmd+V。

也可显式使用 Copy Copilot Reference，只复制、不尝试自动粘贴。

## 实现说明与边界

- 自动插入采用社区扩展 RangeLink 验证过的模式：先聚焦 Chat，再写剪贴板，最后调用 Workbench 粘贴命令；
- 不使用 workbench.action.chat.open 的 query 参数，因为该方式会替换整个 Chat 输入，而不是在光标处插入；
- 聚焦顺序是 workbench.action.chat.open（无参数）再到 workbench.action.chat.focusInput；粘贴顺序是 editor.action.clipboardPasteAction、paste、execPaste。最后一项不是 VS Code 的公开命令，仅作兼容兜底；
- 自动粘贴失败时会保留引用在剪贴板，因而不会丢失用户生成的引用；
- 当前 VS Code 没有公开扩展点让第三方接管 Shift 加直接拖文件到 Copilot 输入框的 drop 事件；该手势仍由 VS Code 创建 context chip。本扩展提供的是同等语义的路径文本插入；
- 本扩展是桌面 VS Code 的 UI 扩展，Remote-SSH、WSL、Dev Containers 均支持；不面向 vscode.dev 或 Codespaces Web。

## 配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| addToCopilotChat.pathStyle | absolute | absolute 或 workspaceRelative |
| addToCopilotChat.autoPaste | true | 是否尝试自动聚焦并粘贴到 Copilot Chat |
| addToCopilotChat.focusDelayMs | 200 | 聚焦 Chat 后、发起粘贴前的等待时间（毫秒） |
| addToCopilotChat.restoreClipboard | true | 自动粘贴成功后是否恢复此前剪贴板文本 |

## 开发与打包

    node test/reference-format.test.js
    npx --yes @vscode/vsce package --allow-missing-repository
    code --install-extension add-to-copilot-chat-0.1.0.vsix

建议先用非空 Copilot Chat 输入框测试：在文本中间放置光标，再从编辑器或 Explorer 触发命令，确认引用被插入而非覆盖。
