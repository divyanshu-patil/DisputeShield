"use client";
import {
  AllCommunityModule,
  type ColDef,
  ModuleRegistry,
  type RowClickedEvent,
  themeQuartz,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";

ModuleRegistry.registerModules([AllCommunityModule]);

/** AG Grid theme built from tokens.css (DESIGN.md: Nunito Sans, semibold secondary headers, hairline rows). */
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--ds-surface)",
  foregroundColor: "var(--ds-text)",
  headerBackgroundColor: "var(--ds-bg)",
  headerTextColor: "var(--ds-body)",
  headerFontFamily: "inherit",
  headerFontSize: 14,
  headerFontWeight: 600,
  borderColor: "var(--ds-line)",
  accentColor: "var(--ds-accent)",
  rowHoverColor: "var(--ds-surface-2)",
  wrapperBorder: { color: "var(--ds-line)" },
  selectedRowBackgroundColor: "var(--ds-accent-soft)",
  oddRowBackgroundColor: "var(--ds-surface)",
  fontFamily: "inherit",
  fontSize: 14,
  rowHeight: 44,
  headerHeight: 40,
  cellHorizontalPadding: 12,
  borderRadius: 8,
  wrapperBorderRadius: 12,
  browserColorScheme: "inherit",
});

export function DataGrid<T>({
  rows,
  columns,
  onRowClick,
  quickFilter,
  height = 520,
  storageKey,
  getRowId,
}: {
  rows: T[];
  columns: ColDef<T>[];
  onRowClick?: (row: T) => void;
  quickFilter?: string;
  height?: number;
  /** Column state saved per viewer in localStorage (guarded; 06 section 3). */
  storageKey?: string;
  getRowId?: (row: T) => string;
}) {
  const defaultColDef = useMemo<ColDef<T>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      flex: 1,
      minWidth: 110,
    }),
    [],
  );
  return (
    <div style={{ height }} className="w-full">
      <AgGridReact<T>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        quickFilterText={quickFilter}
        animateRows={false}
        suppressCellFocus={false}
        {...(getRowId
          ? { getRowId: (p: { data: T }) => getRowId(p.data) }
          : {})}
        rowStyle={onRowClick ? { cursor: "pointer" } : undefined}
        onRowClicked={(e: RowClickedEvent<T>) => e.data && onRowClick?.(e.data)}
        onCellKeyDown={(e) => {
          const ke = e.event as KeyboardEvent | undefined;
          if (ke?.key === "Enter" && e.data) onRowClick?.(e.data);
        }}
        onGridReady={(e) => {
          if (!storageKey) return;
          try {
            const saved = localStorage.getItem(storageKey);
            if (saved)
              e.api.applyColumnState({
                state: JSON.parse(saved) as never,
                applyOrder: true,
              });
          } catch {
            /* storage unavailable */
          }
        }}
        onColumnMoved={(e) => save(storageKey, e.api.getColumnState())}
        onColumnResized={(e) =>
          e.finished && save(storageKey, e.api.getColumnState())
        }
        onSortChanged={(e) => save(storageKey, e.api.getColumnState())}
      />
    </div>
  );
}

function save(key: string | undefined, state: unknown) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export type { ColDef } from "ag-grid-community";
