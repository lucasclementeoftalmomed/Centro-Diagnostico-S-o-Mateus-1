import React, { useState } from 'react';
import { Save, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import {
  CONVENIOS_PADRAO,
  TODOS_EXAMES,
  UNIDADES_INDICADORAS_PADRAO,
  CustomPricingRuleDoc,
  formatCurrencyBRL,
  resolveAutoPrice,
} from '../constants/diagnosticCatalog';
import {
  ClinicConfigDoc,
  upsertPricingRule,
  removePricingRule,
  upsertClinicConfig,
} from '../services/examService';

interface AutomationSettingsViewProps {
  userId: string;
  pricingRules: CustomPricingRuleDoc[];
  clinicConfig: ClinicConfigDoc;
  hasExistingConfig: boolean;
}

export const AutomationSettingsView: React.FC<AutomationSettingsViewProps> = ({
  userId,
  pricingRules,
  clinicConfig,
  hasExistingConfig,
}) => {
  // Clinic Goal Settings
  const [unidadePadrao, setUnidadePadrao] = useState(
    clinicConfig.unidadePadrao || 'SÃO MATEUS 1'
  );
  const [metaExames, setMetaExames] = useState(
    clinicConfig.metaMensalExames || 300
  );
  const [metaFaturamento, setMetaFaturamento] = useState(
    clinicConfig.metaMensalFaturamento || 35000
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // New Custom Pricing Rule
  const [ruleConvenio, setRuleConvenio] = useState<string>('SÃO MIGUEL SAÚDE');
  const [ruleExame, setRuleExame] = useState<string>('OCT');
  const [ruleValor, setRuleValor] = useState<number>(180);
  const [ruleRepasse, setRuleRepasse] = useState<number>(45);
  const [savingRule, setSavingRule] = useState(false);

  const handleSaveClinicConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setSavedNotice(false);
    try {
      await upsertClinicConfig(
        userId,
        hasExistingConfig,
        unidadePadrao,
        metaExames,
        metaFaturamento
      );
      setSavedNotice(true);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSavePricingRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRule(true);
    try {
      const existing = pricingRules.find(
        (r) =>
          r.convenio.toUpperCase() === ruleConvenio.toUpperCase() &&
          r.exameTipo.toUpperCase() === ruleExame.toUpperCase()
      );
      await upsertPricingRule(
        userId,
        existing ? existing.id : null,
        ruleConvenio,
        ruleExame,
        ruleValor,
        ruleRepasse
      );
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Configurações de Metas & Unidade Padrão */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="pb-4 mb-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Metas Mensais & Padrão da Unidade
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Define a unidade pré-selecionada nos lançamentos e as metas exibidas no Dashboard.
            </p>
          </div>

          <form onSubmit={handleSaveClinicConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Unidade Indicadora Padrão
              </label>
              <select
                value={unidadePadrao}
                onChange={(e) => setUnidadePadrao(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                {UNIDADES_INDICADORAS_PADRAO.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Meta Mensal de Exames Realizados (Qtd.)
              </label>
              <input
                type="number"
                min={1}
                max={50000}
                value={metaExames}
                onChange={(e) => setMetaExames(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Meta Mensal de Faturamento Bruto (R$)
              </label>
              <input
                type="number"
                step="100"
                min={0}
                max={10000000}
                value={metaFaturamento}
                onChange={(e) =>
                  setMetaFaturamento(parseFloat(e.target.value) || 0)
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {savedNotice ? (
                <span className="text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Metas salvas com sucesso!
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={savingConfig}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {savingConfig ? 'Salvando...' : 'Salvar Metas da Unidade'}
              </button>
            </div>
          </form>
        </section>

        {/* 2. Regras de Preenchimento Automático de Valores e Repasses */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="pb-4 mb-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Tabela de Preenchimento Automático (Convênio × Exame)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Personalize o Valor do Exame e o Repasse de Realização para qualquer combinação de Convênio e Exame.
            </p>
          </div>

          <form
            onSubmit={handleSavePricingRule}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pb-5 mb-5 border-b border-slate-100"
          >
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Convênio
              </label>
              <select
                value={ruleConvenio}
                onChange={(e) => {
                  const newConv = e.target.value;
                  setRuleConvenio(newConv);
                  const auto = resolveAutoPrice(
                    newConv,
                    ruleExame,
                    pricingRules
                  );
                  setRuleValor(auto.valorExame);
                  setRuleRepasse(auto.repasseValor);
                }}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                {CONVENIOS_PADRAO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Exame
              </label>
              <select
                value={ruleExame}
                onChange={(e) => {
                  const newEx = e.target.value;
                  setRuleExame(newEx);
                  const auto = resolveAutoPrice(
                    ruleConvenio,
                    newEx,
                    pricingRules
                  );
                  setRuleValor(auto.valorExame);
                  setRuleRepasse(auto.repasseValor);
                }}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                {TODOS_EXAMES.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Valor Exame (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={ruleValor}
                onChange={(e) => setRuleValor(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-right"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Repasse (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={ruleRepasse}
                onChange={(e) =>
                  setRuleRepasse(parseFloat(e.target.value) || 0)
                }
                className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-right"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={savingRule}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {savingRule ? '...' : 'Fixar Regra'}
              </button>
            </div>
          </form>

          {/* Lista de Regras Personalizadas + Visão Rápida da Tabela */}
          {pricingRules.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Regras Personalizadas Ativas ({pricingRules.length})
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-3 text-left">Convênio</th>
                      <th className="py-2 px-3 text-left">Exame</th>
                      <th className="py-2 px-3 text-right">Valor Exame</th>
                      <th className="py-2 px-3 text-right">Repasse</th>
                      <th className="py-2 px-3 text-center w-14">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {pricingRules.map((rule) => (
                      <tr key={rule.id}>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {rule.convenio}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          {rule.exameTipo}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-right">
                          {formatCurrencyBRL(rule.valorExame)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-right text-emerald-700">
                          {formatCurrencyBRL(rule.repasseValor)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => removePricingRule(rule.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Remover regra personalizada"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              A tabela padrão automática já está ativa para todos os 8 exames principais (Campimetria, OCT, Pentacan, Microscopia, Retinografia, Topografia, Tonometria e Paquimetria) nas modalidades São Miguel Saúde, Particular, Part/Ato e demais convênios. Utilize o formulário acima sempre que quiser substituir algum valor específico.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
