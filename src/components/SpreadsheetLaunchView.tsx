import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Search,
  Sparkles,
  Check,
  FileSpreadsheet,
  ClipboardPaste,
  Layers,
  Edit3,
  X,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
  Bell,
} from 'lucide-react';
import {
  CONVENIOS_PADRAO,
  UNIDADES_INDICADORAS_PADRAO,
  MEDICOS_OPTO_PADRAO,
  TODOS_EXAMES,
  EXAMES_PLANILHA_OFICIAL,
  KITS_DIAGNOSTICOS,
  CustomPricingRuleDoc,
  resolveAutoPrice,
  formatCurrencyBRL,
  formatDateBR,
  parseBRDateToISO,
  VALIDATION_LIMITS,
  getMissingExamFields,
} from '../constants/diagnosticCatalog';
import {
  ExamRecordDoc,
  NewExamInput,
  createExamRecord,
  createBatchExamRecords,
  updateExamRecord,
  removeExamRecord,
} from '../services/examService';

interface SpreadsheetLaunchViewProps {
  userId: string;
  records: ExamRecordDoc[];
  allRecords: ExamRecordDoc[];
  pricingRules: CustomPricingRuleDoc[];
  defaultUnidade: string;
  selectedMonth: string;
  loading: boolean;
  onSeedSample: () => Promise<void>;
}

type LaunchMode = 'single' | 'multi' | 'paste';

