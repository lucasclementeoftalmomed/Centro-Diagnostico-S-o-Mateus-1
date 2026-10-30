import React, { useState, useMemo } from 'react';
import {
  Target,
  TrendingUp,
  Award,
  Calendar,
  DollarSign,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Clock,
  Search,
  Filter,
  ListChecks,
  Check,
  FileSpreadsheet,
} from 'lucide-react';
import { ExamRecordDoc } from '../services/examService';
import {
  EXAMES_PLANILHA_OFICIAL,
  TODOS_EXAMES,
  formatCurrencyBRL,
  formatDateBR,
  getMonthNameFromISO,
  getReceptionRepasseRate,
  calculateReceptionRepasse,
} from '../constants/diagnosticCatalog';

interface MonthlyGoalProjectionViewProps {
  records: ExamRecordDoc[];
  onNavigateToSpreadsheet?: () => void;
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

const DEFAULT_TARGET_GROSS = 60000;
const LOCAL_STORAGE_MONTHLY_GOALS = 'oftalmomed_monthly_goals_map_v1';
const GOAL_PRESETS = [40000, 50000, 60000, 70000, 80000, 100000];

export const MonthlyGoalProjectionView: React.FC<
  MonthlyGoalProjectionViewProps
> = ({ records, onNavigateToSpreadsheet }) => {
  const [selectedMonthName, setSelectedMonthName] = useState<string>('Outubro');
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState<string>('60000');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterProcedure, setFilterProcedure] = useState<string>('TODOS');

