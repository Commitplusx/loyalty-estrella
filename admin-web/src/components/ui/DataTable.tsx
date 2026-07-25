import { Loader2 } from 'lucide-react';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (row: T) => string | number;
}

export function DataTable<T>({ columns, data, isLoading, emptyMessage = 'No hay registros', keyExtractor }: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-xl shadow-sm border border-zinc-200 p-12 flex flex-col items-center justify-center">
        <Loader2 size={32} className="animate-spin text-zinc-400 mb-4" />
        <p className="text-zinc-500 font-medium tracking-tight">Cargando datos...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full bg-white rounded-xl shadow-sm border border-zinc-200 p-12 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4 border border-zinc-100">
          <span className="text-2xl opacity-50">📭</span>
        </div>
        <p className="text-zinc-500 font-medium tracking-tight">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] border border-zinc-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-zinc-200">
              {columns.map((col, idx) => (
                <th key={idx} className={`px-4 py-3 md:px-6 md:py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.map((row) => (
              <tr key={keyExtractor(row)} className="hover:bg-zinc-50/50 transition-colors group">
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className={`px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm text-zinc-700 ${col.className || ''}`}>
                    {typeof col.accessor === 'function' ? col.accessor(row) : (row[col.accessor] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