export const SpreadsheetLaunchView: React.FC<SpreadsheetLaunchViewProps> = ({
  userId,
  records,
  allRecords,
  pricingRules,
  defaultUnidade,
  selectedMonth,
  loading,
  onSeedSample,
}) => {
  const todayISO = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const current = `${yyyy}-${mm}-${dd}`;
    return current.startsWith(selectedMonth) ? current : `${selectedMonth}-08`;
  }, [selectedMonth]);

  const [launchMode, setLaunchMode] = useState<LaunchMode>('single');
  const [submitting, setSubmitting] = useState(false);

  // Quick Launch Form State
  const [pedidoEmed, setPedidoEmed] = useState('');
  const [pacienteNome, setPacienteNome] = useState('');
  const [dataRealizado, setDataRealizado] = useState(todayISO);
  const [convenio, setConvenio] = useState<string>('SÃO MIGUEL SAÚDE');
  const [unidadeIndicadora, setUnidadeIndicadora] = useState<string>(
    defaultUnidade || 'SÃO MATEUS 1'
  );
  const [medicoOpto, setMedicoOpto] = useState<string>('DR. LUCAS CLEMENTE');
  const [exameTipo, setExameTipo] = useState<string>('OCT');
  const [valorExame, setValorExame] = useState<number>(180);
  const [repasseValor, setRepasseValor] = useState<number>(45);
  const [autoPriceEnabled, setAutoPriceEnabled] = useState<boolean>(true);

  // Multi-exam selection state
  const [selectedMultiExams, setSelectedMultiExams] = useState<string[]>([
    'OCT',
    'RETINOGRAFIA',
  ]);

  // Paste batch state
  const [pasteRawText, setPasteRawText] = useState('');

  // Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterConvenio, setFilterConvenio] = useState<string>('TODOS');
  const [filterExame, setFilterExame] = useState<string>('TODOS');
  const [filterUnidade, setFilterUnidade] = useState<string>('TODAS');
  const [filterIncompleteOnly, setFilterIncompleteOnly] = useState(false);

  // Alerta de validação e campos faltantes
  const [fieldAlert, setFieldAlert] = useState<{
    type: 'error' | 'warning';
    title: string;
    missingFields: string[];
  } | null>(null);

  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NewExamInput | null>(null);
  const [autoFillBanner, setAutoFillBanner] = useState<string | null>(null);

  useEffect(() => {
    setDataRealizado((prev) =>
      prev.startsWith(selectedMonth) ? prev : `${selectedMonth}-08`
    );
  }, [selectedMonth]);

  // Auto-update Valor Exame and Repasse whenever Convênio or Exame changes
  useEffect(() => {
    if (!autoPriceEnabled) return;
    const calculated = resolveAutoPrice(convenio, exameTipo, pricingRules);
    setValorExame(calculated.valorExame);
    setRepasseValor(calculated.repasseValor);
  }, [convenio, exameTipo, pricingRules, autoPriceEnabled]);

  // Auto-complete Patient/Convenio/Medico when Pedido eMed or Nome Paciente matches existing history
  const handlePedidoOrPacienteLookup = (
    newPedido: string,
    newPaciente: string
  ) => {
    const cleanPed = newPedido.trim().toUpperCase();
    const cleanPac = newPaciente.trim().toUpperCase();

    if (cleanPed.length >= 3) {
      const matchByPedido = allRecords.find(
        (r) => r.pedidoEmed.trim().toUpperCase() === cleanPed
      );
      if (matchByPedido) {
        if (!pacienteNome) setPacienteNome(matchByPedido.pacienteNome);
        setConvenio(matchByPedido.convenio);
        if (matchByPedido.unidadeIndicadora)
          setUnidadeIndicadora(matchByPedido.unidadeIndicadora);
        if (matchByPedido.medicoOpto) setMedicoOpto(matchByPedido.medicoOpto);
        setAutoFillBanner(
          `Dados preenchidos automaticamente do Pedido eMed #${matchByPedido.pedidoEmed} (${matchByPedido.pacienteNome})`
        );
        return;
      }
    }

    if (cleanPac.length >= 6) {
      const matchByName = allRecords.find(
        (r) => r.pacienteNome.trim().toUpperCase() === cleanPac
      );
      if (matchByName) {
        if (!pedidoEmed && matchByName.pedidoEmed)
          setPedidoEmed(matchByName.pedidoEmed);
        setConvenio(matchByName.convenio);
        if (matchByName.unidadeIndicadora)
          setUnidadeIndicadora(matchByName.unidadeIndicadora);
        if (matchByName.medicoOpto) setMedicoOpto(matchByName.medicoOpto);
        setAutoFillBanner(
          `Convênio e médico preenchidos do histórico de ${matchByName.pacienteNome}`
        );
      }
    }
  };

  // Next sequential number in current month
  const nextSeqNumber = useMemo(() => {
    if (records.length === 0) return 1;
    const maxSeq = records.reduce(
      (max, r) => (r.seqNumber > max ? r.seqNumber : max),
      0
    );
    return maxSeq + 1;
  }, [records]);

  // Filtered rows
  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        if (filterConvenio !== 'TODOS' && r.convenio !== filterConvenio)
          return false;
        if (filterExame !== 'TODOS' && r.exameTipo !== filterExame)
          return false;
        if (
          filterUnidade !== 'TODAS' &&
          r.unidadeIndicadora !== filterUnidade
        )
          return false;
        if (filterIncompleteOnly) {
          const audit = getMissingExamFields(r);
          if (audit.isValid && audit.allMissing.length === 0) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toUpperCase();
          const matchNome = r.pacienteNome.toUpperCase().includes(q);
          const matchPedido = r.pedidoEmed.toUpperCase().includes(q);
          const matchMedico = r.medicoOpto.toUpperCase().includes(q);
          const matchExame = r.exameTipo.toUpperCase().includes(q);
          if (!matchNome && !matchPedido && !matchMedico && !matchExame)
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.seqNumber !== b.seqNumber) return a.seqNumber - b.seqNumber;
        return a.dataRealizado.localeCompare(b.dataRealizado);
      });
  }, [records, filterConvenio, filterExame, filterUnidade, searchQuery, filterIncompleteOnly]);

  const incompleteRecordsCount = useMemo(() => {
    return records.filter((r) => {
      const audit = getMissingExamFields(r);
      return !audit.isValid || audit.allMissing.length > 0;
    }).length;
  }, [records]);

  // Right-side Spreadsheet Formulas Summary (Calculated on the active month records)
  const spreadsheetFormulas = useMemo(() => {
    let countSaoMiguel = 0;
    let countParticular = 0;
    let countPartAto = 0;
    let countOutrosConvenios = 0;

    const examCounts: Record<string, number> = {};
    for (const ex of EXAMES_PLANILHA_OFICIAL) {
      examCounts[ex] = 0;
    }
    let outrosExamesCount = 0;
    let totalValor = 0;
    let totalRepasse = 0;

    for (const r of records) {
      const conv = r.convenio.trim().toUpperCase();
      if (conv.includes('SÃO MIGUEL') || conv.includes('SAO MIGUEL')) {
        countSaoMiguel++;
      } else if (conv === 'PARTICULAR') {
        countParticular++;
      } else if (conv.includes('PART/ATO') || conv.includes('ATO')) {
        countPartAto++;
      } else {
        countOutrosConvenios++;
      }

      const ex = r.exameTipo.trim().toUpperCase();
      if (ex in examCounts) {
        examCounts[ex] += 1;
      } else {
        outrosExamesCount += 1;
      }

      totalValor += r.valorExame || 0;
      totalRepasse += r.repasseValor || 0;
    }

    return {
      countSaoMiguel,
      countParticular,
      countPartAto,
      countOutrosConvenios,
      examCounts,
      outrosExamesCount,
      totalExames: records.length,
      totalValor,
      totalRepasse,
    };
  }, [records]);

  // Unique autocomplete suggestions from existing records
  const patientSuggestions = useMemo(() => {
    const map = new Map<string, ExamRecordDoc>();
    for (const r of allRecords) {
      const key = r.pacienteNome.trim().toUpperCase();
      if (key && !map.has(key)) {
        map.set(key, r);
      }
    }
    return Array.from(map.values()).slice(0, 40);
  }, [allRecords]);

  // Handle Single Launch Submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const audit = getMissingExamFields({
      pacienteNome,
      pedidoEmed,
      dataRealizado,
      convenio,
      unidadeIndicadora,
      medicoOpto,
      exameTipo,
      valorExame,
      repasseValor,
    });

    if (!audit.isValid) {
      setFieldAlert({
        type: 'error',
        title: 'Não é possível lançar o exame! Campos obrigatórios faltando:',
        missingFields: audit.missingRequired,
      });
      return;
    }

    if (audit.missingRecommended.length > 0) {
      setFieldAlert({
        type: 'warning',
        title: 'Atenção: Exame lançado, mas com informações pendentes:',
        missingFields: audit.missingRecommended,
      });
    } else {
      setFieldAlert(null);
    }

    setSubmitting(true);
    try {
      await createExamRecord(userId, {
        seqNumber: nextSeqNumber,
        pedidoEmed,
        pacienteNome: pacienteNome.trim().toUpperCase(),
        dataRealizado,
        convenio,
        unidadeIndicadora,
        medicoOpto,
        repasseValor,
        valorExame,
        exameTipo,
      });
      setPacienteNome('');
      setPedidoEmed('');
      setAutoFillBanner(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Multi-Exam / Kit Submit for the same patient
  const handleMultiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const audit = getMissingExamFields({
      pacienteNome,
      pedidoEmed,
      dataRealizado,
      convenio,
      unidadeIndicadora,
      medicoOpto,
      exameTipo: selectedMultiExams[0] || '',
      valorExame: 100,
    });

    const missing = [...audit.missingRequired];
    if (selectedMultiExams.length === 0) {
      missing.push('Selecione pelo menos 1 exame');
    }

    if (missing.length > 0) {
      setFieldAlert({
        type: 'error',
        title: 'Não é possível lançar múltiplos exames! Campos obrigatórios faltando:',
        missingFields: missing,
      });
      return;
    }

    if (audit.missingRecommended.length > 0) {
      setFieldAlert({
        type: 'warning',
        title: 'Atenção: Exames lançados, mas com informações pendentes:',
        missingFields: audit.missingRecommended,
      });
    } else {
      setFieldAlert(null);
    }

    setSubmitting(true);
    try {
      const inputs: NewExamInput[] = selectedMultiExams.map((exam, idx) => {
        const auto = resolveAutoPrice(convenio, exam, pricingRules);
        return {
          seqNumber: nextSeqNumber + idx,
          pedidoEmed,
          pacienteNome: pacienteNome.trim().toUpperCase(),
          dataRealizado,
          convenio,
          unidadeIndicadora,
          medicoOpto,
          repasseValor: auto.repasseValor,
          valorExame: auto.valorExame,
          exameTipo: exam,
        };
      });
      await createBatchExamRecords(userId, inputs);
      setPacienteNome('');
      setPedidoEmed('');
      setAutoFillBanner(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Paste from Excel / eMed
  const handlePasteBatchSubmit = async () => {
    if (!pasteRawText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const lines = pasteRawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const batchInputs: NewExamInput[] = [];
      lines.forEach((line, idx) => {
        // Supports tab-separated or semicolon-separated lines:
        // Format A (Full sheet copy): [Nº] | PEDIDO EMED | NOME PACIENTE | DATA | CONVÊNIO | UNIDADE | MÉDICO | REPASSE | VALOR | EXAME
        // Format B (Quick 4 cols): PEDIDO EMED | NOME PACIENTE | CONVÊNIO | EXAME
        const cols = line.includes('\t')
          ? line.split('\t').map((c) => c.trim())
          : line.split(';').map((c) => c.trim());

        if (cols.length >= 8) {
          // Check if first col is sequential number
          const hasSeqFirst = /^\d+$/.test(cols[0]) && cols.length >= 9;
          const offset = hasSeqFirst ? 1 : 0;
          const ped = cols[offset] || '';
          const pac = cols[offset + 1] || 'PACIENTE';
          const dt = parseBRDateToISO(cols[offset + 2] || '', dataRealizado);
          const conv = (cols[offset + 3] || convenio).toUpperCase();
          const unid = (cols[offset + 4] || unidadeIndicadora).toUpperCase();
          const med = (cols[offset + 5] || medicoOpto).toUpperCase();
          const ex = (
            cols[offset + 8] ||
            cols[cols.length - 1] ||
            exameTipo
          ).toUpperCase();
          const auto = resolveAutoPrice(conv, ex, pricingRules);
          const rep =
            parseFloat((cols[offset + 6] || '').replace(',', '.')) ||
            auto.repasseValor;
          const val =
            parseFloat((cols[offset + 7] || '').replace(',', '.')) ||
            auto.valorExame;

          batchInputs.push({
            seqNumber: nextSeqNumber + idx,
            pedidoEmed: ped,
            pacienteNome: pac,
            dataRealizado: dt,
            convenio: conv,
            unidadeIndicadora: unid,
            medicoOpto: med,
            repasseValor: rep,
            valorExame: val,
            exameTipo: ex,
          });
        } else if (cols.length >= 2) {
          // Format B: PEDIDO | PACIENTE | [CONVENIO] | [EXAME]
          const ped = cols.length >= 3 ? cols[0] : '';
          const pac = cols.length >= 3 ? cols[1] : cols[0];
          const conv = (
            cols.length >= 4 ? cols[2] : convenio
          ).toUpperCase();
          const ex = (
            cols.length >= 4
              ? cols[3]
              : cols.length === 3
              ? cols[2]
              : cols[1]
          ).toUpperCase();
          const auto = resolveAutoPrice(conv, ex, pricingRules);

          batchInputs.push({
            seqNumber: nextSeqNumber + idx,
            pedidoEmed: ped,
            pacienteNome: pac,
            dataRealizado,
            convenio: conv,
            unidadeIndicadora,
            medicoOpto,
            repasseValor: auto.repasseValor,
            valorExame: auto.valorExame,
            exameTipo: ex,
          });
        }
      });

      if (batchInputs.length > 0) {
        await createBatchExamRecords(userId, batchInputs);
        setPasteRawText('');
        setLaunchMode('single');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Duplicate Row for Same Patient (allows rapid 1-click addition of another exam for same patient)
  const handleDuplicatePatientForNewExam = (record: ExamRecordDoc) => {
    setLaunchMode('single');
    setPedidoEmed(record.pedidoEmed);
    setPacienteNome(record.pacienteNome);
    setDataRealizado(record.dataRealizado);
    setConvenio(record.convenio);
    setUnidadeIndicadora(record.unidadeIndicadora);
    setMedicoOpto(record.medicoOpto);
    setAutoFillBanner(
      `Paciente "${record.pacienteNome}" carregado no formulário acima — basta escolher o próximo exame e clicar em Lançar.`
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEditing = (record: ExamRecordDoc) => {
    setEditingId(record.id);
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
  };

  const handleSaveEdit = async (recordId: string) => {
    if (!editDraft || submitting) return;
    const audit = getMissingExamFields(editDraft);
    if (!audit.isValid) {
      setFieldAlert({
        type: 'error',
        title: 'Não foi possível salvar alteração! Campos obrigatórios faltando:',
        missingFields: audit.missingRequired,
      });
      return;
    }

    setSubmitting(true);
    try {
      await updateExamRecord(recordId, userId, editDraft);
      setEditingId(null);
      setEditDraft(null);
      if (audit.missingRecommended.length > 0) {
        setFieldAlert({
          type: 'warning',
          title: 'Atenção: Registro atualizado, mas continua com dados pendentes:',
          missingFields: audit.missingRecommended,
        });
      } else {
        setFieldAlert(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMultiExam = (exam: string) => {
    setSelectedMultiExams((prev) =>
      prev.includes(exam) ? prev.filter((e) => e !== exam) : [...prev, exam]
    );
  };

  const applyKit = (exames: string[]) => {
    setSelectedMultiExams(exames);
  };

  return (
    <div className="space-y-6">
      {/* 1. SMART AUTO-FILL LAUNCH BAR */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Lançamento Automático de Exames — São Mateus 1
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Valores e repasses são preenchidos automaticamente conforme o Convênio e o Exame selecionado.
            </p>
          </div>

          {/* Mode Selector Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setLaunchMode('single')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                launchMode === 'single'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Lançamento Rápido
            </button>
            <button
              type="button"
              onClick={() => setLaunchMode('multi')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                launchMode === 'multi'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Multi-Exames / Kits (Mesmo Paciente)
            </button>
            <button
              type="button"
              onClick={() => setLaunchMode('paste')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                launchMode === 'paste'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              Colar Planilha / eMed
            </button>
          </div>
        </div>

        {fieldAlert && (
          <div
            className={`mb-4 p-3.5 rounded-xl border-2 flex items-start justify-between gap-3 shadow-md ${
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

        {autoFillBanner && (
          <div className="mb-4 px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs text-blue-900">
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              {autoFillBanner}
            </span>
            <button
              type="button"
              onClick={() => setAutoFillBanner(null)}
              className="text-blue-700 hover:text-blue-950 font-medium ml-4"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Datalists for Autocomplete */}
        <datalist id="pacientes-historico">
          {patientSuggestions.map((p) => (
            <option key={p.id} value={p.pacienteNome}>
              {p.convenio} · Pedido #{p.pedidoEmed}
            </option>
          ))}
        </datalist>
        <datalist id="convenios-list">
          {CONVENIOS_PADRAO.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="unidades-list">
          {UNIDADES_INDICADORAS_PADRAO.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <datalist id="medicos-list">
          {MEDICOS_OPTO_PADRAO.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        {launchMode === 'single' && (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nº
                </label>
                <input
                  type="text"
                  readOnly
                  value={nextSeqNumber}
                  className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Pedido eMed
                </label>
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.PEDIDO_EMED_MAX}
                  placeholder="Ex: 48291"
                  value={pedidoEmed}
                  onChange={(e) => {
                    setPedidoEmed(e.target.value);
                    handlePedidoOrPacienteLookup(e.target.value, pacienteNome);
                  }}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nome do Paciente *
                </label>
                <input
                  type="text"
                  required
                  list="pacientes-historico"
                  maxLength={VALIDATION_LIMITS.PACIENTE_NOME_MAX}
                  placeholder="Ex: NEIDE RIBEIRO DA SILVA"
                  value={pacienteNome}
                  onChange={(e) => {
                    setPacienteNome(e.target.value.toUpperCase());
                    handlePedidoOrPacienteLookup(pedidoEmed, e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 uppercase"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Data Realizado *
                </label>
                <input
                  type="date"
                  required
                  value={dataRealizado}
                  onChange={(e) => setDataRealizado(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Convênio *
                </label>
                <select
                  value={convenio}
                  onChange={(e) => setConvenio(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                >
                  {CONVENIOS_PADRAO.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Unidade Indicadora
                </label>
                <select
                  value={unidadeIndicadora}
                  onChange={(e) => setUnidadeIndicadora(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {UNIDADES_INDICADORAS_PADRAO.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Médico / Opto
                </label>
                <input
                  type="text"
                  list="medicos-list"
                  maxLength={VALIDATION_LIMITS.MEDICO_MAX}
                  placeholder="Selecione ou digite..."
                  value={medicoOpto}
                  onChange={(e) => setMedicoOpto(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 uppercase"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Exame Realizado *
                </label>
                <select
                  value={exameTipo}
                  onChange={(e) => setExameTipo(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-slate-900"
                >
                  <optgroup label="Exames da Planilha Oficial">
                    {EXAMES_PLANILHA_OFICIAL.map((ex) => (
                      <option key={ex} value={ex}>
                        {ex}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Outros Exames Oftalmológicos">
                    {TODOS_EXAMES.filter(
                      (ex) => !(EXAMES_PLANILHA_OFICIAL as readonly string[]).includes(ex)
                    ).map((ex) => (
                      <option key={ex} value={ex}>
                        {ex}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Repasse de Realização (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={VALIDATION_LIMITS.VALOR_MAX}
                  value={repasseValor}
                  onChange={(e) => {
                    setAutoPriceEnabled(false);
                    setRepasseValor(parseFloat(e.target.value) || 0);
                  }}
                  className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={VALIDATION_LIMITS.VALOR_MAX}
                  value={valorExame}
                  onChange={(e) => {
                    setAutoPriceEnabled(false);
                    setValorExame(parseFloat(e.target.value) || 0);
                  }}
                  className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {submitting ? 'Salvando...' : 'Lançar na Planilha'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoPriceEnabled}
                    onChange={(e) => setAutoPriceEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Preencher Valor e Repasse de Realização automaticamente pela tabela</span>
                </label>
              </div>
              <span>
                Dica: Ao digitar um Pedido eMed ou Paciente já atendido no dia, o sistema preenche Convênio, Unidade e Médico sozinho.
              </span>
            </div>
          </form>
        )}

        {launchMode === 'multi' && (
          <form onSubmit={handleMultiSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Pedido eMed
                </label>
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.PEDIDO_EMED_MAX}
                  placeholder="Ex: 48291"
                  value={pedidoEmed}
                  onChange={(e) => setPedidoEmed(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nome do Paciente *
                </label>
                <input
                  type="text"
                  required
                  list="pacientes-historico"
                  maxLength={VALIDATION_LIMITS.PACIENTE_NOME_MAX}
                  placeholder="Ex: NEIDE RIBEIRO DA SILVA"
                  value={pacienteNome}
                  onChange={(e) =>
                    setPacienteNome(e.target.value.toUpperCase())
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg uppercase"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Data Realizado *
                </label>
                <input
                  type="date"
                  required
                  value={dataRealizado}
                  onChange={(e) => setDataRealizado(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Convênio *
                </label>
                <select
                  value={convenio}
                  onChange={(e) => setConvenio(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {CONVENIOS_PADRAO.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Médico / Opto
                </label>
                <input
                  type="text"
                  list="medicos-list"
                  value={medicoOpto}
                  onChange={(e) => setMedicoOpto(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg uppercase"
                />
              </div>
            </div>

            {/* Kits de 1-Clique */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">
                  1. Protocolos Rápidos (1-Clique seleciona vários exames):
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {KITS_DIAGNOSTICOS.map((kit) => (
                  <button
                    key={kit.id}
                    type="button"
                    onClick={() => applyKit(kit.exames)}
                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <span className="font-semibold">{kit.nome}</span>
                    <span className="text-slate-500 ml-1.5">
                      ({kit.exames.length} exames)
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Checkboxes de Exames */}
            <div className="pt-1">
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                2. Ou marque os exames realizados pelo paciente ({selectedMultiExams.length} selecionados):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {TODOS_EXAMES.map((exam) => {
                  const isSelected = selectedMultiExams.includes(exam);
                  const price = resolveAutoPrice(convenio, exam, pricingRules);
                  return (
                    <button
                      key={exam}
                      type="button"
                      onClick={() => toggleMultiExam(exam)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 border-blue-600 text-blue-950'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold truncate">
                          {exam}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                        {formatCurrencyBRL(price.valorExame)} · Rep:{' '}
                        {formatCurrencyBRL(price.repasseValor)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={
                  submitting ||
                  !pacienteNome.trim() ||
                  selectedMultiExams.length === 0
                }
                className="py-2 px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                {submitting
                  ? 'Gerando lançamentos...'
                  : `Lançar ${selectedMultiExams.length} Exame(s) para este Paciente`}
              </button>
            </div>
          </form>
        )}

        {launchMode === 'paste' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Cole abaixo linhas copiadas diretamente do Excel/Google Planilhas ou digite no formato{' '}
              <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                PEDIDO_EMED ; NOME_PACIENTE ; CONVENIO ; EXAME
              </code>{' '}
              (uma linha por exame). O sistema calcula os valores e repasses automaticamente:
            </p>
            <textarea
              rows={4}
              value={pasteRawText}
              onChange={(e) => setPasteRawText(e.target.value)}
              placeholder={`Exemplo:\n48290 ; NEIDE RIBEIRO DA SILVA ; SÃO MIGUEL SAÚDE ; OCT\n48290 ; NEIDE RIBEIRO DA SILVA ; SÃO MIGUEL SAÚDE ; RETINOGRAFIA\n48295 ; CARLOS EDUARDO SOUZA ; PARTICULAR ; PENTACAN`}
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPasteRawText('')}
                className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Limpar
              </button>
              <button
                type="button"
                disabled={submitting || !pasteRawText.trim()}
                onClick={handlePasteBatchSubmit}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Importando...'
                  : 'Processar e Lançar Linhas Automaticamente'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2. MAIN WORKSPACE: SPREADSHEET TABLE (LEFT 9 COLS) + LIVE FORMULA SIDEBAR (RIGHT 3 COLS) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT: PLANILHA DE LANÇAMENTOS */}
        <div className="xl:col-span-9 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Filter & Search Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por paciente, pedido eMed, médico ou exame..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterConvenio}
                onChange={(e) => setFilterConvenio(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="TODOS">Todos os Convênios</option>
                {CONVENIOS_PADRAO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={filterExame}
                onChange={(e) => setFilterExame(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="TODOS">Todos os Exames</option>
                {TODOS_EXAMES.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>

              <select
                value={filterUnidade}
                onChange={(e) => setFilterUnidade(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="TODAS">Todas as Unidades</option>
                {UNIDADES_INDICADORAS_PADRAO.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>

              {(filterConvenio !== 'TODOS' ||
                filterExame !== 'TODOS' ||
                filterUnidade !== 'TODAS' ||
                filterIncompleteOnly ||
                searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterConvenio('TODOS');
                    setFilterExame('TODOS');
                    setFilterUnidade('TODAS');
                    setFilterIncompleteOnly(false);
                    setSearchQuery('');
                  }}
                  className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Limpar
                </button>
              )}
            </div>
          </div>

          {incompleteRecordsCount > 0 && (
            <div className="mx-4 mb-3 px-3.5 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 font-semibold shadow-sm animate-amber-blink">
              <span className="flex items-center gap-2">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-600"></span>
                </span>
                <Bell className="w-4 h-4 text-amber-600 shrink-0 animate-fast-blink" />
                <span>
                  Alerta de Auditoria: <strong className="text-rose-700 font-black">{incompleteRecordsCount}</strong> exame(s) com campos pendentes (ex: Pedido eMed, Unidade ou Médico).
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
                {filterIncompleteOnly ? 'Mostrar Todos os Exames' : 'Filtrar Apenas Incompletos'}
              </button>
            </div>
          )}

          {/* High-Density Spreadsheet Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#6D9EEB] text-slate-950 border-b border-slate-300 text-[11px] font-bold tracking-tight">
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-12 text-center">
                    Nº
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-24">
                    PEDIDO EMED
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-300/80 min-w-[210px]">
                    NOME PACIENTE
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-28 text-center">
                    DATA REALIZADO
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-36">
                    CONVÊNIO
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-36">
                    UNIDADE INDICADORA
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-36">
                    MÉDICO/OPTO
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-28 text-right">
                    REPASSE REALIZAÇÃO
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-28 text-right">
                    VALOR EXAME
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 w-36">
                    EXAMES
                  </th>
                  <th className="py-2.5 px-2.5 w-24 text-center no-print">
                    AÇÕES
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {loading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td colSpan={11} className="py-3 px-4">
                        <div className="h-4 bg-slate-100 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 px-6 text-center">
                      <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-800">
                        Nenhum exame lançado neste filtro/competência
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        Utilize a barra de lançamento automático acima ou carregue os dados iniciais de exemplo da unidade São Mateus 1.
                      </p>
                      {records.length === 0 && (
                        <button
                          type="button"
                          onClick={onSeedSample}
                          className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                        >
                          Carregar Planilha Modelo (São Mateus 1)
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((row) => {
                    const isEditing = editingId === row.id && editDraft !== null;

                    if (isEditing && editDraft) {
                      return (
                        <tr key={row.id} className="bg-blue-50/70">
                          <td className="py-1.5 px-2 border-r border-slate-200">
                            <input
                              type="number"
                              value={editDraft.seqNumber}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  seqNumber: parseInt(e.target.value, 10) || 1,
                                })
                              }
                              className="w-12 px-1 py-1 text-xs font-mono bg-white border border-slate-300 rounded text-center"
                            />
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
                            <input
                              type="text"
                              value={editDraft.pedidoEmed}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  pedidoEmed: e.target.value,
                                })
                              }
                              className="w-full px-1.5 py-1 text-xs font-mono bg-white border border-slate-300 rounded"
                            />
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
                            <input
                              type="text"
                              value={editDraft.pacienteNome}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  pacienteNome: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-full px-1.5 py-1 text-xs bg-white border border-slate-300 rounded uppercase"
                            />
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
                            <input
                              type="date"
                              value={editDraft.dataRealizado}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  dataRealizado: e.target.value,
                                })
                              }
                              className="w-full px-1 py-1 text-xs font-mono bg-white border border-slate-300 rounded"
                            />
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
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
                              className="w-full px-1 py-1 text-xs bg-white border border-slate-300 rounded"
                            >
                              {CONVENIOS_PADRAO.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
                            <select
                              value={editDraft.unidadeIndicadora}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  unidadeIndicadora: e.target.value,
                                })
                              }
                              className="w-full px-1 py-1 text-xs bg-white border border-slate-300 rounded"
                            >
                              {UNIDADES_INDICADORAS_PADRAO.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
                            <input
                              type="text"
                              value={editDraft.medicoOpto}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  medicoOpto: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-full px-1.5 py-1 text-xs bg-white border border-slate-300 rounded uppercase"
                            />
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
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
                              className="w-full px-1.5 py-1 text-xs font-mono bg-white border border-slate-300 rounded text-right"
                            />
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
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
                              className="w-full px-1.5 py-1 text-xs font-mono bg-white border border-slate-300 rounded text-right"
                            />
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200">
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
                              className="w-full px-1 py-1 text-xs bg-white border border-slate-300 rounded"
                            >
                              {TODOS_EXAMES.map((ex) => (
                                <option key={ex} value={ex}>
                                  {ex}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(row.id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                title="Salvar"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditDraft(null);
                                }}
                                className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50 transition-colors group"
                      >
                        <td className="py-2 px-2.5 border-r border-slate-200 font-mono tabular-nums text-center text-slate-500">
                          {row.seqNumber}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-200 font-mono tabular-nums text-slate-700">
                          {row.pedidoEmed || '—'}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200 font-medium text-slate-900">
                          {(() => {
                            const rowAudit = getMissingExamFields(row);
                            return (
                              <div className="flex flex-col">
                                <span>{row.pacienteNome}</span>
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
                        <td className="py-2 px-2.5 border-r border-slate-200 font-mono tabular-nums text-center text-slate-700">
                          {formatDateBR(row.dataRealizado)}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-200">
                          <span
                            className={`font-medium ${
                              row.convenio.includes('SÃO MIGUEL')
                                ? 'text-rose-800'
                                : row.convenio === 'PARTICULAR'
                                ? 'text-amber-800'
                                : row.convenio.includes('PART/ATO')
                                ? 'text-sky-800'
                                : 'text-slate-700'
                            }`}
                          >
                            {row.convenio}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-200 text-slate-700">
                          {row.unidadeIndicadora || '—'}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-200 text-slate-700">
                          {row.medicoOpto || '—'}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-200 font-mono tabular-nums text-right text-slate-700">
                          {formatCurrencyBRL(row.repasseValor)}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-200 font-mono tabular-nums text-right font-medium text-slate-900">
                          {formatCurrencyBRL(row.valorExame)}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-200 font-semibold text-slate-900">
                          {row.exameTipo}
                        </td>
                        <td className="py-2 px-2 text-center no-print">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleDuplicatePatientForNewExam(row)
                              }
                              title="Adicionar outro exame para este mesmo paciente"
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditing(row)}
                              title="Editar linha"
                              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeExamRecord(row.id)}
                              title="Excluir linha"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredRecords.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-xs border-t-2 border-slate-300">
                    <td colSpan={7} className="py-2.5 px-3 text-right text-slate-700">
                      TOTAL ({filteredRecords.length} exames listados):
                    </td>
                    <td className="py-2.5 px-2.5 font-mono tabular-nums text-right text-emerald-800">
                      {formatCurrencyBRL(
                        filteredRecords.reduce(
                          (acc, r) => acc + (r.repasseValor || 0),
                          0
                        )
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 font-mono tabular-nums text-right text-slate-950">
                      {formatCurrencyBRL(
                        filteredRecords.reduce(
                          (acc, r) => acc + (r.valorExame || 0),
                          0
                        )
                      )}
                    </td>
                    <td colSpan={2} className="py-2.5 px-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* RIGHT: PAINEL DE FÓRMULAS & CONTAGEM (FIEL À PLANILHA ENVIADA) */}
        <aside className="xl:col-span-3 space-y-4">
          {/* Contadores por Convênio */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-950 text-white px-4 py-2.5 text-xs font-semibold">
              Fórmula de Contagem São Miguel Saúde
            </div>
            <div className="bg-[#00FF00] text-slate-950 py-2.5 px-4 text-center font-mono tabular-nums text-lg font-bold border-b border-slate-200">
              {spreadsheetFormulas.countSaoMiguel}
            </div>

            <div className="bg-slate-950 text-white px-4 py-2.5 text-xs font-semibold">
              Fórmula de Contagem Particular
            </div>
            <div className="bg-[#E69138] text-slate-950 py-2.5 px-4 text-center font-mono tabular-nums text-lg font-bold border-b border-slate-200">
              {spreadsheetFormulas.countParticular}
            </div>

            <div className="bg-slate-950 text-white px-4 py-2.5 text-xs font-semibold">
              Fórmula de Contagem Part/Ato
            </div>
            <div className="bg-[#9FC5E8] text-slate-950 py-2.5 px-4 text-center font-mono tabular-nums text-lg font-bold">
              {spreadsheetFormulas.countPartAto}
            </div>

            {spreadsheetFormulas.countOutrosConvenios > 0 && (
              <>
                <div className="bg-slate-800 text-white px-4 py-2 text-xs font-medium border-t border-slate-700">
                  Outros Convênios
                </div>
                <div className="bg-slate-100 text-slate-900 py-2 px-4 text-center font-mono tabular-nums text-base font-bold">
                  {spreadsheetFormulas.countOutrosConvenios}
                </div>
              </>
            )}
          </div>

          {/* Quadro EXAMES da Planilha */}
          <div className="bg-white border-2 border-slate-900 rounded-lg overflow-hidden">
            <div className="bg-[#4A86E8] text-slate-950 py-2 px-3 text-center text-xs font-bold border-b border-slate-900">
              EXAMES
            </div>
            <table className="w-full text-xs border-collapse">
              <tbody className="divide-y divide-slate-300">
                {EXAMES_PLANILHA_OFICIAL.map((exame) => (
                  <tr key={exame} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-900 border-r border-slate-400">
                      {exame}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 w-20">
                      {spreadsheetFormulas.examCounts[exame] || 0}
                    </td>
                  </tr>
                ))}
                {spreadsheetFormulas.outrosExamesCount > 0 && (
                  <tr className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-700 border-r border-slate-400">
                      OUTROS EXAMES
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 w-20">
                      {spreadsheetFormulas.outrosExamesCount}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950 text-white font-bold">
                  <td className="py-2.5 px-3 text-center border-r border-slate-700">
                    TOTAL
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-center text-sm">
                    {spreadsheetFormulas.totalExames}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Resumo Financeiro Rápido do Mês */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800 border-b border-slate-100 pb-2">
              Totalização Financeira (Mês)
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Valor Total Exames:</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCurrencyBRL(spreadsheetFormulas.totalValor)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Total Repasse Realização:</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                {formatCurrencyBRL(spreadsheetFormulas.totalRepasse)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-500">Resultado Líquido Unidade:</span>
              <span className="font-mono tabular-nums font-bold text-blue-700">
                {formatCurrencyBRL(
                  spreadsheetFormulas.totalValor -
                    spreadsheetFormulas.totalRepasse
                )}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
