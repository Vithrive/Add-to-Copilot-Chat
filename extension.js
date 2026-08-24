'use strict';

const vscode = require('vscode');
const { formatCodeReference, formatResourceReference } = require('./reference');

const CHAT_OPEN_COMMAND = 'workbench.action.chat.open';
const CHAT_FOCUS_INPUT_COMMAND = 'workbench.action.chat.focusInput';
const CHAT_VIEW_FOCUS_COMMAND = 'workbench.panel.chat.view.copilot.focus';
// Do not use chat.open with query: VS Code replaces the existing input instead
// of inserting at the retained caret. editor.action.clipboardPasteAction is the
// first choice because Workbench routes it to a focused Chat/webview input.
// execPaste is not a documented VS Code command, so it is only a last fallback.
const PASTE_COMMANDS = ['editor.action.clipboardPasteAction', 'paste', 'execPaste'];

let pasteQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function config() {
  return vscode.workspace.getConfiguration('addToCopilotChat');
}

function hasUsableFsPath(uri) {
  // 判据是「是否有可传递的真实路径」，与是否位于工作区无关：
  // file 本地盘、vscode-remote（Remote-SSH/WSL/容器）都有 fsPath；
  // untitled、output 等虚拟文档没有，才退回发送选中文本。
  return !!uri && typeof uri.fsPath === 'string' && uri.fsPath.length > 0;
}

function isWorkspaceRelativePreferred(uri) {
  const style = config().get('pathStyle', 'absolute');
  if (style !== 'workspaceRelative') return false;
  // 只有位于某个工作区根内的资源才能生成可靠的相对路径。
  return !!vscode.workspace.getWorkspaceFolder(uri);
}

/**
 * Resolve a path without reading content. This is a UI extension, so it also
 * works with Remote-SSH/WSL/Containers: URI metadata remains available locally.
 * 工作区归属只影响相对/绝对形式，不决定能否生成路径引用——
 * 工作区外的本地文件同样发送绝对路径。
 */
function referencePathForUri(uri) {
  if (!hasUsableFsPath(uri)) throw new Error('该资源没有可传递的文件路径');
  if (isWorkspaceRelativePreferred(uri)) {
    const relative = vscode.workspace.asRelativePath(uri, false);
    if (relative && !isProbablyAbsolute(relative, uri)) {
      return relative.replace(/\\/g, '/');
    }
  }
  return uri.fsPath;
}

function isProbablyAbsolute(candidate, uri) {
  // Windows 盘符或 POSIX 根开头视为绝对路径；此时 asRelativePath 实际返回了绝对值
  // （多根工作区外的资源），保持绝对语义即可。
  return /^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith('/') || (!!uri && candidate === uri.fsPath);
}

/** dsh-drop-caret uses selection.end.line + 1, so keep that convention. */
function referenceForEditorSelection(editor) {
  if (!editor || editor.selection.isEmpty) throw new Error('请先选中代码片段');
  const selection = editor.selection;
  if (!hasUsableFsPath(editor.document.uri)) {
    // Untitled and virtual documents do not have a durable file reference.
    // Preserve useful behavior by adding the selected text itself instead.
    return editor.document.getText(selection);
  }
  return formatCodeReference(
    referencePathForUri(editor.document.uri),
    selection.start.line + 1,
    selection.end.line + 1
  );
}

function explorerUris(resource, selectedResources) {
  const candidates = Array.isArray(selectedResources) && selectedResources.length ? selectedResources : [resource];
  const seen = new Set();
  const uris = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.fsPath !== 'string' || !candidate.fsPath) continue;
    const key = candidate.toString();
    if (!seen.has(key)) {
      seen.add(key);
      uris.push(candidate);
    }
  }
  if (!uris.length) throw new Error('请在资源管理器中选择文件或文件夹');
  return uris;
}

function joinReferences(references) {
  return references.filter(Boolean).join('\n');
}

/**
 * Focus the current Chat input then dispatch a Workbench paste. Command probing
 * keeps this safe across VS Code versions. A command resolving does not prove
 * the input accepted text, so the generated reference always has a manual
 * clipboard fallback.
 */
