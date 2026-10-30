import { ExamRecordDoc, NewExamInput } from '../services/examService';
import {
  UNIDADES_INDICADORAS_PADRAO,
  CONVENIOS_PADRAO,
  TODOS_EXAMES,
  canonicalizeExamName,
  canonicalizeUnidadeName,
  formatDateBR,
  formatConvenioForGoogleSheet,
  formatUnidadeForGoogleSheet,
  formatMedicoForGoogleSheet,
  formatExameForGoogleSheet,
  parseBRDateToISO,
  calculateReceptionRepasse,
} from '../constants/diagnosticCatalog';
import {
  calculateSpreadsheetSummary,
  parseAttachedSpreadsheetCSV,
} from './spreadsheetCsvSync';

export const GSHEETS_CONFIG_STORAGE_KEY =
  'oftalmomed_sao_mateus_1_gsheets_config_v3';

export const DEFAULT_GOOGLE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1a8MJlzp9onhak7wcsm31G1ZLpuTSri5psPtqzgQoqso/edit?gid=0#gid=0';

/**
 * Link fixo e permanente do Web App Google Apps Script da Planilha Oficial (São Mateus 1 - 2026)
 */
export const DEFAULT_GOOGLE_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxLmPZVbJtzU4U8KwGIL6lMxq7zvsXAndCyl_N4lwAht-PPZQwiCZgTGN0w5q5GB79V8g/exec';

export interface GoogleSheetsLinkConfig {
  sheetUrl: string;
  webhookUrl: string;
  autoSync: boolean;
  autoDownloadCsv: boolean;
  lastSyncedAt?: string;
}

export interface SpreadsheetCatalogData {
  unidades: string[];
  convenios: string[];
  exames: string[];
}

export interface PullSpreadsheetResult {
  rows: NewExamInput[] | null;
  catalog: SpreadsheetCatalogData;
}

export function loadGoogleSheetsConfig(): GoogleSheetsLinkConfig {
  return {
    sheetUrl: DEFAULT_GOOGLE_SHEET_URL,
    webhookUrl: DEFAULT_GOOGLE_APPS_SCRIPT_URL,
    autoSync: true,
    autoDownloadCsv: false,
  };
}

