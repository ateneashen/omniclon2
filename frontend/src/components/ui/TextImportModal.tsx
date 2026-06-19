import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface TextImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (text: string) => void;
}

interface ParsedSheet {
  name: string;
  rows: string[][];
}

const SUPPORTED_EXTENSIONS = [
  { name: 'CSV / Excel', extensions: ['csv', 'xlsx', 'xls'] },
];

export default function TextImportModal({ isOpen, onClose, onSelect }: TextImportModalProps) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedCol, setSelectedCol] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const selectedCellRef = useRef<HTMLTableCellElement>(null);

  const rows = useMemo(() => {
    return sheets[activeSheet]?.rows ?? [];
  }, [sheets, activeSheet]);

  const selectedText = useMemo(() => {
    return rows[selectedRow]?.[selectedCol] ?? '';
  }, [rows, selectedRow, selectedCol]);

  const reset = useCallback(() => {
    setFilePath(null);
    setSheets([]);
    setActiveSheet(0);
    setSelectedRow(0);
    setSelectedCol(0);
    setError(null);
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSelect = useCallback(() => {
    if (selectedText) {
      onSelect(selectedText);
    }
    handleClose();
  }, [selectedText, onSelect, handleClose]);

  const parseCsv = useCallback((bytes: Uint8Array): ParsedSheet[] => {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      delimiter: '',
    });
    return [{ name: 'CSV', rows: parsed.data.map((r) => r.map((c) => String(c ?? ''))) }];
  }, []);

  const parseExcel = useCallback((buffer: ArrayBuffer): ParsedSheet[] => {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    return workbook.SheetNames.map((name) => {
      const worksheet = workbook.Sheets[name];
      const json = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
      return { name, rows: json.map((r) => r.map((c) => String(c ?? ''))) };
    });
  }, []);

  const loadFile = useCallback(async () => {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: SUPPORTED_EXTENSIONS,
      });
      if (!selected || Array.isArray(selected)) return;

      setLoading(true);
      setFilePath(selected);

      const ext = selected.split('.').pop()?.toLowerCase() ?? '';
      const bytes = await readFile(selected);

      let parsed: ParsedSheet[];
      if (ext === 'csv') {
        parsed = parseCsv(bytes);
      } else if (ext === 'xlsx' || ext === 'xls') {
        parsed = parseExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      } else {
        throw new Error('Unsupported file type');
      }

      // Filter out completely empty rows
      parsed = parsed.map((sheet) => ({
        ...sheet,
        rows: sheet.rows.filter((row) => row.some((cell) => cell.trim() !== '')),
      }));

      if (parsed.length === 0 || parsed[0].rows.length === 0) {
        throw new Error('File appears to be empty');
      }

      setSheets(parsed);
      setActiveSheet(0);
      setSelectedRow(0);
      setSelectedCol(0);
    } catch (err) {
      setError('Failed to load file: ' + String(err));
      setSheets([]);
    } finally {
      setLoading(false);
    }
  }, [parseCsv, parseExcel]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (rows.length === 0) return;
      const maxCol = Math.max(0, ...rows.map((r) => r.length - 1));

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedRow((r) => Math.max(0, r - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedRow((r) => Math.min(rows.length - 1, r + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setSelectedCol((c) => Math.max(0, c - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setSelectedCol((c) => Math.min(maxCol, c + 1));
          break;
        case 'Enter':
          e.preventDefault();
          handleSelect();
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, rows, handleSelect, handleClose]);

  // Scroll selected cell into view
  useEffect(() => {
    selectedCellRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedRow, selectedCol]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#1a1a1a] border border-white/15 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium text-white">Import text from CSV / Excel</h2>
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-white text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={loadFile}
              disabled={loading}
              className="text-xs px-3 py-1.5 bg-[#00b4d8] text-black rounded hover:bg-[#0099b8] disabled:opacity-50 transition"
            >
              {loading ? 'Loading…' : 'Choose file…'}
            </button>
            {filePath && (
              <div className="text-[10px] text-white/50 truncate flex-1" title={filePath}>
                {filePath}
              </div>
            )}
          </div>

          {sheets.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/40">Sheet:</span>
              <select
                value={activeSheet}
                onChange={(e) => {
                  setActiveSheet(Number(e.target.value));
                  setSelectedRow(0);
                  setSelectedCol(0);
                }}
                className="bg-black/40 border border-white/20 rounded px-2 py-0.5 text-white text-xs focus:outline-none focus:border-[#00b4d8]/50"
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i} className="bg-[#1a1a1a]">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="text-[10px] text-red-300 bg-red-950/30 border border-red-500/30 rounded p-2">
              {error}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div
                ref={tableRef}
                className="flex-1 min-h-0 overflow-auto border border-white/10 rounded bg-black/30"
                tabIndex={-1}
              >
                <table className="w-full text-left border-collapse">
                  <tbody>
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx} className={rIdx === selectedRow ? 'bg-[#00b4d8]/15' : 'hover:bg-white/5'}>
                        {row.map((cell, cIdx) => {
                          const isSelected = rIdx === selectedRow && cIdx === selectedCol;
                          return (
                            <td
                              key={cIdx}
                              ref={isSelected ? selectedCellRef : undefined}
                              onClick={() => {
                                setSelectedRow(rIdx);
                                setSelectedCol(cIdx);
                              }}
                              className={[
                                'px-2 py-1 text-[11px] border border-white/5 cursor-pointer whitespace-nowrap',
                                isSelected
                                  ? 'bg-[#00b4d8]/30 text-white outline outline-1 outline-[#00b4d8]'
                                  : 'text-white/70',
                              ].join(' ')}
                            >
                              {cell}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[10px] text-white/40">Selected preview</div>
                <div className="text-xs text-white bg-black/40 border border-white/20 rounded px-2 py-1 min-h-[2rem] max-h-24 overflow-auto">
                  {selectedText || <span className="text-white/30">No cell selected</span>}
                </div>
              </div>
            </>
          )}

          {rows.length === 0 && !loading && !error && (
            <div className="flex-1 flex items-center justify-center text-white/30 text-xs">
              Load a CSV or Excel file to preview its contents.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10">
          <button
            onClick={handleClose}
            className="text-xs px-3 py-1.5 text-white/70 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!selectedText}
            className="text-xs px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
