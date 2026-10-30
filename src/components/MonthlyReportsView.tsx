import React, { useState, useMemo, useEffect } from 'react';
import {
  Download,
  Printer,
  FileText,
  BarChart3,
  Building2,
  Percent,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  Eye,
  Sparkles,
} from 'lucide-react';
import { ExamRecordDoc } from '../services/examService';
import {
  EXAMES_PLANILHA_OFICIAL,
  canonicalizeExamName,
  canonicalizeUnidadeName,
  formatCurrencyBRL,
  formatDateBR,
  getMonthNameFromISO,
  getReceptionRepasseRate,
} from '../constants/diagnosticCatalog';
import { triggerDownloadSpreadsheetCSV } from '../utils/spreadsheetCsvSync';

interface MonthlyReportsViewProps {
  records: ExamRecordDoc[];
}

const MONTHS_LIST = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

type ReportTab = 'all' | 'fechamento' | 'consolidado' | 'medicos' | 'singlepage';

export const MonthlyReportsView: React.FC<MonthlyReportsViewProps> = ({
  records,
}) => {
  const [selectedMonthName, setSelectedMonthName] = useState<string>('Outubro');
  const [selectedMedicoFilter, setSelectedMedicoFilter] =
    useState<string>('TODOS');
  const [activeTab, setActiveTab] = useState<ReportTab>('all');
  const [isPrintingSinglePage, setIsPrintingSinglePage] = useState(false);

  const monthRecords = useMemo(() => {
    if (selectedMonthName === 'TODOS') return records;
    return records.filter(
      (r) => getMonthNameFromISO(r.dataRealizado) === selectedMonthName
    );
  }, [records, selectedMonthName]);

  // Evolução Anual Jan..Dez
  const annualChart = useMemo(() => {
    const stats = MONTHS_LIST.map((mName, idx) => {
      const prefix = `2026-${String(idx + 1).padStart(2, '0')}`;
      const list = records.filter((r) => r.dataRealizado.startsWith(prefix));
      const bruto = list.reduce((a, c) => a + (c.valorExame || 0), 0);
      const repasse = list.reduce((a, c) => a + (c.repasseValor || 0), 0);
      const liquido = bruto - repasse;
      return {
        shortLabel: mName.slice(0, 3),
        fullLabel: mName,
        count: list.length,
        bruto,
        repasse,
        liquido,
      };
    });
    const maxVal = Math.max(100, ...stats.map((s) => s.bruto));
    return { stats, maxVal };
  }, [records]);

  const reportData = useMemo(() => {
    const byMedico = new Map<
      string,
      {
        count: number;
        valorTotal: number;
        repasseTotal: number;
        examesBreakdown: Record<string, number>;
      }
    >();

    const byConvenio = new Map<
      string,
      {
        count: number;
        valorTotal: number;
        repasseTotal: number;
        aliquotaLabel: string;
      }
    >();

    const byUnidade = new Map<
      string,
      {
        count: number;
        valorTotal: number;
        repasseTotal: number;
      }
    >();

    const byExame = new Map<
      string,
      {
        count: number;
        valorTotal: number;
        repasseTotal: number;
      }
    >();

    for (const ex of EXAMES_PLANILHA_OFICIAL) {
      byExame.set(ex, { count: 0, valorTotal: 0, repasseTotal: 0 });
    }

    let grandValor = 0;
    let grandRepasse = 0;
    let repasseParticular3Pct = 0;
    let valorParticularTotal = 0;
    let qtdParticular = 0;
    let repasseConvenios10Pct = 0;
    let valorConveniosTotal = 0;
    let qtdConvenios = 0;

    for (const r of monthRecords) {
      const val = r.valorExame || 0;
      const rep = r.repasseValor || 0;
      grandValor += val;
      grandRepasse += rep;

      const rate = getReceptionRepasseRate(r.convenio);
      if (rate === 0.03) {
        repasseParticular3Pct += rep;
        valorParticularTotal += val;
        qtdParticular += 1;
      } else if (rate === 0.1) {
        repasseConvenios10Pct += rep;
        valorConveniosTotal += val;
        qtdConvenios += 1;
      }

      const medKey = (r.medicoOpto || '').trim().toUpperCase() || 'FORA';
      const prevMed = byMedico.get(medKey) || {
        count: 0,
        valorTotal: 0,
        repasseTotal: 0,
        examesBreakdown: {},
      };
      prevMed.count += 1;
      prevMed.valorTotal += val;
      prevMed.repasseTotal += rep;
      const exKey = canonicalizeExamName(r.exameTipo);
      prevMed.examesBreakdown[exKey] = (prevMed.examesBreakdown[exKey] || 0) + 1;
      byMedico.set(medKey, prevMed);

      const convKey = (r.convenio || '').trim().toUpperCase();
      const prevConv = byConvenio.get(convKey) || {
        count: 0,
        valorTotal: 0,
        repasseTotal: 0,
        aliquotaLabel:
          rate === 0.03
            ? '3% Part.'
            : rate === 0.1
            ? '10% Conv.'
            : '0% Cortesia',
      };
      prevConv.count += 1;
      prevConv.valorTotal += val;
      prevConv.repasseTotal += rep;
      byConvenio.set(convKey, prevConv);

      const unidKey = canonicalizeUnidadeName(r.unidadeIndicadora);
      const prevUnid = byUnidade.get(unidKey) || {
        count: 0,
        valorTotal: 0,
        repasseTotal: 0,
      };
      prevUnid.count += 1;
      prevUnid.valorTotal += val;
      prevUnid.repasseTotal += rep;
      byUnidade.set(unidKey, prevUnid);

      const prevEx = byExame.get(exKey) || {
        count: 0,
        valorTotal: 0,
        repasseTotal: 0,
      };
      prevEx.count += 1;
      prevEx.valorTotal += val;
      prevEx.repasseTotal += rep;
      byExame.set(exKey, prevEx);
    }

    const medicoList = Array.from(byMedico.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    const convenioList = Array.from(byConvenio.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    const unidadeList = Array.from(byUnidade.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    const exameList = Array.from(byExame.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    const grandLiquido = grandValor - grandRepasse;

    return {
      grandCount: monthRecords.length,
      grandValor,
      grandRepasse,
      grandLiquido,
      repasseParticular3Pct,
      valorParticularTotal,
      qtdParticular,
      repasseConvenios10Pct,
      valorConveniosTotal,
      qtdConvenios,
      medicoList,
      convenioList,
      unidadeList,
      exameList,
    };
  }, [monthRecords]);

  const medicoDetailedRows = useMemo(() => {
    if (selectedMedicoFilter === 'TODOS') return [];
    return monthRecords.filter(
      (r) =>
        ((r.medicoOpto || '').trim().toUpperCase() || 'FORA') ===
        selectedMedicoFilter
    );
  }, [monthRecords, selectedMedicoFilter]);

  const handlePrintSinglePage = () => {
    setIsPrintingSinglePage(true);
    setActiveTab('singlepage');
    setTimeout(() => {
      window.print();
    }, 180);
  };

  const handlePrintFull = () => {
    setIsPrintingSinglePage(false);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Restaura estado após fechamento da caixa de diálogo de impressão
  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingSinglePage(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const currentDateFormatted = useMemo(() => {
    const now = new Date();
    return `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, []);

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {/* 1. CABEÇALHO SUPERIOR EXECUTIVO */}
      <div className="bg-gradient-to-r from-oftalmo-950 via-oftalmo-800 to-oftalmo-900 text-white rounded-2xl p-5 shadow-md border border-oftalmo-800 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <img
              src="/assets/aistudio/oftalmomed-logo_set25_branco_verde_7db96e29.png"
              alt="OftalmoMed"
              className="h-6 w-auto object-contain"
            />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-verde-400">
              — São Mateus 1
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight">
            Relatórios de Produção e Repasse
          </h2>
          <p className="text-xs text-oftalmo-200 mt-0.5">
            Fechamento mensal e apuração de repasses: Particular (3%) e Convênios (10%).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Mês */}
          <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-verde-400" />
            <span className="text-xs font-semibold text-oftalmo-200">Mês:</span>
            <select
              value={selectedMonthName}
              onChange={(e) => setSelectedMonthName(e.target.value)}
              className="bg-transparent text-white text-xs sm:text-sm font-bold focus:outline-none cursor-pointer"
            >
              <option value="TODOS" className="text-slate-900">
                Todos os Meses (2026)
              </option>
              {MONTHS_LIST.map((m) => (
                <option key={m} value={m} className="text-slate-900">
                  {m} / 2026
                </option>
              ))}
            </select>
          </div>

          {/* Botão de Destaque: Imprimir em 1 Página */}
          <button
            type="button"
            onClick={handlePrintSinglePage}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-black rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer whitespace-nowrap"
            title="Gera um relatório executivo compacto diagramado estritamente para 1 única página A4"
          >
            <Printer className="w-4 h-4 text-slate-950" />
            <span>Imprimir em 1 Página (A4)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintFull}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs sm:text-sm font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Imprimir relatório analítico completo"
          >
            <FileText className="w-4 h-4 text-verde-400" />
            <span>Imprimir Completo</span>
          </button>

          <button
            type="button"
            onClick={() =>
              triggerDownloadSpreadsheetCSV(
                monthRecords,
                `CENTRO DIAGNOSTICO - SAO MATEUS 1 - ${selectedMonthName.toUpperCase()}.csv`
              )
            }
            className="px-3 py-2 bg-verde-600 hover:bg-verde-500 text-white text-xs sm:text-sm font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* 2. SUB-NAVEGAÇÃO ORGANIZADA DO RELATÓRIO */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 no-print">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setIsPrintingSinglePage(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Visão Geral Completa
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('fechamento');
              setIsPrintingSinglePage(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'fechamento'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            01. Fechamento de Repasse
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('consolidado');
              setIsPrintingSinglePage(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'consolidado'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            02. Por Exame & Convênio
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('medicos');
              setIsPrintingSinglePage(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'medicos'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            03. Médicos Solicitantes
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('singlepage');
              setIsPrintingSinglePage(true);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'singlepage'
                ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                : 'text-amber-900 hover:bg-amber-100 font-bold'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-amber-700" />
            <span>📄 Pré-Visualizar Folha A4 Única</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Mês ativo: <strong>{selectedMonthName} / 2026</strong> ({reportData.grandCount} exames)
        </div>
      </div>

      {/* =====================================================================
          MODO EXCLUSIVO: FOLHA ÚNICA A4 EXECUTIVA (1 PÁGINA RIGOROSA)
      ===================================================================== */}
      {(activeTab === 'singlepage' || isPrintingSinglePage) && (
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 font-semibold no-print shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Modo Folha Única A4 Ativo:</strong> Layout executivo de alta densidade diagramado para caber estritamente em 1 única página impressa ou salva em PDF.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('all');
                  setIsPrintingSinglePage(false);
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold rounded-lg transition cursor-pointer"
              >
                ✕ Voltar ao Relatório Completo
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-verde-400" />
                Imprimir Esta Folha A4
              </button>
            </div>
          </div>

          {/* CONTAINER A4 EXECUTIVO COM CLASSE PRINT-SINGLE-PAGE */}
          <div className="print-single-page bg-white p-5 sm:p-7 rounded-2xl border-2 border-slate-300 shadow-xl max-w-4xl mx-auto text-slate-900 text-xs">
            {/* Cabeçalho Formal A4 */}
            <div className="border-b-2 border-slate-900 pb-3 mb-3 flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#6d28d9]">
                  Centro Diagnóstico Oftalmológico
                </span>
                <h1 className="text-lg font-black text-slate-950 tracking-tight leading-tight">
                  OFTALMOMED — SÃO MATEUS 1
                </h1>
                <p className="text-[11px] font-semibold text-slate-600">
                  Relatório Executivo Mensal de Produção e Fechamento de Repasses
                </p>
              </div>
              <div className="text-right space-y-0.5">
                <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-bold text-slate-800">
                  COMPETÊNCIA: {selectedMonthName.toUpperCase()} / 2026
                </span>
                <div className="text-[10px] text-slate-500 font-medium">
                  Emissão: {currentDateFormatted}
                </div>
              </div>
            </div>

            {/* 4 Cards KPI em Linha Compacta */}
            <div className="grid grid-cols-4 gap-2.5 mb-3">
              <div className="bg-slate-50 border border-slate-300 rounded-lg p-2 text-center">
                <span className="block text-[9px] font-extrabold uppercase text-slate-500">
                  Exames Realizados
                </span>
                <span className="text-base font-black text-slate-950 tabular-nums">
                  {reportData.grandCount}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-300 rounded-lg p-2 text-center">
                <span className="block text-[9px] font-extrabold uppercase text-slate-500">
                  Faturamento Bruto
                </span>
                <span className="text-base font-black text-slate-950 tabular-nums">
                  {formatCurrencyBRL(reportData.grandValor)}
                </span>
              </div>
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 text-center">
                <span className="block text-[9px] font-extrabold uppercase text-amber-900">
                  Repasse Realização
                </span>
                <span className="text-base font-black text-amber-950 tabular-nums">
                  {formatCurrencyBRL(reportData.grandRepasse)}
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-2 text-center">
                <span className="block text-[9px] font-extrabold uppercase text-emerald-900">
                  Líquido OftalmoMed
                </span>
                <span className="text-base font-black text-emerald-700 tabular-nums">
                  {formatCurrencyBRL(reportData.grandLiquido)}
                </span>
              </div>
            </div>

            {/* Demonstrativo Resumido de Repasse de Realização */}
            <div className="bg-amber-50/60 border border-amber-300 rounded-lg p-2.5 mb-3">
              <div className="flex items-center justify-between border-b border-amber-200 pb-1 mb-1.5">
                <span className="text-[11px] font-black uppercase text-amber-950">
                  Fechamento Oficial de Repasse de Realização (Equipe que realiza os exames)
                </span>
                <span className="text-[10px] font-bold text-amber-800">
                  Particular: 3% • Convênios: 10%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="bg-white/80 p-1.5 rounded border border-amber-200">
                  <span className="block text-[9px] text-slate-500 font-bold uppercase">
                    Exames Particulares (3%)
                  </span>
                  <span className="font-bold text-slate-900">
                    {reportData.qtdParticular} exames · Base {formatCurrencyBRL(reportData.valorParticularTotal)}
                  </span>
                  <span className="block font-black text-amber-950 mt-0.5">
                    Repasse: {formatCurrencyBRL(reportData.repasseParticular3Pct)}
                  </span>
                </div>
                <div className="bg-white/80 p-1.5 rounded border border-amber-200">
                  <span className="block text-[9px] text-slate-500 font-bold uppercase">
                    Exames Convênios (10%)
                  </span>
                  <span className="font-bold text-slate-900">
                    {reportData.qtdConvenios} exames · Base {formatCurrencyBRL(reportData.valorConveniosTotal)}
                  </span>
                  <span className="block font-black text-amber-950 mt-0.5">
                    Repasse: {formatCurrencyBRL(reportData.repasseConvenios10Pct)}
                  </span>
                </div>
                <div className="bg-amber-100/80 p-1.5 rounded border border-amber-300">
                  <span className="block text-[9px] text-amber-900 font-extrabold uppercase">
                    Total a Pagar de Realização
                  </span>
                  <span className="text-sm font-black text-amber-950 tabular-nums">
                    {formatCurrencyBRL(reportData.grandRepasse)}
                  </span>
                  <span className="block text-[9px] text-amber-800 font-semibold mt-0.5">
                    Competência {selectedMonthName}/2026
                  </span>
                </div>
              </div>
            </div>

            {/* Duas Tabelas Lado a Lado: Consolidado por Exame + Consolidado por Convênio */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Tabela Exames */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-2 py-1 border-b border-slate-300 font-bold text-[10px] uppercase text-slate-700 flex justify-between">
                  <span>Exame Realizado</span>
                  <span>Qtd · Bruto · Repasse</span>
                </div>
                <table className="w-full text-[10.5px]">
                  <tbody className="divide-y divide-slate-100">
                    {reportData.exameList.slice(0, 8).map((ex) => (
                      <tr key={ex.name} className="py-1">
                        <td className="py-1 px-2 font-semibold text-slate-900 truncate max-w-[130px]">
                          {ex.name}
                        </td>
                        <td className="py-1 px-1 text-center font-bold text-slate-700">
                          {ex.count}
                        </td>
                        <td className="py-1 px-1 text-right font-medium text-slate-800">
                          {formatCurrencyBRL(ex.valorTotal)}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-amber-900">
                          {formatCurrencyBRL(ex.repasseTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tabela Convênios */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-2 py-1 border-b border-slate-300 font-bold text-[10px] uppercase text-slate-700 flex justify-between">
                  <span>Convênio / Modalidade</span>
                  <span>% · Qtd · Bruto · Repasse</span>
                </div>
                <table className="w-full text-[10.5px]">
                  <tbody className="divide-y divide-slate-100">
                    {reportData.convenioList.slice(0, 8).map((c) => (
                      <tr key={c.name} className="py-1">
                        <td className="py-1 px-2 font-semibold text-slate-900 truncate max-w-[130px]">
                          {c.name}
                        </td>
                        <td className="py-1 px-1 text-center text-[9px] font-bold text-amber-800">
                          {c.aliquotaLabel}
                        </td>
                        <td className="py-1 px-1 text-center font-bold text-slate-700">
                          {c.count}
                        </td>
                        <td className="py-1 px-1 text-right font-medium text-slate-800">
                          {formatCurrencyBRL(c.valorTotal)}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-amber-900">
                          {formatCurrencyBRL(c.repasseTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Médicos Indicadores Compacto */}
            <div className="border border-slate-300 rounded-lg p-2 mb-3 bg-slate-50/50">
              <span className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Principais Profissionais Solicitantes do Mês:
              </span>
              <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                {reportData.medicoList.slice(0, 3).map((m) => (
                  <div key={m.name} className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="font-bold text-slate-900 truncate block">
                      {m.name}
                    </span>
                    <span className="text-slate-600 font-medium">
                      {m.count} exames solicitados ({formatCurrencyBRL(m.valorTotal)})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé Formal com Assinatura em 1 Linha */}
            <div className="pt-2 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500">
              <div>
                <span>Documento emitido pelo Sistema OftalmoMed São Mateus 1 · Página 1 de 1</span>
              </div>
              <div className="text-center w-64 pt-2 border-t border-slate-400">
                <span className="block font-bold text-slate-800">Responsável Administrativo</span>
                <span>Clínica OftalmoMed — São Mateus 1</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODO PADRÃO COMPLETO: CARDS, GRÁFICOS E TABELAS ANALÍTICAS
      ===================================================================== */}
      {activeTab !== 'singlepage' && !isPrintingSinglePage && (
        <div className="space-y-6">
          {/* Resumo Rápido do Mês Selecionado */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Exames no Período ({selectedMonthName})
              </span>
              <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {reportData.grandCount}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Faturamento Bruto Exames
              </span>
              <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {formatCurrencyBRL(reportData.grandValor)}
              </div>
            </div>
            <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-300 shadow-xs">
              <span className="text-xs font-extrabold uppercase tracking-wide text-amber-900">
                Repasse de Realização (3% Part / 10% Conv)
              </span>
              <div className="text-2xl font-black text-amber-950 tabular-nums mt-1">
                {formatCurrencyBRL(reportData.grandRepasse)}
              </div>
              <div className="text-[11px] font-bold text-amber-800 mt-1">
                Part (3%): {formatCurrencyBRL(reportData.repasseParticular3Pct)} • Conv (10%):{' '}
                {formatCurrencyBRL(reportData.repasseConvenios10Pct)}
              </div>
            </div>
            <div className="bg-verde-50/60 rounded-2xl p-4 border border-verde-300 shadow-xs">
              <span className="text-xs font-extrabold uppercase tracking-wide text-verde-900">
                Líquido OftalmoMed
              </span>
              <div className="text-2xl font-black text-verde-800 tabular-nums mt-1">
                {formatCurrencyBRL(reportData.grandLiquido)}
              </div>
            </div>
          </div>

          {/* Demonstrativo Exclusivo do Repasse de Realização (3% Particular vs 10% Convênios) */}
          {(activeTab === 'all' || activeTab === 'fechamento') && (
            <section className="bg-white border-2 border-amber-300 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-amber-200 bg-amber-50/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center font-black">
                    <Percent className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                      01. Fechamento de Repasse de Realização
                    </h3>
                    <p className="text-xs font-semibold text-slate-700">
                      Regra Oficial: <strong>3% sobre Exames Particulares</strong> e{' '}
                      <strong>10% sobre Exames de Convênios</strong> realizados
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                <div className="p-4 space-y-1">
                  <span className="text-xs font-extrabold uppercase text-oftalmo-900">
                    Exames Particulares (Alíquota 3%)
                  </span>
                  <div className="text-lg font-black text-slate-900 tabular-nums">
                    Repasse de Realização: {formatCurrencyBRL(reportData.repasseParticular3Pct)}
                  </div>
                  <p className="text-xs font-semibold text-slate-600">
                    {reportData.qtdParticular} exames • Base Bruta:{' '}
                    {formatCurrencyBRL(reportData.valorParticularTotal)}
                  </p>
                </div>

                <div className="p-4 space-y-1">
                  <span className="text-xs font-extrabold uppercase text-verde-900">
                    Exames de Convênios (Alíquota 10%)
                  </span>
                  <div className="text-lg font-black text-slate-900 tabular-nums">
                    Repasse de Realização: {formatCurrencyBRL(reportData.repasseConvenios10Pct)}
                  </div>
                  <p className="text-xs font-semibold text-slate-600">
                    {reportData.qtdConvenios} exames • Base Bruta:{' '}
                    {formatCurrencyBRL(reportData.valorConveniosTotal)}
                  </p>
                </div>

                <div className="p-4 bg-amber-50/50 space-y-1">
                  <span className="text-xs font-extrabold uppercase text-amber-950">
                    Total a Pagar de Realização ({selectedMonthName})
                  </span>
                  <div className="text-xl font-black text-amber-950 tabular-nums">
                    {formatCurrencyBRL(reportData.grandRepasse)}
                  </div>
                  <p className="text-xs font-bold text-amber-800">
                    Total acumulado de {reportData.grandCount} exames realizados
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Gráfico Mensal (Jan..Dez) + Produção por Unidade Indicadora */}
          {activeTab === 'all' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-oftalmo-800" />
                      Evolução Mensal: Faturamento Bruto vs. Líquido (2026)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Clique em qualquer mês para filtrar os relatórios abaixo
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-oftalmo-800 inline-block" />
                      Bruto
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-verde-600 inline-block" />
                      Líquido
                    </span>
                  </div>
                </div>

                {/* Gráfico em Barras */}
                <div className="grid grid-cols-12 gap-1.5 items-end h-52 pt-6 pb-2 border-b border-slate-200">
                  {annualChart.stats.map((m) => {
                    const isSelected = m.fullLabel === selectedMonthName;
                    const brutoH =
                      annualChart.maxVal > 0
                        ? Math.max(
                            m.bruto > 0 ? 10 : 2,
                            Math.round((m.bruto / annualChart.maxVal) * 160)
                          )
                        : 2;
                    const liquidoH =
                      annualChart.maxVal > 0
                        ? Math.max(
                            m.liquido > 0 ? 6 : 2,
                            Math.round((m.liquido / annualChart.maxVal) * 160)
                          )
                        : 2;

                    return (
                      <button
                        key={m.fullLabel}
                        type="button"
                        onClick={() => setSelectedMonthName(m.fullLabel)}
                        className={`flex flex-col items-center justify-end h-full group transition-all rounded-lg p-1 cursor-pointer ${
                          isSelected ? 'bg-oftalmo-50 ring-2 ring-oftalmo-600' : 'hover:bg-slate-50'
                        }`}
                        title={`${m.fullLabel}: Bruto ${formatCurrencyBRL(
                          m.bruto
                        )} | Líquido ${formatCurrencyBRL(m.liquido)} (${
                          m.count
                        } exames)`}
                      >
                        <div className="w-full flex items-end justify-center gap-0.5 h-40">
                          <div
                            style={{ height: `${brutoH}px` }}
                            className={`w-2.5 rounded-t-sm transition-all ${
                              isSelected ? 'bg-oftalmo-700' : 'bg-oftalmo-900 group-hover:bg-oftalmo-700'
                            }`}
                          />
                          <div
                            style={{ height: `${liquidoH}px` }}
                            className={`w-2.5 rounded-t-sm transition-all ${
                              isSelected ? 'bg-verde-500' : 'bg-verde-600 group-hover:bg-verde-500'
                            }`}
                          />
                        </div>
                        <span
                          className={`text-[10px] font-bold mt-2 uppercase ${
                            isSelected ? 'text-oftalmo-900' : 'text-slate-500'
                          }`}
                        >
                          {m.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Volume por Unidade Indicadora */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-oftalmo-800" />
                    Unidades Indicadoras ({selectedMonthName})
                  </h3>
                  <span className="text-xs text-slate-500 font-semibold">
                    {reportData.unidadeList.length} unidades
                  </span>
                </div>
                <div className="p-4 flex-1 overflow-y-auto max-h-72 divide-y divide-slate-100">
                  {reportData.unidadeList.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">
                      Nenhuma indicação registrada neste mês.
                    </p>
                  ) : (
                    reportData.unidadeList.map((u) => {
                      const sharePct =
                        reportData.grandValor > 0
                          ? ((u.valorTotal / reportData.grandValor) * 100).toFixed(1)
                          : '0.0';
                      return (
                        <div key={u.name} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-slate-900 block">
                              {u.name}
                            </span>
                            <span className="text-slate-500 font-medium">
                              {u.count} exames realizados ({sharePct}%)
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900 tabular-nums block">
                              {formatCurrencyBRL(u.valorTotal)}
                            </span>
                            <span className="text-[11px] text-amber-900 font-semibold">
                              Repasse: {formatCurrencyBRL(u.repasseTotal)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Matriz Consolidada por Exame & por Convênio */}
          {(activeTab === 'all' || activeTab === 'consolidado') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50/70">
                  <h3 className="text-sm font-bold text-slate-900">
                    02. Consolidado por Exame (Com Repasse de Realização)
                  </h3>
                </div>
                <table className="w-full text-[13.5px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 text-xs uppercase font-bold">
                      <th className="py-2.5 px-4 text-left">Exame</th>
                      <th className="py-2.5 px-4 text-right">Qtd.</th>
                      <th className="py-2.5 px-4 text-right">Valor Exames</th>
                      <th className="py-2.5 px-4 text-right">Repasse de Realização</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.exameList.map((ex) => (
                      <tr key={ex.name} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-900">
                          {ex.name}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-right font-bold text-slate-900">
                          {ex.count}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-right text-slate-700">
                          {formatCurrencyBRL(ex.valorTotal)}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-right font-semibold text-amber-900">
                          {formatCurrencyBRL(ex.repasseTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50/70">
                  <h3 className="text-sm font-bold text-slate-900">
                    03. Consolidado por Convênio (3% Particular / 10% Convênios)
                  </h3>
                </div>
                <table className="w-full text-[13.5px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 text-xs uppercase font-bold">
                      <th className="py-2.5 px-4 text-left">Convênio</th>
                      <th className="py-2.5 px-4 text-center">% Realização</th>
                      <th className="py-2.5 px-4 text-right">Qtd.</th>
                      <th className="py-2.5 px-4 text-right">Bruto</th>
                      <th className="py-2.5 px-4 text-right">Repasse de Realização</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.convenioList.map((c) => (
                      <tr key={c.name} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-900">
                          {c.name}
                        </td>
                        <td className="py-2.5 px-4 text-center text-xs font-bold text-amber-800">
                          {c.aliquotaLabel}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-right font-bold text-slate-900">
                          {c.count}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-right text-slate-700">
                          {formatCurrencyBRL(c.valorTotal)}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-right font-bold text-amber-900">
                          {formatCurrencyBRL(c.repasseTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}

          {/* 4. Origem das Solicitações por Médico / Opto */}
          {(activeTab === 'all' || activeTab === 'medicos') && (
            <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    04. Volume de Solicitações por Médico / Opto Indicador
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Histórico de indicações de exames por profissional solicitante (repasse de realização).
                  </p>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <span className="text-xs font-semibold text-slate-600">
                    Filtrar solicitante:
                  </span>
                  <select
                    value={selectedMedicoFilter}
                    onChange={(e) => setSelectedMedicoFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm font-semibold bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="TODOS">Todos os Solicitantes</option>
                    {reportData.medicoList.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 text-xs uppercase font-bold">
                      <th className="py-3 px-4 text-left">Médico / Opto Solicitante</th>
                      <th className="py-3 px-4 text-left">Exames Solicitados</th>
                      <th className="py-3 px-4 text-right">Qtd. Exames</th>
                      <th className="py-3 px-4 text-right">Valor Bruto Exames</th>
                      <th className="py-3 px-4 text-right">
                        Repasse de Realização (3% / 10%)
                      </th>
                      <th className="py-3 px-4 text-right">Líquido Oftalmo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.medicoList.map((med) => {
                      const summaryExams = Object.entries(med.examesBreakdown)
                        .map(([ex, c]) => `${ex} (${c})`)
                        .join(' · ');

                      return (
                        <tr key={med.name} className="hover:bg-blue-50/40">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {med.name}
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-medium">
                            {summaryExams}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-right font-bold text-slate-900">
                            {med.count}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-right font-semibold text-slate-800">
                            {formatCurrencyBRL(med.valorTotal)}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-right font-semibold text-amber-900">
                            {formatCurrencyBRL(med.repasseTotal)}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-right font-bold text-emerald-700">
                            {formatCurrencyBRL(med.valorTotal - med.repasseTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Extrato Detalhado do Médico Selecionado */}
          {selectedMedicoFilter !== 'TODOS' && (activeTab === 'all' || activeTab === 'medicos') && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#24478f]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Extrato Analítico de Exames Solicitados por: {selectedMedicoFilter} (
                  {medicoDetailedRows.length} exames)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-bold">
                      <th className="py-2.5 px-3.5 text-left">Nº / Data</th>
                      <th className="py-2.5 px-3.5 text-left">Pedido eMed</th>
                      <th className="py-2.5 px-3.5 text-left">Paciente</th>
                      <th className="py-2.5 px-3.5 text-left">Convênio</th>
                      <th className="py-2.5 px-3.5 text-left">Exame</th>
                      <th className="py-2.5 px-3.5 text-right">Valor Exame</th>
                      <th className="py-2.5 px-3.5 text-right">Repasse de Realização</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {medicoDetailedRows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-3.5 tabular-nums">
                          #{r.seqNumber} · {formatDateBR(r.dataRealizado)}
                        </td>
                        <td className="py-2.5 px-3.5 tabular-nums">
                          {r.pedidoEmed}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-slate-900">
                          {r.pacienteNome}
                        </td>
                        <td className="py-2.5 px-3.5">{r.convenio}</td>
                        <td className="py-2.5 px-3.5 font-semibold">
                          {r.exameTipo}
                        </td>
                        <td className="py-2.5 px-3.5 tabular-nums text-right">
                          {formatCurrencyBRL(r.valorExame)}
                        </td>
                        <td className="py-2.5 px-3.5 tabular-nums text-right font-semibold text-amber-900">
                          {formatCurrencyBRL(r.repasseValor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