export function saveGoogleSheetsConfig(
  config: GoogleSheetsLinkConfig
): GoogleSheetsLinkConfig {
  const normalized: GoogleSheetsLinkConfig = {
    ...config,
    sheetUrl: config.sheetUrl?.includes('/spreadsheets/d/')
      ? config.sheetUrl.trim()
      : DEFAULT_GOOGLE_SHEET_URL,
    webhookUrl: config.webhookUrl?.includes('script.google.com')
      ? config.webhookUrl.trim()
      : DEFAULT_GOOGLE_APPS_SCRIPT_URL,
    autoSync: true,
  };
  try {
    localStorage.setItem(GSHEETS_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore
  }
  return normalized;
}

/**
 * Busca automaticamente da Planilha Google tanto as listas de referência (como a lista de unidades)
 * quanto eventuais linhas legítimas disponíveis, sem jamais sobrescrever ou desorganizar dados locais
 * caso a leitura pública não esteja habilitada.
 */
export async function pullFromGoogleSheetOnline(
  sheetUrl: string,
  fallbackDateISO: string
): Promise<PullSpreadsheetResult> {
  const defaultCatalog: SpreadsheetCatalogData = {
    unidades: [...UNIDADES_INDICADORAS_PADRAO],
    convenios: [...CONVENIOS_PADRAO],
    exames: [...TODOS_EXAMES],
  };

  try {
    const res = await fetch('/api/gsheets/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheetUrl: sheetUrl || DEFAULT_GOOGLE_SHEET_URL,
        webhookUrl: DEFAULT_GOOGLE_APPS_SCRIPT_URL,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const catalog: SpreadsheetCatalogData = {
        unidades: Array.isArray(data.catalog?.unidades)
          ? data.catalog.unidades
          : defaultCatalog.unidades,
        convenios: Array.isArray(data.catalog?.convenios)
          ? data.catalog.convenios
          : defaultCatalog.convenios,
        exames: Array.isArray(data.catalog?.exames)
          ? data.catalog.exames
          : defaultCatalog.exames,
      };

      if (data.ok && data.mode === 'csv' && typeof data.csvText === 'string') {
        const parsedRows = parseAttachedSpreadsheetCSV(
          data.csvText,
          fallbackDateISO
        );
        if (parsedRows.length > 0) {
          // Extrai unidades adicionais presentes nas linhas da planilha
          const unitSet = new Set(catalog.unidades);
          parsedRows.forEach((r) => {
            if (r.unidadeIndicadora)
              unitSet.add(canonicalizeUnidadeName(r.unidadeIndicadora));
          });
          catalog.unidades = Array.from(unitSet);
          return { rows: parsedRows, catalog };
        }
      }

      if (data.ok && data.mode === 'json_rows' && Array.isArray(data.rows)) {
        const unitSet = new Set(catalog.unidades);
        const mappedRows: NewExamInput[] = data.rows
          .filter(
            (r: Record<string, unknown>) =>
              Boolean(r) &&
              (Boolean(r.pacienteNome) ||
                Boolean(r.pedidoEmed) ||
                Boolean(r.exameTipo))
          )
          .map((r: Record<string, unknown>, idx: number) => {
            const conv = String(r.convenio || 'SÃO MIGUEL')
              .trim()
              .toUpperCase();
            const unid = canonicalizeUnidadeName(
              String(r.unidadeIndicadora || 'São Mateus 1').trim()
            );
            if (unid) unitSet.add(unid);
            const val = Number(r.valorExame) || 0;
            const rep =
              Number(r.repasseValor) > 0
                ? Number(r.repasseValor)
                : calculateReceptionRepasse(val, conv);
            return {
              seqNumber: Number(r.seqNumber) || idx + 1,
              pedidoEmed: String(r.pedidoEmed || '').trim(),
              pacienteNome: String(r.pacienteNome || '').trim().toUpperCase(),
              dataRealizado: parseBRDateToISO(
                String(r.dataRealizado || ''),
                fallbackDateISO
              ),
              convenio: conv,
              unidadeIndicadora: unid,
              medicoOpto: String(r.medicoOpto || 'FORA').trim().toUpperCase(),
              repasseValor: rep,
              valorExame: val,
              exameTipo: canonicalizeExamName(
                String(r.exameTipo || 'OCT de Retina e Glaucoma')
              ),
              observacoes: String(r.observacoes || 'a ser entregue').trim(),
            };
          });

        catalog.unidades = Array.from(unitSet);
        if (mappedRows.length > 0) {
          return { rows: mappedRows, catalog };
        }
      }

      return { rows: null, catalog };
    }
  } catch {
    // Falha silenciosa de rede
  }

  return { rows: null, catalog: defaultCatalog };
}

// Fila serializada para garantir que envios automáticos nunca concorram entre si nem baguncem a ordem
let syncChain: Promise<boolean> = Promise.resolve(true);

export interface SheetSyncDelta {
  action: 'append' | 'update' | 'delete';
  changedRecords: ExamRecordDoc[];
}

/**
 * Envia automaticamente para a Planilha Google os dados incluídos ou atualizados no site,
 * mantendo todas as linhas existentes na sua posição original (seqNumber) sem alterar nem bagunçar
 * os demais registros.
 */
export function pushToGoogleSheetOnline(
  config: GoogleSheetsLinkConfig,
  records: ExamRecordDoc[],
  delta?: SheetSyncDelta
): Promise<boolean> {
  syncChain = syncChain
    .catch(() => false)
    .then(async () => {
      const targetWebhook =
        config.webhookUrl?.trim() || DEFAULT_GOOGLE_APPS_SCRIPT_URL;

      if (!targetWebhook) return false;

      // Preserva rigorosamente a ordem sequencial idêntica à aba "Planilha & Produção" do site
      const sorted = [...records].sort((a, b) => {
        if (a.seqNumber !== b.seqNumber) return a.seqNumber - b.seqNumber;
        return a.id.localeCompare(b.id);
      });

      const summary = calculateSpreadsheetSummary(sorted);

      const formatRowForSheet = (r: ExamRecordDoc, seqNum: number) => ({
        seqNumber: seqNum,
        pedidoEmed: String(r.pedidoEmed || '').trim(),
        pacienteNome: String(r.pacienteNome || '').trim().toUpperCase(),
        dataRealizado: formatDateBR(r.dataRealizado),
        convenio: formatConvenioForGoogleSheet(r.convenio),
        unidadeIndicadora: formatUnidadeForGoogleSheet(r.unidadeIndicadora),
        medicoOpto: formatMedicoForGoogleSheet(r.medicoOpto),
        repasseValor: Number(r.repasseValor) || 0,
        valorExame: Number(r.valorExame) || 0,
        exameTipo: formatExameForGoogleSheet(r.exameTipo),
        observacoes: String(r.observacoes || 'a ser entregue').trim(),
      });

      const formattedRows =
        sorted.length > 0
          ? sorted.map((r, idx) => formatRowForSheet(r, idx + 1))
          : [
              {
                seqNumber: 1,
                pedidoEmed: '',
                pacienteNome: '',
                dataRealizado: '',
                convenio: '',
                unidadeIndicadora: '',
                medicoOpto: '',
                repasseValor: '',
                valorExame: '',
                exameTipo: '',
                observacoes: '',
              },
            ];

      const payload = {
        unidade: 'SÃO MATEUS 1',
        updatedAt: new Date().toISOString(),
        action: delta?.action || 'update',
        changedRows: (delta?.changedRecords || []).map((r) =>
          formatRowForSheet(r, r.seqNumber)
        ),
        rows: formattedRows,
        summary: {
          countSaoMiguel: summary.countSaoMiguel,
          countParticular: summary.countParticular,
          countPartAto: summary.countPartAto,
          examCounts: summary.examCounts,
          totalExames: summary.totalExames,
          totalValor: summary.totalValor,
          totalRepasse: summary.totalRepasse,
          totalLiquido: summary.totalLiquido,
        },
      };

      try {
        const apiRes = await fetch('/api/gsheets/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl: targetWebhook,
            payload,
          }),
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (json.ok) return true;
        }
      } catch {
        // Fallback direto
      }

      try {
        await fetch(targetWebhook, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
        return true;
      } catch {
        return false;
      }
    });

  return syncChain;
}
