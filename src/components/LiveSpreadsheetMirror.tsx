import React, { useState, useMemo } from 'react';
import {
  Download,
  Upload,
  Plus,
  Trash2,
  Copy,
  Check,
  FileSpreadsheet,
  Sparkles,
  Link2,
  AlertCircle,
  AlertTriangle,
  Bell,
  X,
} from 'lucide-react';
import {
  CONVENIOS_PADRAO,
  UNIDADES_INDICADORAS_PADRAO,
  MEDICOS_OPTO_PADRAO,
  TODOS_EXAMES,
  EXAMES_PLANILHA_OFICIAL,
  OBS_STATUS_PADRAO,
  CustomPricingRuleDoc,
  resolveAutoPrice,
  formatCurrencyBRL,
  formatDateBR,
  getMissingExamFields,
} from '../constants/diagnosticCatalog';
import { ExamRecordDoc, NewExamInput } from '../services/examService';
import {
  calculateSpreadsheetSummary,
  buildExactAttachedSpreadsheetCSV,
} from '../utils/spreadsheetCsvSync';

interface LiveSpreadsheetMirrorProps {
  records: ExamRecordDoc[];
  pricingRules: CustomPricingRuleDoc[];
  onAddRecord: (input: NewExamInput) => Promise<void>;
  onUpdateRecord: (id: string, input: NewExamInput) => Promise<void>;
  onDeleteRecord: (id: string) => Promise<void>;
  onOpenNewModal: (prefill?: Partial<NewExamInput>) => void;
  onDownloadCSV: () => void;
  onImportCSVFile: (file: File) => void;
  linkedFileName: string | null;
  onLinkLocalCSV: () => void;
  autoDownloadOnChange: boolean;
  onToggleAutoDownload: (val: boolean) => void;
}

