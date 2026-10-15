import React from 'react';
import { GroupedAuditItem, StoreSettings } from '../types';
import { Boxes } from 'lucide-react';

interface PrintableReportProps {
  dateStr: string;
  match: number;
  missing: number;
  extra: number;
  netImpact: number;
  groupedItems: GroupedAuditItem[];
  aiAnalysisText?: string;
  storeSettings?: StoreSettings;
}

export const PrintableReport: React.FC<PrintableReportProps> = ({
  dateStr,
  match,
  missing,
  extra,
  netImpact,
  groupedItems,
  aiAnalysisText,
  storeSettings,
}) => {
  const storeName = storeSettings?.storeName || 'StockMaster';
  const logoUrl = storeSettings?.logoUrl;
  const tagline = storeSettings?.tagline;
  const phone = storeSettings?.phone;
  const address = storeSettings?.address;

  const impactLabel =
    netImpact < 0 ? 'Pérdida Estimada' : netImpact > 0 ? 'Ganancia Estimada' : 'Impacto Neto';

  const impactColor =
    netImpact < 0 ? 'text-red-700' : netImpact > 0 ? 'text-emerald-700' : 'text-gray-900';

  return (
    <div id="printable-report" className="hidden print:block bg-white text-black p-8 max-w-4xl mx-auto">
      {/* Report Header */}
      <div className="text-center mb-8 border-b-2 border-gray-800 pb-6 relative">
        <div className="absolute right-0 top-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={storeName}
              className="w-16 h-16 object-contain rounded"
            />
          ) : (
            <Boxes className="w-12 h-12 text-gray-400" />
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-700 uppercase tracking-widest mb-1">
          {storeName}
        </h2>
        {tagline && <p className="text-xs text-gray-500 font-medium mb-1">{tagline}</p>}
        {(phone || address) && (
          <p className="text-[11px] text-gray-500 mb-2">
            {[phone, address].filter(Boolean).join(' • ')}
          </p>
        )}
        <h1 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-wide">
          Reporte de Auditoría de Inventario
        </h1>
        <p className="text-gray-700 text-sm">
          Fecha de emisión: <strong>{dateStr}</strong>
        </p>
        <p className="text-gray-500 mt-1 text-xs">
          Documento oficial generado por {storeName}
        </p>
      </div>

      {/* 4 Metric Summary Boxes */}
      <div className="grid grid-cols-4 gap-4 mb-6 text-center">
        <div className="border border-gray-300 p-4 rounded-lg">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-1">
            Modelos Exactos
          </p>
          <p className="text-2xl font-bold text-gray-900">{match}</p>
        </div>
        <div className="border border-gray-300 p-4 rounded-lg">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-1">
            Faltantes
          </p>
          <p className="text-2xl font-bold text-gray-900">{missing}</p>
        </div>
        <div className="border border-gray-300 p-4 rounded-lg">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-1">
            Sobrantes
          </p>
          <p className="text-2xl font-bold text-gray-900">{extra}</p>
        </div>
        <div className="border border-gray-300 p-4 rounded-lg bg-gray-50">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-1">
            {impactLabel}
          </p>
          <p className={`text-2xl font-bold ${impactColor}`}>
            L {netImpact.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* AI Financial Summary (if generated) */}
      {aiAnalysisText && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900">
          <h4 className="font-bold mb-1 flex items-center gap-2">
            <span>Análisis Financiero de IA (Gemini)</span>
          </h4>
          <p className="leading-relaxed text-xs">{aiAnalysisText}</p>
        </div>
      )}

      {/* Financial Breakdown Table */}
      <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4 mt-6 text-gray-800">
        Detalle Financiero (Agrupado por Modelo)
      </h3>
      <table className="w-full text-left border-collapse mb-8 text-xs">
        <thead>
          <tr className="bg-gray-100 text-gray-700">
            <th className="p-2 border border-gray-300 font-bold uppercase">Producto / Modelo</th>
            <th className="p-2 border border-gray-300 font-bold uppercase">Proveedor</th>
            <th className="p-2 border border-gray-300 text-center font-bold uppercase w-16">Sistema</th>
            <th className="p-2 border border-gray-300 text-center font-bold uppercase w-16">Físico</th>
            <th className="p-2 border border-gray-300 text-right font-bold uppercase w-20">Dif. Unid.</th>
            <th className="p-2 border border-gray-300 text-right font-bold uppercase w-28">Impacto (L)</th>
          </tr>
        </thead>
        <tbody>
          {groupedItems.map((group) => {
            const diff = group.counted - group.expected;
            let groupImpact = 0;
            group.details.forEach((d) => {
              groupImpact += (d.counted - d.expected) * d.price;
            });

            return (
              <tr key={group.name}>
                <td className="p-2 border border-gray-300 font-medium text-gray-800">
                  {group.name}
                </td>
                <td className="p-2 border border-gray-300 text-gray-500">
                  {group.supplier || 'No asignado'}
                </td>
                <td className="p-2 border border-gray-300 text-center text-gray-600">
                  {group.expected}
                </td>
                <td className="p-2 border border-gray-300 text-center font-bold text-gray-900">
                  {group.counted}
                </td>
                <td className="p-2 border border-gray-300 text-right font-bold">
                  {diff === 0 ? '-' : diff > 0 ? `+${diff}` : diff}
                </td>
                <td
                  className={`p-2 border border-gray-300 text-right font-bold ${
                    groupImpact === 0
                      ? 'text-gray-900'
                      : groupImpact < 0
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {groupImpact === 0
                    ? '-'
                    : `L ${groupImpact > 0 ? '+' : ''}${groupImpact.toLocaleString('es-HN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Signature and Approval Block */}
      <div className="mt-16 pt-8 flex justify-between px-12">
        <div className="text-center">
          <div className="w-52 border-b border-gray-600 mb-2"></div>
          <p className="font-bold text-gray-800 uppercase text-xs tracking-wider">
            Firma de Auditor(a)
          </p>
        </div>
        <div className="text-center">
          <div className="w-52 border-b border-gray-600 mb-2"></div>
          <p className="font-bold text-gray-800 uppercase text-xs tracking-wider">
            Visto Bueno (Gerencia)
          </p>
        </div>
      </div>
    </div>
  );
};
