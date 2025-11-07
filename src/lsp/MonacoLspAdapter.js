/**
 * Monaco LSP Adapter - Bridges LSP Manager with Monaco Editor
 * Registers Monaco language providers that delegate to LSP
 */

import * as monaco from 'monaco-editor';
import { lspManager } from './LspManager.js';

export class MonacoLspAdapter {
  constructor() {
    this.disposables = [];
    this.documentVersions = new Map(); // uri -> version number
  }

  /**
   * Register LSP providers for a language
   */
  registerLanguage(languageId) {
    console.log(`[MonacoLspAdapter] Registering providers for ${languageId}`);

    // Hover Provider
    this.disposables.push(
      monaco.languages.registerHoverProvider(languageId, {
        provideHover: async (model, position) => {
          const uri = model.uri.toString();
          const lspPosition = this.monacoPositionToLsp(position);

          try {
            const result = await lspManager.hover(languageId, uri, lspPosition);
            
            if (!result || !result.contents) return null;

            return {
              contents: this.lspHoverToMonaco(result.contents),
              range: result.range ? this.lspRangeToMonaco(result.range) : undefined
            };
          } catch (error) {
            console.error('[MonacoLspAdapter] Hover error:', error);
            return null;
          }
        }
      })
    );

    // Completion Provider
    this.disposables.push(
      monaco.languages.registerCompletionItemProvider(languageId, {
        provideCompletionItems: async (model, position) => {
          const uri = model.uri.toString();
          const lspPosition = this.monacoPositionToLsp(position);

          try {
            const result = await lspManager.completion(languageId, uri, lspPosition);
            
            if (!result) return { suggestions: [] };

            const items = Array.isArray(result) ? result : result.items || [];
            
            return {
              suggestions: items.map(item => this.lspCompletionToMonaco(item))
            };
          } catch (error) {
            console.error('[MonacoLspAdapter] Completion error:', error);
            return { suggestions: [] };
          }
        }
      })
    );

    // Listen for diagnostics notifications
    window.addEventListener('lsp:notification', (event) => {
      const { languageId: notifLang, method, params } = event.detail;
      
      if (notifLang === languageId && method === 'textDocument/publishDiagnostics') {
        this.handleDiagnostics(params);
      }
    });
  }

  /**
   * Handle diagnostics from LSP server
   */
  handleDiagnostics(params) {
    const { uri, diagnostics } = params;
    
    // Find the Monaco model for this URI
    const models = monaco.editor.getModels();
    const model = models.find(m => m.uri.toString() === uri);
    
    if (!model) {
      console.warn('[MonacoLspAdapter] No model found for URI:', uri);
      return;
    }

    // Convert LSP diagnostics to Monaco markers
    const markers = diagnostics.map(diag => ({
      severity: this.lspSeverityToMonaco(diag.severity),
      startLineNumber: diag.range.start.line + 1,
      startColumn: diag.range.start.character + 1,
      endLineNumber: diag.range.end.line + 1,
      endColumn: diag.range.end.character + 1,
      message: diag.message,
      source: diag.source || 'LSP',
      code: diag.code
    }));

    monaco.editor.setModelMarkers(model, 'lsp', markers);
  }

  /**
   * Notify LSP when a model is opened
   */
  onModelAdded(model, languageId) {
    const uri = model.uri.toString();
    const text = model.getValue();
    const version = 1;

    this.documentVersions.set(uri, version);
    lspManager.didOpenTextDocument(languageId, uri, text, version);

    // Listen for content changes
    model.onDidChangeContent(() => {
      const newVersion = (this.documentVersions.get(uri) || 0) + 1;
      this.documentVersions.set(uri, newVersion);

      lspManager.didChangeTextDocument(
        languageId,
        uri,
        [{ text: model.getValue() }], // Full document sync
        newVersion
      );
    });
  }

  /**
   * Notify LSP when a model is closed
   */
  onModelRemoved(model, languageId) {
    const uri = model.uri.toString();
    lspManager.didCloseTextDocument(languageId, uri);
    this.documentVersions.delete(uri);
  }

  /**
   * Convert Monaco position to LSP position
   */
  monacoPositionToLsp(position) {
    return {
      line: position.lineNumber - 1,
      character: position.column - 1
    };
  }

  /**
   * Convert LSP range to Monaco range
   */
  lspRangeToMonaco(range) {
    return new monaco.Range(
      range.start.line + 1,
      range.start.character + 1,
      range.end.line + 1,
      range.end.character + 1
    );
  }

  /**
   * Convert LSP hover contents to Monaco format
   */
  lspHoverToMonaco(contents) {
    if (!contents) return [];

    if (typeof contents === 'string') {
      return [{ value: contents }];
    }

    if (Array.isArray(contents)) {
      return contents.map(item => {
        if (typeof item === 'string') {
          return { value: item };
        }
        return {
          value: item.value,
          language: item.language
        };
      });
    }

    if (contents.kind === 'markdown') {
      return [{ value: contents.value }];
    }

    if (contents.language) {
      return [{
        value: contents.value,
        language: contents.language
      }];
    }

    return [{ value: String(contents) }];
  }

  /**
   * Convert LSP completion item to Monaco format
   */
  lspCompletionToMonaco(item) {
    return {
      label: item.label,
      kind: this.lspCompletionKindToMonaco(item.kind),
      detail: item.detail,
      documentation: item.documentation,
      insertText: item.insertText || item.label,
      range: item.range ? this.lspRangeToMonaco(item.range) : undefined,
      sortText: item.sortText,
      filterText: item.filterText
    };
  }

  /**
   * Convert LSP completion kind to Monaco
   */
  lspCompletionKindToMonaco(kind) {
    const CompletionItemKind = monaco.languages.CompletionItemKind;
    const kindMap = {
      1: CompletionItemKind.Text,
      2: CompletionItemKind.Method,
      3: CompletionItemKind.Function,
      4: CompletionItemKind.Constructor,
      5: CompletionItemKind.Field,
      6: CompletionItemKind.Variable,
      7: CompletionItemKind.Class,
      8: CompletionItemKind.Interface,
      9: CompletionItemKind.Module,
      10: CompletionItemKind.Property,
      11: CompletionItemKind.Unit,
      12: CompletionItemKind.Value,
      13: CompletionItemKind.Enum,
      14: CompletionItemKind.Keyword,
      15: CompletionItemKind.Snippet,
      16: CompletionItemKind.Color,
      17: CompletionItemKind.File,
      18: CompletionItemKind.Reference,
      19: CompletionItemKind.Folder,
      20: CompletionItemKind.EnumMember,
      21: CompletionItemKind.Constant,
      22: CompletionItemKind.Struct,
      23: CompletionItemKind.Event,
      24: CompletionItemKind.Operator,
      25: CompletionItemKind.TypeParameter
    };

    return kindMap[kind] || CompletionItemKind.Text;
  }

  /**
   * Convert LSP severity to Monaco
   */
  lspSeverityToMonaco(severity) {
    const MarkerSeverity = monaco.MarkerSeverity;
    const severityMap = {
      1: MarkerSeverity.Error,
      2: MarkerSeverity.Warning,
      3: MarkerSeverity.Info,
      4: MarkerSeverity.Hint
    };

    return severityMap[severity] || MarkerSeverity.Info;
  }

  /**
   * Dispose all registered providers
   */
  dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

// Global instance
export const monacoLspAdapter = new MonacoLspAdapter();