export const LiveSpreadsheetMirror: React.FC<LiveSpreadsheetMirrorProps> = ({
  records,
  pricingRules,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onOpenNewModal,
  onDownloadCSV,
  onImportCSVFile,
  linkedFileName,
  onLinkLocalCSV,
  autoDownloadOnChange,
  onToggleAutoDownload,
}) => {
  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => a.seqNumber - b.seqNumber),
    [records]
  );

  const [filterIncompleteOnly, setFilterIncompleteOnly] = useState(false);
  const [fieldAlert, setFieldAlert] = useState<{
    type: 'error' | 'warning';
    title: string;
    missingFields: string[];
  } | null>(null);

  const incompleteRecordsCount = useMemo(() => {
    return sortedRecords.filter((r) => {
      const audit = getMissingExamFields(r);
      return !audit.isValid || audit.allMissing.length > 0;
    }).length;
  }, [sortedRecords]);

  const activeDisplayRecords = useMemo(() => {
    if (!filterIncompleteOnly) return sortedRecords;
    return sortedRecords.filter((r) => {
      const audit = getMissingExamFields(r);
      return !audit.isValid || audit.allMissing.length > 0;
    });
  }, [sortedRecords, filterIncompleteOnly]);

  const summary = useMemo(
    () => calculateSpreadsheetSummary(sortedRecords),
    [sortedRecords]
  );

  // Quick inline row addition at the bottom/top of the spreadsheet
  const [quickPedido, setQuickPedido] = useState('');
  const [quickPaciente, setQuickPaciente] = useState('');
  const [quickData, setQuickData] = useState('2026-10-08');
  const [quickConvenio, setQuickConvenio] = useState('SÃO MIGUEL');
  const [quickUnidade, setQuickUnidade] = useState('SÃO MATEUS 1');
  const [quickMedico, setQuickMedico] = useState('FORA');
  const [quickExame, setQuickExame] = useState('OCT');
  const [quickRepasse, setQuickRepasse] = useState<number>(16);
  const [quickValor, setQuickValor] = useState<number>(160);
  const [quickObs, setQuickObs] = useState('a ser entregue');
  const [copiedCsvNotice, setCopiedCsvNotice] = useState(false);

  // Inline editing of any existing row in the spreadsheet
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NewExamInput | null>(null);

  const nextSeq = useMemo(() => {
    if (sortedRecords.length === 0) return 1;
    return Math.max(...sortedRecords.map((r) => r.seqNumber)) + 1;
  }, [sortedRecords]);

  const handleQuickConvenioOrExamChange = (
    newConv: string,
    newExam: string
  ) => {
    const auto = resolveAutoPrice(newConv, newExam, pricingRules);
    setQuickConvenio(newConv);
    setQuickExame(newExam);
    setQuickValor(auto.valorExame);
    setQuickRepasse(auto.repasseValor);
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const audit = getMissingExamFields({
      pacienteNome: quickPaciente,
      pedidoEmed: quickPedido,
      dataRealizado: quickData,
      convenio: quickConvenio,
      unidadeIndicadora: quickUnidade,
      medicoOpto: quickMedico,
      exameTipo: quickExame,
      valorExame: quickValor,
      repasseValor: quickRepasse,
    });

    if (!audit.isValid) {
      setFieldAlert({
        type: 'error',
        title: 'Não é possível incluir na planilha! Campos obrigatórios faltando:',
        missingFields: audit.missingRequired,
      });
      return;
    }

    if (audit.missingRecommended.length > 0) {
      setFieldAlert({
        type: 'warning',
        title: 'Atenção: Exame incluído, mas com informações pendentes:',
        missingFields: audit.missingRecommended,
      });
    } else {
      setFieldAlert(null);
    }

    await onAddRecord({
      seqNumber: nextSeq,
      pedidoEmed: quickPedido.trim(),
      pacienteNome: quickPaciente.trim().toUpperCase(),
      dataRealizado: quickData,
      convenio: quickConvenio,
      unidadeIndicadora: quickUnidade,
      medicoOpto: quickMedico,
      repasseValor: quickRepasse,
      valorExame: quickValor,
      exameTipo: quickExame,
      observacoes: quickObs,
    });
    setQuickPedido('');
    setQuickPaciente('');
  };

  const handleSaveEdit = async (recordId: string) => {
    if (!editDraft) return;
    const audit = getMissingExamFields(editDraft);
    if (!audit.isValid) {
      setFieldAlert({
        type: 'error',
        title: 'Não foi possível salvar alteração! Campos obrigatórios faltando:',
        missingFields: audit.missingRequired,
      });
      return;
    }
    await onUpdateRecord(recordId, editDraft);
    setEditingRowId(null);
    setEditDraft(null);
    if (audit.missingRecommended.length > 0) {
      setFieldAlert({
        type: 'warning',
        title: 'Atenção: Linha alterada, mas contém dados pendentes:',
        missingFields: audit.missingRecommended,
      });
    } else {
      setFieldAlert(null);
    }
  };

  const handleCopyFullCSV = async () => {
    const csv = buildExactAttachedSpreadsheetCSV(sortedRecords);
    await navigator.clipboard.writeText(csv);
    setCopiedCsvNotice(true);
    setTimeout(() => setCopiedCsvNotice(false), 3000);
  };

  // Display at least 22 numbered rows just like the screenshot & attached CSV
  const totalDisplayRows = Math.max(22, sortedRecords.length + 3);

  return (
    <div className="space-y-6">
      {/* Top Banner: Sincronização Direta com a Planilha Anexada */}
      <div className="bg-gradient-to-r from-oftalmo-950 via-oftalmo-900 to-oftalmo-800 text-white rounded-3xl p-6 shadow-lg border border-oftalmo-700/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 bg-verde-500/20 text-verde-400 rounded-xl border border-verde-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black uppercase tracking-tight">
                  Planilha Oficial Anexada — Centro Diagnóstico São Mateus 1
                </h2>
                <span className="bg-verde-500/20 text-verde-400 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border border-verde-500/30">
                  Sincronização Ativa
                </span>
              </div>
              <p className="text-xs text-oftalmo-200 mt-0.5">
                Toda inclusão, edição ou exclusão feita no site altera imediatamente esta planilha e recalcula as fórmulas de contagem ao lado.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onLinkLocalCSV}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition flex items-center gap-1.5 cursor-pointer ${
              linkedFileName
                ? 'bg-verde-600 text-white border-verde-400 shadow-md'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
            title="Vincular arquivo .CSV do computador para gravação automática a cada alteração"
          >
            <Link2 className="w-4 h-4 text-verde-400" />
            <span>
              {linkedFileName
                ? `Vinculado: ${linkedFileName}`
                : 'Vincular Planilha .CSV Local'}
            </span>
          </button>

          <label className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold border border-white/20 transition flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-4 h-4 text-verde-400" />
            <span>Carregar .CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportCSVFile(file);
                  e.target.value = '';
                }
              }}
            />
          </label>

          <button
            type="button"
            onClick={handleCopyFullCSV}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold border border-white/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            {copiedCsvNotice ? (
              <>
                <Check className="w-4 h-4 text-verde-400" />
                <span>CSV Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-verde-400" />
                <span>Copiar CSV Original</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onDownloadCSV}
            className="px-4 py-2 bg-verde-600 hover:bg-verde-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Planilha Atualizada (.CSV)</span>
          </button>
        </div>
      </div>

      {/* Barra de Lançamento Rápido Direto na Planilha */}
      <form
        onSubmit={handleQuickAdd}
        className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-oftalmo-700" />
            <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Inclusão Rápida na Linha #{nextSeq} da Planilha
            </span>
            <span className="text-[11px] text-slate-500">
              (Selecionar Convênio + Exame preenche Repasse e Valor automaticamente)
            </span>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDownloadOnChange}
              onChange={(e) => onToggleAutoDownload(e.target.checked)}
              className="rounded border-slate-300 text-oftalmo-700 focus:ring-oftalmo-600"
            />
            <span>
              Baixar planilha .CSV automaticamente após cada inclusão/alteração
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2.5 items-end text-xs">
          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Pedido eMed
            </label>
            <input
              type="text"
              placeholder="934400"
              value={quickPedido}
              onChange={(e) => setQuickPedido(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-2.5 py-2 font-mono font-bold text-slate-800"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Nome Paciente *
            </label>
            <input
              type="text"
              required
              placeholder="NOME DO PACIENTE"
              value={quickPaciente}
              onChange={(e) => setQuickPaciente(e.target.value.toUpperCase())}
              className="w-full border border-slate-300 rounded-xl px-2.5 py-2 font-bold text-slate-900 uppercase"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Data
            </label>
            <input
              type="date"
              value={quickData}
              onChange={(e) => setQuickData(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-2 py-2 font-mono text-slate-800"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Convênio
            </label>
            <select
              value={quickConvenio}
              onChange={(e) =>
                handleQuickConvenioOrExamChange(e.target.value, quickExame)
              }
              className="w-full border border-slate-300 rounded-xl px-2 py-2 font-bold text-slate-800"
            >
              {CONVENIOS_PADRAO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Unidade Ind.
            </label>
            <select
              value={quickUnidade}
              onChange={(e) => setQuickUnidade(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-2 py-2 font-bold text-slate-800"
            >
              {UNIDADES_INDICADORAS_PADRAO.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Médico/Opto
            </label>
            <input
              type="text"
              list="mirror-medicos-list"
              value={quickMedico}
              onChange={(e) => setQuickMedico(e.target.value.toUpperCase())}
              className="w-full border border-slate-300 rounded-xl px-2.5 py-2 font-bold text-slate-800 uppercase"
            />
            <datalist id="mirror-medicos-list">
              {MEDICOS_OPTO_PADRAO.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Exames
            </label>
            <select
              value={quickExame}
              onChange={(e) =>
                handleQuickConvenioOrExamChange(quickConvenio, e.target.value)
              }
              className="w-full border border-slate-300 rounded-xl px-2 py-2 font-black text-oftalmo-900 bg-oftalmo-50"
            >
              {TODOS_EXAMES.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Repasse de Realização (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={quickRepasse}
              onChange={(e) =>
                setQuickRepasse(parseFloat(e.target.value) || 0)
              }
              className="w-full border border-slate-300 rounded-xl px-2 py-2 font-mono font-bold text-right"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Valor (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={quickValor}
              onChange={(e) => setQuickValor(parseFloat(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-xl px-2 py-2 font-mono font-bold text-right"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              Obs
            </label>
            <input
              type="text"
              list="obs-status-list"
              value={quickObs}
              onChange={(e) => setQuickObs(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-2 py-2 font-semibold text-slate-700"
            />
            <datalist id="obs-status-list">
              {OBS_STATUS_PADRAO.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>

          <div className="lg:col-span-1">
            <button
              type="submit"
              className="w-full py-2 px-3 bg-verde-600 hover:bg-verde-500 text-white font-black rounded-xl transition flex items-center justify-center gap-1 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Incluir</span>
            </button>
          </div>
        </div>
      </form>

      {fieldAlert && (
        <div
          className={`p-3.5 rounded-xl border-2 flex items-start justify-between gap-3 shadow-md ${
            fieldAlert.type === 'error'
              ? 'bg-rose-50 border-rose-500 text-rose-950 animate-alert-blink'
              : 'bg-amber-50 border-amber-500 text-amber-950 animate-amber-blink'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <div className="relative shrink-0 mt-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <AlertCircle
                className={`relative w-5 h-5 animate-fast-blink ${
                  fieldAlert.type === 'error' ? 'text-rose-600' : 'text-amber-600'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  Alerta Piscando: Informação Faltando
                </span>
              </div>
              <h4 className="text-xs font-bold mt-1">{fieldAlert.title}</h4>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {fieldAlert.missingFields.map((f) => (
                  <span
                    key={f}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-md flex items-center gap-1 ${
                      fieldAlert.type === 'error'
                        ? 'bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                        : 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
                    ⚠️ {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFieldAlert(null)}
            className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
            title="Fechar Alerta"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {incompleteRecordsCount > 0 && (
        <div className="px-3.5 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 font-semibold shadow-sm animate-amber-blink">
          <span className="flex items-center gap-2">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-600"></span>
            </span>
            <Bell className="w-4 h-4 text-amber-600 shrink-0 animate-fast-blink" />
            <span>
              Alerta de Auditoria: <strong className="text-rose-700 font-black">{incompleteRecordsCount}</strong> exame(s) com campos pendentes nesta planilha.
            </span>
          </span>
          <button
            type="button"
            onClick={() => setFilterIncompleteOnly((prev) => !prev)}
            className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
              filterIncompleteOnly
                ? 'bg-amber-700 text-white border-amber-800 shadow-xs'
                : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
            }`}
          >
            {filterIncompleteOnly ? 'Mostrar Todas as Linhas' : 'Filtrar Apenas Incompletas'}
          </button>
        </div>
      )}

      {/* ESPELHO FIEL DA PLANILHA ANEXADA (COLUNAS A..K + COLUNAS L..M COM FÓRMULAS) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* TABELA PRINCIPAL DA PLANILHA (COLUNAS A até K) */}
        <div className="xl:col-span-9 bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#6D9EEB] text-slate-950 border-b border-slate-400 text-[11px] font-extrabold uppercase">
                  <th className="py-2 px-2 border-r border-slate-400 w-10 text-center">
                    Nº
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-24">
                    PEDIDO EMED
                  </th>
                  <th className="py-2 px-3 border-r border-slate-400 min-w-[200px]">
                    NOME PACIENTE
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-28 text-center">
                    DATA REALIZADO
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-32">
                    CONVÊNIO
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-36">
                    UNIDADE INDICADORA
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-28">
                    MÉDICO/OPTO
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-28 text-right">
                    REPASSE REALIZAÇÃO
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-28 text-right">
                    VALOR EXAME
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-32">
                    EXAMES
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-400 w-32">
                    obs
                  </th>
                  <th className="py-2 px-2 w-20 text-center no-print">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {Array.from({ length: totalDisplayRows }).map((_, index) => {
                  const rowNum = index + 1;
                  const record = activeDisplayRecords[index];

                  if (!record) {
                    return (
                      <tr
                        key={`empty-${rowNum}`}
                        onClick={() => onOpenNewModal({ seqNumber: rowNum })}
                        className="hover:bg-oftalmo-50/40 transition cursor-pointer h-8"
                        title="Clique para preencher esta linha da planilha"
                      >
                        <td className="py-1 px-2 border-r border-slate-300 text-center font-mono text-slate-600">
                          {rowNum}
                        </td>
                        <td className="py-1 px-2 border-r border-slate-300" />
                        <td className="py-1 px-2 border-r border-slate-300" />
                        <td className="py-1 px-2 border-r border-slate-300" />
                        <td className="py-1 px-2 border-r border-slate-300">
                          <div className="bg-slate-200/70 rounded-full h-4 px-2 flex items-center justify-end text-[10px] text-slate-500">
                            ▾
                          </div>
                        </td>
                        <td className="py-1 px-2 border-r border-slate-300">
                          <div className="bg-slate-200/70 rounded-full h-4 px-2 flex items-center justify-end text-[10px] text-slate-500">
                            ▾
                          </div>
                        </td>
                        <td className="py-1 px-2 border-r border-slate-300">
                          <div className="bg-slate-200/70 rounded-full h-4 px-2 flex items-center justify-end text-[10px] text-slate-500">
                            ▾
                          </div>
                        </td>
                        <td className="py-1 px-2 border-r border-slate-300" />
                        <td className="py-1 px-2 border-r border-slate-300" />
                        <td className="py-1 px-2 border-r border-slate-300">
                          <div className="bg-slate-200/70 rounded-full h-4 px-2 flex items-center justify-end text-[10px] text-slate-500">
                            ▾
                          </div>
                        </td>
                        <td className="py-1 px-2 border-r border-slate-300" />
                        <td className="py-1 px-2 text-center text-[10px] text-slate-400">
                          +
                        </td>
                      </tr>
                    );
                  }

                  const isEditing =
                    editingRowId === record.id && editDraft !== null;

                  if (isEditing && editDraft) {
                    return (
                      <tr key={record.id} className="bg-oftalmo-50">
                        <td className="py-1 px-1.5 border-r border-slate-300 text-center font-mono">
                          {rowNum}
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <input
                            type="text"
                            value={editDraft.pedidoEmed}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                pedidoEmed: e.target.value,
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono"
                          />
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <input
                            type="text"
                            value={editDraft.pacienteNome}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                pacienteNome: e.target.value.toUpperCase(),
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs uppercase font-bold"
                          />
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <input
                            type="date"
                            value={editDraft.dataRealizado}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                dataRealizado: e.target.value,
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono"
                          />
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <select
                            value={editDraft.convenio}
                            onChange={(e) => {
                              const newConv = e.target.value;
                              const auto = resolveAutoPrice(
                                newConv,
                                editDraft.exameTipo,
                                pricingRules
                              );
                              setEditDraft({
                                ...editDraft,
                                convenio: newConv,
                                valorExame: auto.valorExame,
                                repasseValor: auto.repasseValor,
                              });
                            }}
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs"
                          >
                            {CONVENIOS_PADRAO.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <select
                            value={editDraft.unidadeIndicadora}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                unidadeIndicadora: e.target.value,
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs"
                          >
                            {UNIDADES_INDICADORAS_PADRAO.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <input
                            type="text"
                            value={editDraft.medicoOpto}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                medicoOpto: e.target.value.toUpperCase(),
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs uppercase"
                          />
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <input
                            type="number"
                            step="0.01"
                            value={editDraft.repasseValor}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                repasseValor: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono text-right"
                          />
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <input
                            type="number"
                            step="0.01"
                            value={editDraft.valorExame}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                valorExame: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono text-right"
                          />
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <select
                            value={editDraft.exameTipo}
                            onChange={(e) => {
                              const newEx = e.target.value;
                              const auto = resolveAutoPrice(
                                editDraft.convenio,
                                newEx,
                                pricingRules
                              );
                              setEditDraft({
                                ...editDraft,
                                exameTipo: newEx,
                                valorExame: auto.valorExame,
                                repasseValor: auto.repasseValor,
                              });
                            }}
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold"
                          >
                            {TODOS_EXAMES.map((ex) => (
                              <option key={ex} value={ex}>
                                {ex}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 px-1.5 border-r border-slate-300">
                          <input
                            type="text"
                            value={editDraft.observacoes || ''}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                observacoes: e.target.value,
                              })
                            }
                            className="w-full px-1 py-0.5 bg-white border border-slate-300 rounded text-xs"
                          />
                        </td>
                        <td className="py-1 px-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(record.id)}
                            className="px-2 py-0.5 bg-verde-600 text-white rounded text-[10px] font-bold cursor-pointer"
                          >
                            Salvar
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const isSaoMiguel = record.convenio
                    .toUpperCase()
                    .includes('SÃO MIGUEL');

                  return (
                    <tr
                      key={record.id}
                      onDoubleClick={() => {
                        setEditingRowId(record.id);
                        setEditDraft({
                          seqNumber: record.seqNumber,
                          pedidoEmed: record.pedidoEmed,
                          pacienteNome: record.pacienteNome,
                          dataRealizado: record.dataRealizado,
                          convenio: record.convenio,
                          unidadeIndicadora: record.unidadeIndicadora,
                          medicoOpto: record.medicoOpto,
                          repasseValor: record.repasseValor,
                          valorExame: record.valorExame,
                          exameTipo: record.exameTipo,
                          observacoes: record.observacoes,
                        });
                      }}
                      className="hover:bg-oftalmo-50/60 transition h-8"
                      title="Duplo clique para editar diretamente na planilha"
                    >
                      <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono text-slate-800">
                        {rowNum}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono text-slate-900">
                        {record.pedidoEmed}
                      </td>
                      <td className="py-1.5 px-3 border-r border-slate-300 font-semibold text-slate-900">
                        {(() => {
                          const rowAudit = getMissingExamFields(record);
                          return (
                            <div className="flex flex-col">
                              <span>{record.pacienteNome}</span>
                              {rowAudit.allMissing.length > 0 && (
                                <span
                                  title={`Campos pendentes: ${rowAudit.allMissing.join(', ')}`}
                                  className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-amber-950 bg-amber-100 border border-amber-400 rounded px-1.5 py-0.5 font-bold w-fit animate-amber-blink shadow-xs"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping shrink-0" />
                                  <AlertCircle className="w-3 h-3 text-amber-700 shrink-0 animate-fast-blink" />
                                  <span>Falta: {rowAudit.allMissing.join(', ')}</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono text-center text-slate-900">
                        {formatDateBR(record.dataRealizado)}
                      </td>
                      <td className="py-1.5 px-2 border-r border-slate-300">
                        <span
                          className={`inline-flex items-center justify-between w-full px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSaoMiguel
                              ? 'bg-[#EA9999] text-[#660000]'
                              : record.convenio === 'PARTICULAR'
                              ? 'bg-amber-200 text-amber-950'
                              : 'bg-sky-200 text-sky-950'
                          }`}
                        >
                          <span className="truncate">{record.convenio}</span>
                          <span className="ml-1">▾</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 text-slate-800 font-medium">
                        {record.unidadeIndicadora}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 text-slate-800 font-medium">
                        {record.medicoOpto}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono text-right text-slate-900">
                        {formatCurrencyBRL(record.repasseValor)}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono text-right font-semibold text-slate-900">
                        {formatCurrencyBRL(record.valorExame)}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-bold text-slate-900">
                        {record.exameTipo}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 text-slate-600">
                        {record.observacoes}
                      </td>
                      <td className="py-1.5 px-2 text-center no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRowId(record.id);
                              setEditDraft({
                                seqNumber: record.seqNumber,
                                pedidoEmed: record.pedidoEmed,
                                pacienteNome: record.pacienteNome,
                                dataRealizado: record.dataRealizado,
                                convenio: record.convenio,
                                unidadeIndicadora: record.unidadeIndicadora,
                                medicoOpto: record.medicoOpto,
                                repasseValor: record.repasseValor,
                                valorExame: record.valorExame,
                                exameTipo: record.exameTipo,
                                observacoes: record.observacoes,
                              });
                            }}
                            className="text-[10px] font-bold text-oftalmo-700 hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(record.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Excluir linha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* COLUNAS L & M DA PLANILHA (FÓRMULAS DE CONTAGEM EXATAS DA IMAGEM E DO CSV) */}
        <aside className="xl:col-span-3 space-y-4">
          <div className="bg-white border border-slate-300 shadow-sm overflow-hidden">
            <div className="bg-black text-white px-3 py-2 text-xs font-bold">
              Formula de Contagem São Miguel Saúde
            </div>
            <div className="bg-[#00FF00] text-black py-2 px-3 text-center font-mono text-base font-bold border-b border-slate-300">
              {summary.countSaoMiguel}
            </div>

            <div className="h-4 bg-white" />

            <div className="bg-black text-white px-3 py-2 text-xs font-bold">
              Formula de Contagem Particular
            </div>
            <div className="bg-[#E69138] text-black py-2 px-3 text-center font-mono text-base font-bold border-b border-slate-300">
              {summary.countParticular}
            </div>

            <div className="h-4 bg-white" />

            <div className="bg-black text-white px-3 py-2 text-xs font-bold">
              Formula de Contagem Part/Ato
            </div>
            <div className="bg-[#9FC5E8] text-black py-2 px-3 text-center font-mono text-base font-bold">
              {summary.countPartAto}
            </div>
          </div>

          <div className="bg-white border-2 border-black shadow-sm overflow-hidden">
            <div className="bg-[#4A86E8] text-black py-1.5 px-3 text-center text-xs font-bold border-b border-black">
              EXAMES
            </div>
            <table className="w-full text-xs border-collapse">
              <tbody className="divide-y divide-slate-400">
                {EXAMES_PLANILHA_OFICIAL.map((ex) => (
                  <tr key={ex}>
                    <td className="py-1.5 px-2.5 font-medium text-black border-r border-black">
                      {ex}
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-right font-semibold text-black w-16">
                      {summary.examCounts[ex] || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-black text-white font-bold">
                  <td className="py-2 px-2.5 text-center border-r border-slate-700">
                    TOTAL
                  </td>
                  <td className="py-2 px-2.5 font-mono text-center">
                    {summary.totalExames}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </aside>
      </div>
    </div>
  );
};