  // Metas configuradas por mês (salvas em localStorage)
  const [monthlyGoalsMap, setMonthlyGoalsMap] = useState<Record<string, number>>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(LOCAL_STORAGE_MONTHLY_GOALS);
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return {};
  });

  const targetGoalGross =
    monthlyGoalsMap[selectedMonthName] !== undefined
      ? monthlyGoalsMap[selectedMonthName]
      : DEFAULT_TARGET_GROSS;

  const handleUpdateMonthGoal = (newGoal: number) => {
    const updated = {
      ...monthlyGoalsMap,
      [selectedMonthName]: newGoal,
    };
    setMonthlyGoalsMap(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_STORAGE_MONTHLY_GOALS, JSON.stringify(updated));
      } catch {}
    }
    setIsEditingGoal(false);
  };

  // Informações temporais oficiais: 1º ao último dia, calculando dias úteis de Seg a Sábado (sem Domingos)
  const monthInfo = useMemo(() => {
    const monthIndex = MONTHS_LIST.indexOf(selectedMonthName);
    const safeMonthIndex = monthIndex >= 0 ? monthIndex : 9;
    const year = 2026;
    const daysInMonth = new Date(year, safeMonthIndex + 1, 0).getDate();
    const monthNumStr = String(safeMonthIndex + 1).padStart(2, '0');
    const firstDayISO = `${year}-${monthNumStr}-01`;
    const lastDayISO = `${year}-${monthNumStr}-${String(daysInMonth).padStart(2, '0')}`;
    const periodLabel = `01/${monthNumStr}/${year} a ${String(daysInMonth).padStart(2, '0')}/${monthNumStr}/${year}`;

    // Contagem de dias de produção de segunda a sábado (desconsidera domingos)
    let totalProdDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(year, safeMonthIndex, d).getDay();
      if (dayOfWeek !== 0) { // 0 = Domingo
        totalProdDays++;
      }
    }

    return {
      monthIndex: safeMonthIndex,
      year,
      daysInMonth,
      totalProdDays,
      monthNumStr,
      firstDayISO,
      lastDayISO,
      periodLabel,
    };
  }, [selectedMonthName]);

  // Filtra registros do mês selecionado
  const monthRecords = useMemo(() => {
    if (selectedMonthName === 'TODOS') return records;
    const { monthNumStr, year } = monthInfo;
    const prefix = `${year}-${monthNumStr}`;
    return records.filter((r) => {
      const d = r.dataRealizado || '';
      return (
        d.startsWith(prefix) ||
        getMonthNameFromISO(d) === selectedMonthName
      );
    });
  }, [records, selectedMonthName, monthInfo]);

  // Procedimentos filtrados pela busca
  const filteredIncludedRecords = useMemo(() => {
    return monthRecords.filter((r) => {
      if (
        filterProcedure !== 'TODOS' &&
        (r.exameTipo || '').toUpperCase() !== filterProcedure.toUpperCase()
      ) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        (r.pacienteNome || '').toLowerCase().includes(q) ||
        (r.pedidoEmed || '').toLowerCase().includes(q) ||
        (r.exameTipo || '').toLowerCase().includes(q) ||
        (r.convenio || '').toLowerCase().includes(q) ||
        (r.medicoOpto || '').toLowerCase().includes(q)
      );
    });
  }, [monthRecords, filterProcedure, searchTerm]);

  // Cálculos consolidados atuais
  const currentStats = useMemo(() => {
    let brutoTotal = 0;
    let repasseTotal = 0;
    const examMap: Record<string, { count: number; bruto: number; repasse: number }> = {};
    const convMap: Record<string, { count: number; bruto: number; repasse: number }> = {};

    for (const ex of EXAMES_PLANILHA_OFICIAL) {
      examMap[ex] = { count: 0, bruto: 0, repasse: 0 };
    }

    for (const r of monthRecords) {
      const v = Number(r.valorExame) || 0;
      const rep = Number(r.repasseValor) || 0;
      brutoTotal += v;
      repasseTotal += rep;

      const ex = r.exameTipo || 'OUTROS';
      if (!examMap[ex]) examMap[ex] = { count: 0, bruto: 0, repasse: 0 };
      examMap[ex].count += 1;
      examMap[ex].bruto += v;
      examMap[ex].repasse += rep;

      const conv = r.convenio || 'OUTROS';
      if (!convMap[conv]) convMap[conv] = { count: 0, bruto: 0, repasse: 0 };
      convMap[conv].count += 1;
      convMap[conv].bruto += v;
      convMap[conv].repasse += rep;
    }

    const liquidoTotal = brutoTotal - repasseTotal;
    const percentAchieved =
      targetGoalGross > 0 ? (brutoTotal / targetGoalGross) * 100 : 0;
    const remainingToGoal = Math.max(0, targetGoalGross - brutoTotal);
    const isGoalBeaten = brutoTotal >= targetGoalGross;
    const surplusGross = Math.max(0, brutoTotal - targetGoalGross);

    return {
      count: monthRecords.length,
      brutoTotal,
      repasseTotal,
      liquidoTotal,
      percentAchieved,
      remainingToGoal,
      isGoalBeaten,
      surplusGross,
      examMap,
      convMap,
    };
  }, [monthRecords, targetGoalGross]);

  // Cálculo de projeção desconsiderando domingos (Produção: Segunda a Sábado)
  const projectionStats = useMemo(() => {
    const { daysInMonth, totalProdDays, monthNumStr, periodLabel, monthIndex, year } = monthInfo;

    const isCurrentMonth = selectedMonthName === 'Outubro';
    const isPastMonth = monthIndex >= 0 && monthIndex < 9;
    const isFutureMonth = monthIndex >= 0 && monthIndex > 9;

    let elapsedCalendarDay = daysInMonth;
    let isClosedMonth = false;

    if (isCurrentMonth) {
      let curDay = 26; // Data base de referência corrente
      if (monthRecords.length > 0) {
        const maxDayInRecords = monthRecords.reduce((max, r) => {
          const parts = (r.dataRealizado || '').split('-');
          const day = parseInt(parts[2], 10);
          return !isNaN(day) && day > max ? day : max;
        }, curDay);
        curDay = maxDayInRecords;
      }
      elapsedCalendarDay = Math.min(daysInMonth, Math.max(1, curDay));
    } else if (isPastMonth) {
      elapsedCalendarDay = daysInMonth;
      isClosedMonth = true;
    } else if (isFutureMonth) {
      elapsedCalendarDay = 0;
    }

    // Contagem de dias úteis (Seg a Sáb) decorridos e restantes
    let elapsedProdDays = 0;
    let remainingProdDays = 0;

    if (isClosedMonth) {
      elapsedProdDays = totalProdDays;
      remainingProdDays = 0;
    } else if (isFutureMonth) {
      elapsedProdDays = 0;
      remainingProdDays = totalProdDays;
    } else {
      for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(year, monthIndex, d).getDay();
        if (dayOfWeek !== 0) {
          if (d <= elapsedCalendarDay) {
            elapsedProdDays++;
          } else {
            remainingProdDays++;
          }
        }
      }
    }

    // Média diária atual considerando apenas dias de produção (Seg a Sáb)
    const dailyAverageCurrent =
      elapsedProdDays > 0 ? currentStats.brutoTotal / elapsedProdDays : 0;

    // Projeção de fechamento baseada nos dias de produção restantes
    const projectedGrossMonthEnd = isClosedMonth
      ? currentStats.brutoTotal
      : currentStats.brutoTotal + dailyAverageCurrent * remainingProdDays;

    const projectedPercent =
      targetGoalGross > 0 ? (projectedGrossMonthEnd / targetGoalGross) * 100 : 0;

    // Média diária necessária por dia útil restante (Seg a Sáb)
    const dailyRequiredForGoal =
      currentStats.remainingToGoal > 0 && remainingProdDays > 0
        ? currentStats.remainingToGoal / remainingProdDays
        : 0;

    return {
      daysInMonth,
      totalProdDays,
      elapsedCalendarDay,
      elapsedProdDays,
      remainingProdDays,
      dailyAverageCurrent,
      projectedGrossMonthEnd,
      projectedPercent,
      dailyRequiredForGoal,
      periodLabel,
      monthNumStr,
      isClosedMonth,
    };
  }, [monthInfo, selectedMonthName, monthRecords, currentStats, targetGoalGross]);

  const handleSaveCustomGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customGoalInput.replace(/[^\d.]/g, '')) || DEFAULT_TARGET_GROSS;
    handleUpdateMonthGoal(val);
  };

  const handleResetDefaultGoal = () => {
    handleUpdateMonthGoal(DEFAULT_TARGET_GROSS);
    setCustomGoalInput('60000');
  };

  return (
    <div className="space-y-5 w-full max-w-full min-w-0">
      {/* 1. CABEÇALHO */}
      <div className="bg-gradient-to-r from-oftalmo-950 via-oftalmo-900 to-oftalmo-800 text-white rounded-2xl p-5 shadow-lg border border-oftalmo-700/60 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <img
              src="/assets/aistudio/oftalmomed-logo_set25_branco_verde_7db96e29.png"
              alt="OftalmoMed"
              className="h-6 sm:h-7 w-auto object-contain"
            />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-verde-400">
              Metas — São Mateus 1
            </span>
            <span className="px-2.5 py-0.5 bg-white/10 text-oftalmo-200 border border-white/20 rounded-full text-[11px] font-mono">
              📅 {projectionStats.periodLabel} · {projectionStats.totalProdDays} dias úteis (Seg a Sáb)
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            Projeção Meta Mensal
          </h1>
          <p className="text-xs text-oftalmo-200">
            Acompanhamento da meta bruta de{' '}
            <strong className="text-white">
              {formatCurrencyBRL(targetGoalGross)}
            </strong>{' '}
            (segunda a sábado, sem domingos) com sincronização em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Mês */}
          <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-verde-400" />
            <span className="text-xs font-semibold text-oftalmo-200">Mês:</span>
            <select
              value={selectedMonthName}
              onChange={(e) => {
                setSelectedMonthName(e.target.value);
                setIsEditingGoal(false);
              }}
              className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
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

          {/* Ajustar Meta */}
          {!isEditingGoal ? (
            <button
              type="button"
              onClick={() => {
                setCustomGoalInput(String(targetGoalGross));
                setIsEditingGoal(true);
              }}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
              title="Alterar meta deste mês"
            >
              <span>Meta: {formatCurrencyBRL(targetGoalGross)}</span>
              <span className="text-[10px] text-verde-400 underline ml-0.5">
                Editar
              </span>
            </button>
          ) : (
            <div className="bg-white p-2 rounded-xl shadow-xl border border-slate-200 text-slate-900 flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500 pl-1">R$</span>
              <input
                type="number"
                step="500"
                value={customGoalInput}
                onChange={(e) => setCustomGoalInput(e.target.value)}
                className="w-20 px-1.5 py-0.5 text-xs font-bold border border-slate-300 rounded"
              />
              <button
                type="button"
                onClick={() =>
                  handleUpdateMonthGoal(
                    parseFloat(customGoalInput) || DEFAULT_TARGET_GROSS
                  )
                }
                className="px-2 py-0.5 bg-verde-600 hover:bg-verde-500 text-white text-xs font-bold rounded cursor-pointer"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setIsEditingGoal(false)}
                className="text-slate-400 hover:text-slate-600 px-1 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {onNavigateToSpreadsheet && (
            <button
              type="button"
              onClick={onNavigateToSpreadsheet}
              className="px-3 py-1.5 bg-verde-600 hover:bg-verde-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Lançar Exame
            </button>
          )}
        </div>
      </div>

      {/* 2. CARDS PRINCIPAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Faturamento Bruto */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Bruto Realizado
            </span>
            <DollarSign className="w-4 h-4 text-verde-600" />
          </div>
          <div className="mt-1.5 text-2xl font-black text-slate-900 tabular-nums">
            {formatCurrencyBRL(currentStats.brutoTotal)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Meta: {formatCurrencyBRL(targetGoalGross)}
            </span>
            <span
              className={`font-black px-2 py-0.5 rounded-full ${
                currentStats.percentAchieved >= 100
                  ? 'bg-emerald-100 text-emerald-800'
                  : currentStats.percentAchieved >= 70
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {currentStats.percentAchieved.toFixed(1)}% atingido
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                currentStats.percentAchieved >= 100
                  ? 'bg-emerald-500'
                  : 'bg-oftalmo-700'
              }`}
              style={{
                width: `${Math.min(100, currentStats.percentAchieved)}%`,
              }}
            />
          </div>
        </div>

        {/* Card 2: Falta p/ Meta */}
        <div
          className={`rounded-xl p-4 border shadow-xs ${
            currentStats.isGoalBeaten
              ? 'bg-emerald-50/70 border-emerald-300'
              : 'bg-amber-50/70 border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                currentStats.isGoalBeaten ? 'text-emerald-900' : 'text-amber-900'
              }`}
            >
              {currentStats.isGoalBeaten ? 'Meta Superada!' : 'Falta p/ Meta'}
            </span>
            {currentStats.isGoalBeaten ? (
              <Award className="w-4 h-4 text-emerald-600" />
            ) : (
              <Target className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div className="mt-1.5 text-2xl font-black tabular-nums">
            {currentStats.isGoalBeaten ? (
              <span className="text-emerald-700">
                +{formatCurrencyBRL(currentStats.surplusGross)}
              </span>
            ) : (
              <span className="text-amber-950">
                {formatCurrencyBRL(currentStats.remainingToGoal)}
              </span>
            )}
          </div>
          <p
            className={`text-xs font-semibold mt-2 ${
              currentStats.isGoalBeaten ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {currentStats.isGoalBeaten
              ? `Superou em +${formatCurrencyBRL(currentStats.surplusGross)}`
              : `${projectionStats.remainingProdDays} dias úteis restantes (Seg a Sáb)`}
          </p>
        </div>

        {/* Card 3: Projeção Fim do Mês */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Projeção Fim do Mês
            </span>
            <TrendingUp className="w-4 h-4 text-oftalmo-700" />
          </div>
          <div className="mt-1.5 text-2xl font-black text-oftalmo-950 tabular-nums">
            {formatCurrencyBRL(projectionStats.projectedGrossMonthEnd)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Média: {formatCurrencyBRL(projectionStats.dailyAverageCurrent)}/dia útil
            </span>
            <span
              className={`font-bold ${
                projectionStats.projectedPercent >= 100
                  ? 'text-emerald-600'
                  : 'text-rose-600'
              }`}
            >
              {projectionStats.projectedPercent.toFixed(1)}% est.
            </span>
          </div>
        </div>

        {/* Card 4: Ritmo Diário Necessário */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ritmo Diário Necessário
            </span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-1.5 text-2xl font-black text-slate-900 tabular-nums">
            {currentStats.isGoalBeaten
              ? 'R$ 0,00'
              : formatCurrencyBRL(projectionStats.dailyRequiredForGoal)}
            <span className="text-xs text-slate-500 font-semibold ml-1">/dia útil</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            {currentStats.isGoalBeaten
              ? 'Meta mensal já alcançada.'
              : `${projectionStats.remainingProdDays} dias de produção (Seg a Sáb)`}
          </p>
        </div>
      </div>

      {/* 3. RÉGUA VISUAL */}
      <section className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-verde-600" />
            Progresso da Meta — {formatCurrencyBRL(targetGoalGross)}
          </h3>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="text-slate-500">
              Repasse Realiz.:{' '}
              <strong className="text-amber-900">
                {formatCurrencyBRL(currentStats.repasseTotal)}
              </strong>
            </span>
            <span className="text-slate-500">
              Líquido:{' '}
              <strong className="text-emerald-700">
                {formatCurrencyBRL(currentStats.liquidoTotal)}
              </strong>
            </span>
          </div>
        </div>

        <div className="pt-1">
          <div className="relative w-full bg-slate-100 h-5 rounded-full overflow-hidden p-0.5 border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2 text-[10px] font-black text-white ${
                currentStats.percentAchieved >= 100
                  ? 'bg-emerald-600'
                  : 'bg-oftalmo-800'
              }`}
              style={{
                width: `${Math.min(100, Math.max(6, currentStats.percentAchieved))}%`,
              }}
            >
              {currentStats.percentAchieved.toFixed(1)}%
            </div>
          </div>
          <div className="grid grid-cols-4 text-[11px] font-bold text-slate-500 pt-1.5 border-t border-slate-100 mt-1.5">
            <div>25%: {formatCurrencyBRL(targetGoalGross * 0.25)}</div>
            <div className="text-center">50%: {formatCurrencyBRL(targetGoalGross * 0.5)}</div>
            <div className="text-center">75%: {formatCurrencyBRL(targetGoalGross * 0.75)}</div>
            <div className="text-right text-emerald-700 font-extrabold">
              100%: {formatCurrencyBRL(targetGoalGross)}
            </div>
          </div>
        </div>
      </section>

      {/* 4. TABELAS DE CONTRIBUIÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full max-w-full min-w-0">
        {/* Procedimentos */}
        <section className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden min-w-0 max-w-full">
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">
              Contribuição por Procedimento ({currentStats.count} exames)
            </h3>
            <span className="text-xs font-bold text-slate-600">
              Total: {formatCurrencyBRL(currentStats.brutoTotal)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <th className="py-2 px-3 text-left">Procedimento</th>
                  <th className="py-2 px-2 text-right">Qtd</th>
                  <th className="py-2 px-2 text-right">Bruto</th>
                  <th className="py-2 px-2 text-right">Repasse Realiz.</th>
                  <th className="py-2 px-2 text-right">% Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(currentStats.examMap)
                  .filter(([_, data]) => data.count > 0)
                  .sort((a, b) => b[1].bruto - a[1].bruto)
                  .map(([name, data]) => {
                    const pctOfTarget =
                      targetGoalGross > 0 ? (data.bruto / targetGoalGross) * 100 : 0;
                    return (
                      <tr key={name} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-semibold text-slate-900">
                          {name}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-right font-bold text-slate-800">
                          {data.count}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-right font-bold text-slate-900">
                          {formatCurrencyBRL(data.bruto)}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-right text-amber-900 font-medium">
                          {formatCurrencyBRL(data.repasse)}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-right font-black text-indigo-700">
                          {pctOfTarget.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Convênios */}
        <section className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden min-w-0 max-w-full">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold text-slate-900">
              Distribuição por Convênio
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <th className="py-2 px-3 text-left">Convênio</th>
                  <th className="py-2 px-2 text-right">Qtd</th>
                  <th className="py-2 px-2 text-right">Bruto</th>
                  <th className="py-2 px-2 text-right">% Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(currentStats.convMap)
                  .sort((a, b) => b[1].bruto - a[1].bruto)
                  .map(([name, data]) => {
                    const pctOfTarget =
                      targetGoalGross > 0 ? (data.bruto / targetGoalGross) * 100 : 0;
                    return (
                      <tr key={name} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-semibold text-slate-900">
                          {name}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-right font-bold text-slate-800">
                          {data.count}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-right font-bold text-slate-900">
                          {formatCurrencyBRL(data.bruto)}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-right font-black text-indigo-700">
                          {pctOfTarget.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 6. PROCEDIMENTOS INCLUSOS */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-emerald-700" />
            <h3 className="font-bold text-slate-900">
              Procedimentos Inclusos ({monthRecords.length})
            </h3>
          </div>
          <div className="flex items-center gap-2 font-bold">
            <span className="text-slate-600">Total Bruto:</span>
            <span className="text-slate-950 tabular-nums">
              {formatCurrencyBRL(currentStats.brutoTotal)}
            </span>
          </div>
        </div>

        {/* Busca e Filtro */}
        <div className="p-2.5 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-sm bg-white border border-slate-300 rounded-lg px-2 py-1">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar paciente, pedido eMed..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none w-full text-xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Procedimento:</span>
            <select
              value={filterProcedure}
              onChange={(e) => setFilterProcedure(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Todos ({monthRecords.length})</option>
              {EXAMES_PLANILHA_OFICIAL.map((ex) => (
                <option key={ex} value={ex}>
                  {ex} ({currentStats.examMap[ex]?.count || 0})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabela de Procedimentos Inclusos */}
        <div className="overflow-x-auto max-h-[380px] custom-scrollbar">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-300">
              <tr>
                <th className="py-2 px-2.5 w-10 text-center">Nº</th>
                <th className="py-2 px-2.5">Data</th>
                <th className="py-2 px-2.5">Pedido</th>
                <th className="py-2 px-2.5">Paciente</th>
                <th className="py-2 px-2.5">Procedimento</th>
                <th className="py-2 px-2.5">Convênio</th>
                <th className="py-2 px-2.5 text-right">Bruto</th>
                <th className="py-2 px-2.5 text-right">Repasse Realiz.</th>
                <th className="py-2 px-2.5">Solicitante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIncludedRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">
                    Nenhum procedimento encontrado.
                  </td>
                </tr>
              ) : (
                filteredIncludedRecords.map((r, idx) => (
                  <tr key={r.id || idx} className="hover:bg-slate-50">
                    <td className="py-1.5 px-2.5 text-center tabular-nums text-slate-500 font-semibold">
                      #{r.seqNumber}
                    </td>
                    <td className="py-1.5 px-2.5 tabular-nums text-slate-700 whitespace-nowrap">
                      {formatDateBR(r.dataRealizado)}
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-slate-800">
                      {r.pedidoEmed || '—'}
                    </td>
                    <td className="py-1.5 px-2.5 font-bold text-slate-900">
                      {r.pacienteNome}
                    </td>
                    <td className="py-1.5 px-2.5">
                      <span className="font-semibold text-oftalmo-900 bg-oftalmo-50 px-1.5 py-0.5 rounded border border-oftalmo-200">
                        {r.exameTipo}
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5 text-slate-700 font-medium">
                      {r.convenio}
                    </td>
                    <td className="py-1.5 px-2.5 text-right tabular-nums font-bold text-slate-950">
                      {formatCurrencyBRL(r.valorExame)}
                    </td>
                    <td className="py-1.5 px-2.5 text-right tabular-nums font-semibold text-amber-900">
                      {formatCurrencyBRL(r.repasseValor)}
                    </td>
                    <td className="py-1.5 px-2.5 text-slate-600 font-medium">
                      {r.medicoOpto || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
