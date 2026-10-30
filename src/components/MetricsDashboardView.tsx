import React, { useMemo } from 'react';
import {
  ExamRecordDoc,
  ClinicConfigDoc,
} from '../services/examService';
import {
  EXAMES_PLANILHA_OFICIAL,
  formatCurrencyBRL,
  formatDateBR,
  formatMonthLabel,
} from '../constants/diagnosticCatalog';

interface MetricsDashboardViewProps {
  records: ExamRecordDoc[];
  selectedMonth: string;
  clinicConfig: ClinicConfigDoc;
}

export const MetricsDashboardView: React.FC<MetricsDashboardViewProps> = ({
  records,
  selectedMonth,
  clinicConfig,
}) => {
  const analytics = useMemo(() => {
    const totalExames = records.length;
    let faturamentoBruto = 0;
    let totalRepasse = 0;
    const uniquePatients = new Set<string>();
    const activeDays = new Set<string>();

    const byExam = new Map<
      string,
      { count: number; revenue: number; repasse: number }
    >();
    for (const ex of EXAMES_PLANILHA_OFICIAL) {
      byExam.set(ex, { count: 0, revenue: 0, repasse: 0 });
    }

    const byConvenio = new Map<
      string,
      { count: number; revenue: number; repasse: number }
    >();
    const byUnidade = new Map<
      string,
      { count: number; revenue: number; repasse: number }
    >();
    const byDay = new Map<string, { count: number; revenue: number }>();

    for (const r of records) {
      const val = r.valorExame || 0;
      const rep = r.repasseValor || 0;
      faturamentoBruto += val;
      totalRepasse += rep;

      if (r.pacienteNome) uniquePatients.add(r.pacienteNome.trim().toUpperCase());
      if (r.dataRealizado) activeDays.add(r.dataRealizado);

      // Exam aggregation
      const exKey = r.exameTipo.trim().toUpperCase();
      const prevEx = byExam.get(exKey) || { count: 0, revenue: 0, repasse: 0 };
      byExam.set(exKey, {
        count: prevEx.count + 1,
        revenue: prevEx.revenue + val,
        repasse: prevEx.repasse + rep,
      });

      // Convenio aggregation
      const convKey = r.convenio.trim().toUpperCase() || 'NÃO INFORMADO';
      const prevConv = byConvenio.get(convKey) || {
        count: 0,
        revenue: 0,
        repasse: 0,
      };
      byConvenio.set(convKey, {
        count: prevConv.count + 1,
        revenue: prevConv.revenue + val,
        repasse: prevConv.repasse + rep,
      });

      // Unidade aggregation
      const unidKey =
        r.unidadeIndicadora.trim().toUpperCase() || 'SÃO MATEUS 1';
      const prevUnid = byUnidade.get(unidKey) || {
        count: 0,
        revenue: 0,
        repasse: 0,
      };
      byUnidade.set(unidKey, {
        count: prevUnid.count + 1,
        revenue: prevUnid.revenue + val,
        repasse: prevUnid.repasse + rep,
      });

      // Daily aggregation
      const dayKey = r.dataRealizado;
      const prevDay = byDay.get(dayKey) || { count: 0, revenue: 0 };
      byDay.set(dayKey, {
        count: prevDay.count + 1,
        revenue: prevDay.revenue + val,
      });
    }

    const examList = Array.from(byExam.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
        share: totalExames > 0 ? (stats.count / totalExames) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const convenioList = Array.from(byConvenio.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
        share: totalExames > 0 ? (stats.count / totalExames) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const unidadeList = Array.from(byUnidade.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
        share: totalExames > 0 ? (stats.count / totalExames) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const dailyList = Array.from(byDay.entries())
      .map(([date, stats]) => ({
        date,
        ...stats,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const maxDailyCount = dailyList.reduce(
      (max, d) => (d.count > max ? d.count : max),
      1
    );

    const avgExamsPerPatient =
      uniquePatients.size > 0 ? totalExames / uniquePatients.size : 0;
    const avgExamsPerActiveDay =
      activeDays.size > 0 ? totalExames / activeDays.size : 0;
    const ticketMedioExame =
      totalExames > 0 ? faturamentoBruto / totalExames : 0;

    return {
      totalExames,
      faturamentoBruto,
      totalRepasse,
      resultadoLiquido: faturamentoBruto - totalRepasse,
      uniquePatientsCount: uniquePatients.size,
      activeDaysCount: activeDays.size,
      avgExamsPerPatient,
      avgExamsPerActiveDay,
      ticketMedioExame,
      examList,
      convenioList,
      unidadeList,
      dailyList,
      maxDailyCount,
    };
  }, [records]);

  const examGoalPct = Math.min(
    100,
    Math.round(
      (analytics.totalExames / Math.max(1, clinicConfig.metaMensalExames)) * 100
    )
  );
  const revGoalPct = Math.min(
    100,
    Math.round(
      (analytics.faturamentoBruto /
        Math.max(1, clinicConfig.metaMensalFaturamento)) *
        100
    )
  );

  return (
    <div className="space-y-6">
      {/* Header Context */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Dashboard de Indicadores Operacionais — {formatMonthLabel(selectedMonth)}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Unidade Base: Centro Diagnóstico São Mateus 1 · {analytics.uniquePatientsCount} pacientes atendidos · {analytics.activeDaysCount} dias com produção
          </p>
        </div>
      </div>

      {/* KPI Strip (Single-Elevation Grid with Hairline Dividers) */}
      <section className="bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs text-slate-500 font-medium">
            Total de Exames Realizados
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {analytics.totalExames}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Meta: {clinicConfig.metaMensalExames} ({examGoalPct}%) ·{' '}
            {analytics.avgExamsPerPatient.toFixed(1)} ex/paciente
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 font-medium">
            Faturamento Bruto de Exames
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrencyBRL(analytics.faturamentoBruto)}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Meta: {formatCurrencyBRL(clinicConfig.metaMensalFaturamento)} ({revGoalPct}%)
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 font-medium">
            Total Repasse Realização
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatCurrencyBRL(analytics.totalRepasse)}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            {analytics.faturamentoBruto > 0
              ? ((analytics.totalRepasse / analytics.faturamentoBruto) * 100).toFixed(1)
              : '0.0'}
            % sobre valor bruto
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 font-medium">
            Resultado Líquido (Pós-Repasse)
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-700">
            {formatCurrencyBRL(analytics.resultadoLiquido)}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Ticket Médio: {formatCurrencyBRL(analytics.ticketMedioExame)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 font-medium">
            Ritmo Diário de Produtividade
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {analytics.avgExamsPerActiveDay.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-500">exames/dia</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            {analytics.uniquePatientsCount} pacientes únicos no mês
          </div>
        </div>
      </section>

      {/* Middle Row: Volume por Exame + Participação por Convênio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Breakdown por Tipo de Exame */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Produtividade por Equipamento / Exame
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Volume realizado, participação percentual e geração de receita na competência.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {analytics.examList.map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-3 font-mono tabular-nums text-slate-600">
                    <span className="font-semibold text-slate-900">
                      {item.count} ex.
                    </span>
                    <span>·</span>
                    <span>{item.share.toFixed(1)}%</span>
                    <span>·</span>
                    <span>{formatCurrencyBRL(item.revenue)}</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${Math.max(item.count > 0 ? 3 : 0, item.share)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Participação por Convênio */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Distribuição por Convênio e Modalidade
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparativo entre São Miguel Saúde, Particular, Part/Ato e demais operadoras.
              </p>
            </div>
          </div>

          {analytics.convenioList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Sem lançamentos registrados neste mês.
            </div>
          ) : (
            <div className="space-y-3.5">
              {analytics.convenioList.map((conv) => {
                const isSaoMiguel = conv.name.includes('SÃO MIGUEL');
                const isParticular = conv.name === 'PARTICULAR';
                const isPartAto = conv.name.includes('PART/ATO');
                const barColor = isSaoMiguel
                  ? 'bg-emerald-600'
                  : isParticular
                  ? 'bg-amber-500'
                  : isPartAto
                  ? 'bg-sky-500'
                  : 'bg-slate-700';

                return (
                  <div key={conv.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        {conv.name}
                      </span>
                      <div className="flex items-center gap-2 font-mono tabular-nums text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {conv.count}
                        </span>
                        <span>({conv.share.toFixed(1)}%)</span>
                        <span>·</span>
                        <span>{formatCurrencyBRL(conv.revenue)}</span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full`}
                        style={{
                          width: `${Math.max(conv.count > 0 ? 4 : 0, conv.share)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Bottom Row: Curva Diária de Produção + Unidades Indicadoras */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="pb-4 mb-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">
              Curva Diária de Exames Realizados no Mês
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificação de dias de pico de atendimento e capacidade ociosa na unidade.
            </p>
          </div>

          {analytics.dailyList.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Nenhum dia com produção lançada no período.
            </div>
          ) : (
            <div className="space-y-2.5">
              {analytics.dailyList.map((day) => {
                const pct = (day.count / analytics.maxDailyCount) * 100;
                return (
                  <div
                    key={day.date}
                    className="grid grid-cols-12 items-center gap-3 text-xs"
                  >
                    <div className="col-span-3 sm:col-span-2 font-mono tabular-nums text-slate-700">
                      {formatDateBR(day.date)}
                    </div>
                    <div className="col-span-6 sm:col-span-7">
                      <div className="w-full h-3 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-slate-900 rounded"
                          style={{ width: `${Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-3 font-mono tabular-nums text-right text-slate-700">
                      <span className="font-semibold text-slate-900">
                        {day.count} ex.
                      </span>{' '}
                      · {formatCurrencyBRL(day.revenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="pb-4 mb-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">
              Origem por Unidade Indicadora
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Volume de exames encaminhados por cada unidade para São Mateus 1.
            </p>
          </div>

          {analytics.unidadeList.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Sem registros de unidades indicadoras no período.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-medium">Unidade</th>
                  <th className="py-2 text-right font-medium">Qtd.</th>
                  <th className="py-2 text-right font-medium">%</th>
                  <th className="py-2 text-right font-medium">Faturamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.unidadeList.map((u) => (
                  <tr key={u.name}>
                    <td className="py-2.5 font-medium text-slate-900">
                      {u.name}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right font-semibold text-slate-900">
                      {u.count}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-slate-500">
                      {u.share.toFixed(1)}%
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-slate-800">
                      {formatCurrencyBRL(u.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
};