async function tryPasteIntoCopilotChat() {
  try {
    // Open/focus the last Chat widget without a query, then explicitly focus
    // its input. The second command is a no-op until Chat has been opened.
    await vscode.commands.executeCommand(CHAT_OPEN_COMMAND);
    try {
      await vscode.commands.executeCommand(CHAT_FOCUS_INPUT_COMMAND);
    } catch (_) {
      await vscode.commands.executeCommand(CHAT_VIEW_FOCUS_COMMAND);
    }
  } catch (error) {
    console.warn('[Add to Copilot Chat] Cannot focus Chat:', error && error.message);
    return null;
  }

  await sleep(config().get('focusDelayMs', 200));
  // execPaste is attempted only as a final compatibility fallback.
  // Unsupported commands reject and fall through safely.
  for (const command of PASTE_COMMANDS) {
    try {
      await vscode.commands.executeCommand(command);
      // Webview-backed inputs read clipboard contents asynchronously.
      await sleep(200);
      return command;
    } catch (error) {
      console.debug('[Add to Copilot Chat] Paste command failed:', command, error && error.message);
    }
  }
  return null;
}

async function sendReference(reference) {
  pasteQueue = pasteQueue.then(async () => {
    const previousClipboard = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(reference);

    if (!config().get('autoPaste', true)) {
      vscode.window.showInformationMessage('Copilot 引用已复制：请在 Copilot Chat 的任意位置粘贴。');
      return;
    }

    const pasteCommand = await tryPasteIntoCopilotChat();
    if (!pasteCommand) {
      vscode.window.showWarningMessage('无法自动粘贴到 Copilot Chat；引用已复制，请在目标位置按 Ctrl/Cmd+V。');
      return;
    }

    if (config().get('restoreClipboard', true)) {
      await vscode.env.clipboard.writeText(previousClipboard);
    }
    vscode.window.showInformationMessage('已添加到 Copilot Chat。');
  }).catch((error) => {
    console.error('[Add to Copilot Chat] Failed to add reference:', error);
    vscode.window.showErrorMessage('Add to Copilot Chat 失败：' + (error && error.message ? error.message : String(error)));
  });
  return pasteQueue;
}

async function copyReference(reference) {
  await vscode.env.clipboard.writeText(reference);
  vscode.window.showInformationMessage('Copilot 引用已复制，可在对话框任意位置粘贴。');
}

function activate(context) {
  const addEditorSelection = vscode.commands.registerCommand('addToCopilotChat.addEditorSelection', async () => {
    try {
      await sendReference(referenceForEditorSelection(vscode.window.activeTextEditor));
    } catch (error) {
      vscode.window.showWarningMessage(error && error.message ? error.message : String(error));
    }
  });

  const addExplorerResource = vscode.commands.registerCommand('addToCopilotChat.addExplorerResource', async (resource, selectedResources) => {
    try {
      const references = explorerUris(resource, selectedResources).map((uri) => formatResourceReference(referencePathForUri(uri)));
      await sendReference(joinReferences(references));
    } catch (error) {
      vscode.window.showWarningMessage(error && error.message ? error.message : String(error));
    }
  });

  const copyEditorSelection = vscode.commands.registerCommand('addToCopilotChat.copyEditorSelection', async () => {
    try {
      await copyReference(referenceForEditorSelection(vscode.window.activeTextEditor));
    } catch (error) {
      vscode.window.showWarningMessage(error && error.message ? error.message : String(error));
    }
  });

  const copyExplorerResource = vscode.commands.registerCommand('addToCopilotChat.copyExplorerResource', async (resource, selectedResources) => {
    try {
      const references = explorerUris(resource, selectedResources).map((uri) => formatResourceReference(referencePathForUri(uri)));
      await copyReference(joinReferences(references));
    } catch (error) {
      vscode.window.showWarningMessage(error && error.message ? error.message : String(error));
    }
  });

  context.subscriptions.push(addEditorSelection, addExplorerResource, copyEditorSelection, copyExplorerResource);
}

function deactivate() {}

module.exports = { activate, deactivate };
