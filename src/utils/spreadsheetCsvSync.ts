import {
  EXAMES_PLANILHA_OFICIAL,
  canonicalizeExamName,
  canonicalizeUnidadeName,
  formatDateBR,
  parseBRDateToISO,
  resolveAutoPrice,
} from '../constants/diagnosticCatalog';
import { ExamRecordDoc, NewExamInput } from '../services/examService';

/**
 * Formata valor monetário exatamente como na planilha anexada: "R$ 7,50" ou "R$ 250,00"
 */
export function formatSpreadsheetCurrencyCell(val: number): string {
  const formatted = (val || 0).toFixed(2).replace('.', ',');
  return `"R$ ${formatted}"`;
}

export function parseSpreadsheetCurrencyCell(raw: string): number {
  if (!raw) return 0;
  const clean = String(raw)
    .replace(/R\$/gi, '')
    .replace(/"/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(clean);
  return Number.isFinite(num) ? num : 0;
}

export interface SpreadsheetSummaryCounts {
  countSaoMiguel: number;
  countParticular: number;
  countPartAto: number;
  examCounts: Record<string, number>;
  totalExames: number;
  totalValor: number;
  totalRepasse: number;
  totalLiquido: number;
}

export function calculateSpreadsheetSummary(
  records: ExamRecordDoc[]
): SpreadsheetSummaryCounts {
  let countSaoMiguel = 0;
  let countParticular = 0;
  let countPartAto = 0;

  const examCounts: Record<string, number> = {};
  for (const ex of EXAMES_PLANILHA_OFICIAL) {
    examCounts[ex] = 0;
  }

  let totalValor = 0;
  let totalRepasse = 0;

  for (const r of records) {
    const conv = (r.convenio || '').trim().toUpperCase();
    if (conv.includes('SÃO MIGUEL') || conv.includes('SAO MIGUEL')) {
      countSaoMiguel++;
    } else if (conv === 'PARTICULAR') {
      countParticular++;
    } else if (conv.includes('PART/ATO') || conv.includes('ATO')) {
      countPartAto++;
    }

    const ex = canonicalizeExamName(r.exameTipo || '');
    if (ex in examCounts) {
      examCounts[ex] += 1;
    } else if (ex) {
      examCounts[ex] = (examCounts[ex] || 0) + 1;
    }

    totalValor += Number(r.valorExame) || 0;
    totalRepasse += Number(r.repasseValor) || 0;
  }

  return {
    countSaoMiguel,
    countParticular,
    countPartAto,
    examCounts,
    totalExames: records.length,
    totalValor,
    totalRepasse,
    totalLiquido: totalValor - totalRepasse,
  };
}

function escapeCsvField(val: string): string {
  const clean = String(val ?? '').replace(/\r?\n/g, ' ');
  if (clean.includes(',') || clean.includes('"')) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

/**
 * Gera o arquivo CSV EXATAMENTE no layout da planilha anexada pelo usuário:
 * Colunas A..K (0..10): Nº,PEDIDO EMED,NOME PACIENTE ,DATA REALIZADO  ,CONVÊNIO,UNIDADE INDICADORA,MÉDICO/OPTO,REPASSE REALIZAÇÃO,VALOR EXAME, EXAMES,obs
 * Colunas L..M (11..12) com o Resumo de Exames
 */
export function buildExactAttachedSpreadsheetCSV(
  records: ExamRecordDoc[]
): string {
  const sorted = [...records].sort((a, b) => a.seqNumber - b.seqNumber);
  const summary = calculateSpreadsheetSummary(sorted);

  const TOTAL_COLS = 26;
  const maxRowNum = Math.max(80, sorted.length);

  // Header row
  const headerCols = new Array(TOTAL_COLS).fill('');
  headerCols[0] = 'Nº';
  headerCols[1] = 'PEDIDO EMED';
  headerCols[2] = 'NOME PACIENTE ';
  headerCols[3] = 'DATA REALIZADO  ';
  headerCols[4] = 'CONVÊNIO';
  headerCols[5] = 'UNIDADE INDICADORA';
  headerCols[6] = 'MÉDICO/OPTO';
  headerCols[7] = 'REPASSE REALIZAÇÃO';
  headerCols[8] = 'VALOR EXAME';
  headerCols[9] = ' EXAMES';
  headerCols[10] = 'obs';

  const lines: string[] = [headerCols.join(',')];

  for (let rowNum = 1; rowNum <= maxRowNum; rowNum++) {
    const cols = new Array(TOTAL_COLS).fill('');
    cols[0] = String(rowNum);

    const record = sorted[rowNum - 1];
    if (record) {
      cols[1] = escapeCsvField(record.pedidoEmed);
      cols[2] = escapeCsvField(record.pacienteNome);
      cols[3] = formatDateBR(record.dataRealizado);
      cols[4] = escapeCsvField(record.convenio);
      cols[5] = escapeCsvField(record.unidadeIndicadora);
      cols[6] = escapeCsvField(record.medicoOpto);
      cols[7] = formatSpreadsheetCurrencyCell(record.repasseValor);
      cols[8] = formatSpreadsheetCurrencyCell(record.valorExame);
      cols[9] = escapeCsvField(record.exameTipo);
      cols[10] = escapeCsvField(record.observacoes);
    }

    // Quadro lateral nas Colunas L (11) e M (12)
    if (rowNum === 3) {
      cols[11] = 'Formula de Contagem São Miguel Saúde ';
    } else if (rowNum === 4) {
      cols[11] = String(summary.countSaoMiguel);
    } else if (rowNum === 6) {
      cols[11] = 'Formula de Contagem Particular';
    } else if (rowNum === 7) {
      cols[11] = String(summary.countParticular);
    } else if (rowNum === 9) {
      cols[11] = 'Formula de Contagem Part/Ato';
    } else if (rowNum === 10) {
      cols[11] = String(summary.countPartAto);
    } else if (rowNum === 12) {
      cols[11] = 'EXAMES';
    } else if (
      rowNum >= 13 &&
      rowNum < 13 + EXAMES_PLANILHA_OFICIAL.length
    ) {
      const exName = EXAMES_PLANILHA_OFICIAL[rowNum - 13];
      cols[11] = escapeCsvField(exName);
      cols[12] = String(summary.examCounts[exName] || 0);
    } else if (rowNum === 13 + EXAMES_PLANILHA_OFICIAL.length) {
      cols[11] = 'TOTAL';
      cols[12] = String(summary.totalExames);
    }

    lines.push(cols.join(','));
  }

  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Faz o parse de uma linha CSV respeitando aspas (ex: "R$ 7,50").
 */
function parseCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Lê o CSV/JSON da Planilha (ou qualquer versão editada dela) e extrai todos os lançamentos válidos,
 * incluindo múltiplos exames do mesmo paciente (mesmo que o nome esteja repetido ou agrupado).
 */
export function parseAttachedSpreadsheetCSV(
  csvContent: string,
  fallbackDateISO: string
): NewExamInput[] {
  const trimmed = (csvContent || '').trim();
  if (!trimmed) return [];

  // Rejeita páginas HTML/CSS/JS de login ou erro (ex: Apps Script sem doGet ou tela de login Google)
  const lowerSample = trimmed.slice(0, 1500).toLowerCase();
  if (
    lowerSample.startsWith('<!doctype') ||
    lowerSample.startsWith('<html') ||
    lowerSample.startsWith('<style') ||
    lowerSample.startsWith('<script') ||
    lowerSample.startsWith('<div') ||
    lowerSample.includes('document-root') ||
    lowerSample.includes('servicelogin') ||
    lowerSample.includes('sign in to your google account') ||
    lowerSample.includes('script function not found') ||
    lowerSample.includes('<body')
  ) {
    throw new Error(
      'A URL retornou uma página HTML de autenticação em vez dos dados da planilha.'
    );
  }

  // Suporte direto a JSON caso o Apps Script retorne { rows: [...] }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      const rawRows = Array.isArray(parsedJson)
        ? parsedJson
        : Array.isArray(parsedJson.rows)
        ? parsedJson.rows
        : [];
      const fromJson: NewExamInput[] = [];
      let lastPac = '';
      let lastPed = '';
      let lastConv = 'SÃO MIGUEL';
      let lastUnid = 'São Mateus 1';
      let lastMed = 'FORA';
      let lastDate = fallbackDateISO;

      rawRows.forEach((r: Record<string, unknown>) => {
        if (!r) return;
        const pac = String(r.pacienteNome || '').trim().toUpperCase();
        const ped = String(r.pedidoEmed || '').trim();
        const exRaw = String(r.exameTipo || '').trim();
        if (!pac && !ped && !exRaw) return;

        const effectivePac = pac || lastPac || (ped ? `PACIENTE PEDIDO #${ped}` : '');
        if (!effectivePac) return;

        const effectivePed = ped || (pac === lastPac ? lastPed : '');
        const effectiveDate = parseBRDateToISO(
          String(r.dataRealizado || ''),
          lastDate
        );
        const effectiveConv =
          String(r.convenio || '').trim().toUpperCase() || lastConv;
        const effectiveUnid = canonicalizeUnidadeName(
          String(r.unidadeIndicadora || '').trim() || lastUnid
        );
        const effectiveMed =
          String(r.medicoOpto || '').trim().toUpperCase() || lastMed;

        lastPac = effectivePac;
        lastPed = effectivePed;
        lastDate = effectiveDate;
        lastConv = effectiveConv;
        lastUnid = effectiveUnid;
        lastMed = effectiveMed;

        const examParts = (exRaw || 'OCT de Retina e Glaucoma')
          .split(/[+/;]/)
          .map((s) => canonicalizeExamName(s))
          .filter(Boolean);

        examParts.forEach((singleExam) => {
          const valNum = parseSpreadsheetCurrencyCell(String(r.valorExame ?? ''));
          const repNum = parseSpreadsheetCurrencyCell(String(r.repasseValor ?? ''));
          const auto = resolveAutoPrice(effectiveConv, singleExam, []);
          fromJson.push({
            seqNumber: fromJson.length + 1,
            pedidoEmed: effectivePed,
            pacienteNome: effectivePac,
            dataRealizado: effectiveDate,
            convenio: effectiveConv,
            unidadeIndicadora: effectiveUnid,
            medicoOpto: effectiveMed,
            repasseValor: repNum > 0 || valNum > 0 ? repNum : auto.repasseValor,
            valorExame: valNum > 0 ? valNum : auto.valorExame,
            exameTipo: singleExam,
            observacoes: String(r.observacoes || 'a ser entregue').trim(),
          });
        });
      });
      return fromJson;
    } catch {
      // continua para o parser CSV
    }
  }

  const rawLines = trimmed
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  const firstLine = rawLines[0];
  const delimiter: ',' | ';' =
    firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  // Verifica se a primeira linha é cabeçalho ("Nº" ou "PEDIDO")
  const firstCols = parseCsvLine(firstLine, delimiter).map((c) =>
    c.trim().toUpperCase()
  );
  const hasHeader =
    firstCols[0] === 'Nº' ||
    firstCols[0] === 'N' ||
    firstCols[1]?.includes('PEDIDO') ||
    firstCols[2]?.includes('PACIENTE');

  const startIdx = hasHeader ? 1 : 0;
  const parsedRecords: NewExamInput[] = [];

  let lastPaciente = '';
  let lastPedido = '';
  let lastDataISO = fallbackDateISO;
  let lastConvenio = 'SÃO MIGUEL';
  let lastUnidade = 'São Mateus 1';
  let lastMedico = 'FORA';

  for (let i = startIdx; i < rawLines.length; i++) {
    const cols = parseCsvLine(rawLines[i], delimiter).map((c) => c.trim());
    if (cols.length < 3) continue;

    const pedidoEmed = cols[1] || '';
    const pacienteNome = cols[2] || '';
    const dataRaw = cols[3] || '';
    const convenio = cols[4] || '';
    const unidadeIndicadora = cols[5] || '';
    const medicoOpto = cols[6] || '';
    const repasseRaw = cols[7] || '';
    const valorRaw = cols[8] || '';
    const exameTipo = cols[9] || '';
    const obs = cols[10] || '';

    // Ignorar linhas completamente vazias (ex: 3,,,,,,,,,,,Formula de Contagem...)
    if (!pacienteNome && !pedidoEmed && !exameTipo) {
      continue;
    }

    const effectivePaciente = (
      pacienteNome ||
      lastPaciente ||
      (pedidoEmed ? `PACIENTE PEDIDO #${pedidoEmed}` : '')
    ).toUpperCase();

    if (!effectivePaciente) continue;

    const effectivePedido =
      pedidoEmed ||
      (effectivePaciente === lastPaciente ? lastPedido : '');
    const effectiveDataISO = dataRaw
      ? parseBRDateToISO(dataRaw, lastDataISO)
      : lastDataISO;
    const effectiveConvenio = (convenio || lastConvenio || 'SÃO MIGUEL').toUpperCase();
    const effectiveUnidade = canonicalizeUnidadeName(
      unidadeIndicadora || lastUnidade || 'São Mateus 1'
    );
    const effectiveMedico = (medicoOpto || lastMedico || 'FORA').toUpperCase();

    lastPaciente = effectivePaciente;
    lastPedido = effectivePedido;
    lastDataISO = effectiveDataISO;
    lastConvenio = effectiveConvenio;
    lastUnidade = effectiveUnidade;
    lastMedico = effectiveMedico;

    // Caso uma célula de exame tenha múltiplos exames separados por "/" ou "+"
    const examParts = (exameTipo || 'OCT de Retina e Glaucoma')
      .split(/[+/;]/)
      .map((s) => canonicalizeExamName(s))
      .filter(Boolean);

    for (const singleExam of examParts) {
      const parsedVal = parseSpreadsheetCurrencyCell(valorRaw);
      const parsedRep = parseSpreadsheetCurrencyCell(repasseRaw);
      const auto = resolveAutoPrice(effectiveConvenio, singleExam, []);

      parsedRecords.push({
        seqNumber: parsedRecords.length + 1,
        pedidoEmed: effectivePedido,
        pacienteNome: effectivePaciente,
        dataRealizado: effectiveDataISO,
        convenio: effectiveConvenio,
        unidadeIndicadora: effectiveUnidade,
        medicoOpto: effectiveMedico,
        repasseValor:
          parsedRep > 0 || parsedVal > 0 ? parsedRep : auto.repasseValor,
        valorExame: parsedVal > 0 ? parsedVal : auto.valorExame,
        exameTipo: singleExam,
        observacoes: obs || 'a ser entregue',
      });
    }
  }

  return parsedRecords;
}

export function triggerDownloadSpreadsheetCSV(
  records: ExamRecordDoc[],
  filename = 'CENTRO DIAGNOSTICO - SAO MATEUS 1 - 2026.csv'
): void {
  const csvContent = buildExactAttachedSpreadsheetCSV(records);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Grava diretamente no arquivo .CSV vinculado no computador do usuário (File System Access API)
 */
export async function writeToLinkedLocalCSV(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileHandle: any,
  records: ExamRecordDoc[]
): Promise<boolean> {
  if (!fileHandle) return false;
  try {
    const csvContent = buildExactAttachedSpreadsheetCSV(records);
    const writable = await fileHandle.createWritable();
    await writable.write(csvContent);
    await writable.close();
    return true;
  } catch (err) {
    console.error('Erro ao gravar no arquivo CSV vinculado:', err);
    return false;
  }
}
