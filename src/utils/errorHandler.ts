import * as vscode from 'vscode';
import { Logger } from '../services/logger';

export function handleError(
  error: unknown,
  category: string,
  panel?: vscode.WebviewPanel,
  viewId?: string,
  errorId?: string
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  Logger.getInstance().error(`${errMsg}`, category, error);
  if (panel && viewId) {
    panel.webview.postMessage({
      command: 'error',
      viewId,
      data: { id: errorId, error: errMsg }
    });
  }
}