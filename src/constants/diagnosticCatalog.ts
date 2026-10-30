/**
 * Catálogo, constantes de validação (sincronizadas com firebase-blueprint.json e firestore.rules)
 * e tabela padrão de valores/repasses da Recepção do Centro Diagnóstico São Mateus 1 — Oftalmomed.
 *
 * REGRA OFICIAL DE REPASSE DA RECEPÇÃO (Realização de Exames):
 * - PARTICULAR / PART/ATO: 3% sobre o Valor do Exame
 * - CONVÊNIOS (São Miguel Saúde, Amil, Bradesco, etc.): 10% sobre o Valor do Exame
 */

export const OFFICIAL_ADMIN_SITE_DOMAIN = 'cdooftalmomedsaomateus1.com';
export const OFFICIAL_PATIENT_PORTAL_DOMAIN = 'resultadoexamesoftalmomed.com';

export const DEV_CLOUD_APP_ORIGIN =
  'https://ais-dev-msfvilvixzic65k75dy67k-497231346321.us-west1.run.app';
export const SHARED_CLOUD_APP_ORIGIN =
  'https://ais-pre-msfvilvixzic65k75dy67k-497231346321.us-west1.run.app';

/**
 * Retorna a origem ativa atual do aplicativo para que o link funcione
 * imediatamente tanto no ambiente atual quanto no link compartilhado.
 */
export function resolveFunctionalBaseOrigin(): string {
  if (typeof window === 'undefined') {
    return SHARED_CLOUD_APP_ORIGIN;
  }
  return window.location.origin;
}

export function getWorkingAdminSiteUrl(): string {
  const base = resolveFunctionalBaseOrigin();
  if (base.toLowerCase().includes(OFFICIAL_ADMIN_SITE_DOMAIN)) {
    return base;
  }
  return `${base}/?modo=admin`;
}

export function getWorkingPatientPortalUrl(): string {
  const base = resolveFunctionalBaseOrigin();
  if (base.toLowerCase().includes(OFFICIAL_PATIENT_PORTAL_DOMAIN)) {
    return base;
  }
  return `${base}/?portal=paciente#retirada`;
}

export const OFFICIAL_ADMIN_SITE_URL = `${SHARED_CLOUD_APP_ORIGIN}/?modo=admin`;
export const OFFICIAL_PATIENT_PORTAL_URL = `${SHARED_CLOUD_APP_ORIGIN}/?portal=paciente#retirada`;

export const VALIDATION_LIMITS = {
  OWNER_ID_MAX: 128,
  PEDIDO_EMED_MAX: 40,
  PACIENTE_NOME_MIN: 1,
  PACIENTE_NOME_MAX: 120,
  CONVENIO_MIN: 1,
  CONVENIO_MAX: 60,
  UNIDADE_MAX: 60,
  MEDICO_MAX: 80,
  EXAME_MIN: 1,
  EXAME_MAX: 60,
  OBS_MAX: 300,
  VALOR_MIN: 0,
  VALOR_MAX: 100000,
  SEQ_MIN: 1,
  SEQ_MAX: 999999,
  LOGIN_MAX: 60,
  SENHA_MAX: 60,
  ARQUIVO_NOME_MAX: 180,
  ARQUIVO_MIME_MAX: 80,
  ARQUIVO_CONTEUDO_MAX: 850000,
  LAUDO_OBS_MAX: 1000,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  MONTH_PATTERN: /^\d{4}-\d{2}$/,
} as const;

export const EXAMES_PLANILHA_OFICIAL = [
  'Mapeamento de Retina',
  'OCT de Retina e Glaucoma',
  'Retinografia Colorida',
  'Campimetria',
  'Tonometria a Ar',
  'Topografia',
  'Paquimetria',
  'Aberrometria',
  'Microscopia',
  'WaveFront',
  'Pentacam',
] as const;

export const EXAMES_COMPLEMENTARES = [] as const;

export const TODOS_EXAMES = [
  ...EXAMES_PLANILHA_OFICIAL,
] as const;

export const CONVENIOS_PADRAO = [
  'SÃO MIGUEL',
  'PARTICULAR',
  'PART/ATO',
  'NIPOMED',
  'AMIL',
  'BRADESCO SAÚDE',
  'SULAMÉRICA',
  'NOTREDAME INTERMÉDICA',
  'PREVENT SENIOR',
  'UNIMED',
  'PORTO SEGURO',
  'CORTESIA / RETORNO',
] as const;

/**
 * Unidades Oficiais OftalmoMed (29 unidades)
 */
export const UNIDADES_INDICADORAS_PADRAO = [
  'Campo Limpo',
  'Capão Redondo',
  'Carapicuiba',
  'Guarulhos - Gabinete',
  'Guarulhos Jd São João',
  'Heliopolis',
  'Imperador',
  'Ipiranga',
  'Itaim',
  'Itaim II',
  'Itu',
  'Lapa',
  'Mercês',
  'Parque Independência/Jd Angela',
  'Pirajussara',
  'Pirajussara II',
  'Rudge Ramos',
  'Santo Amaro',
  'Santo André',
  'Santo Eduardo/Embu',
  'São Bernardo',
  'São Mateus 1',
  'São Mateus II',
  'São Miguel 1',
  'São Miguel II',
  'São Miguel III - Serra Dourada',
  'São Miguel IV',
  'Zaíra',
  'Jardins',
] as const;

/**
 * Lista de Médicos e Optometristas sugeridos na Planilha Oficial
 */
export const GOOGLE_SHEET_VALID_MEDICOS = [
  'FORA',
  'MÉDICO DE FORA',
  'DR JOSÉ EDUARDO FERREIRA DA COSTA',
  'DR.RAMY BACHIO GHANDOUR',
  'DR. HELDER VASCONCELOS',
  'DR.RAMY',
  'DRA.ELAINE',
  'OPTO.PAULO',
  'DRA.REGINA',
  'DR.RODRIGO JORGE',
  'DR.MARCO ANTONIO',
  'Dr. José Eduardo',
  'Dra.Maria Alice',
  'Dra.Dafila Gabriela',
  'Dr.Gileade',
  'Dr.Caio Cesar',
  'DR.EDSON',
  'José Eduardo Ferreira da Costa',
  'Dra. Rosangela',
  'Opto.Tatiana',
  'DRA.VERA',
  'Dr.Alexandre',
  'Dr.João Vitor',
  'Dr. Bernardo',
  'Dr. Sandro Ribeiro',
  'Dr. Gabriel Perone',
  'Dr.Jose Vitor Barros Calil',
  'Dra.Fernada Cobo',
  'Marco Antonio Ferreira de Sousa Filho',
  'Rodrigo Cozar Silva',
  'Gustavo Gabriel Zonaro',
  'Dr.Pedro Henrique Polotto',
  'Dr.Arthur Matos de Almeida',
  'Opto.Luciana',
  'Fernanda Terra',
  'Opto. Andressa Silva',
  'Eduardo Rogalla',
  'Marina Affonso dos Santos',
  'Dr. Alexandre Coelho',
  'DR.Matheus Silva',
  'Ramon Luis Perdigão Thomas',
  'Eduardo Rogalla Wiecheteck',
] as const;

export const MEDICOS_OPTO_PADRAO = [
  'FORA',
  'MÉDICO DE FORA',
  'DR JOSÉ EDUARDO FERREIRA DA COSTA',
  'DR.RAMY BACHIO GHANDOUR',
  'DR. HELDER VASCONCELOS',
  'DR.RAMY',
  'DRA.ELAINE',
  'OPTO.PAULO',
  'DRA.REGINA',
  'DR.RODRIGO JORGE',
  'DR.MARCO ANTONIO',
  'DR. JOSÉ EDUARDO',
  'DRA.MARIA ALICE',
  'DRA.DAFILA GABRIELA',
  'DR.GILEADE',
  'DR.CAIO CESAR',
  'DR.EDSON',
  'DRA. ROSANGELA',
  'OPTO.TATIANA',
  'DRA.VERA',
  'DR.ALEXANDRE',
  'DR.JOÃO VITOR',
  'DR. BERNARDO',
  'DR. SANDRO RIBEIRO',
  'DR. GABRIEL PERONE',
  'DR.JOSE VITOR BARROS CALIL',
  'DRA.FERNADA COBO',
  'DR.PEDRO HENRIQUE POLOTTO',
  'DR.ARTHUR MATOS DE ALMEIDA',
  'OPTO.LUCIANA',
  'FERNANDA TERRA',
  'OPTO. ANDRESSA SILVA',
  'EDUARDO ROGALLA',
  'MARINA AFFONSO DOS SANTOS',
  'DR. ALEXANDRE COELHO',
  'DR.MATHEUS SILVA',
  'RAMON LUIS PERDIGÃO THOMAS',
  'EDUARDO ROGALLA WIECHETECK',
] as const;

function normalizeAlphaNum(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Preserva exatamente o nome do Médico/Opto exibido no painel Web ("Planilha & Produção")
 * para que a Planilha Google Online fique 100% idêntica ao Web sem substituir nem truncar nomes.
 */
export function formatMedicoForGoogleSheet(rawMedico: string): string {
  const clean = String(rawMedico || '').trim().toUpperCase();
  return clean || 'FORA';
}

/**
 * Preserva exatamente o Convênio exibido no painel Web ("Planilha & Produção"),
 * incluindo novos convênios cadastrados (ex: NIPOMED, AMIL, etc.), para que a Planilha Google Online
 * fique 100% idêntica ao Web.
 */
export function formatConvenioForGoogleSheet(rawConvenio: string): string {
  const up = String(rawConvenio || '').trim().toUpperCase();
  if (!up) return 'SÃO MIGUEL';
  if (up === 'SAO MIGUEL' || up === 'SÃO MIGUEL SAÚDE' || up === 'SAO MIGUEL SAUDE') {
    return 'SÃO MIGUEL';
  }
  return up;
}

/**
 * Normaliza e preserva o nome oficial da Unidade OftalmoMed (entre as 29 unidades cadastradas)
 */
export function canonicalizeUnidadeName(rawUnidade: string): string {
  const trimmed = String(rawUnidade || '').trim();
  if (!trimmed) return 'São Mateus 1';
  const key = normalizeAlphaNum(trimmed);

  for (const unit of UNIDADES_INDICADORAS_PADRAO) {
    if (normalizeAlphaNum(unit) === key) {
      return unit;
    }
  }

  const legacyAliases: Record<string, string> = {
    SAOMATEUS1: 'São Mateus 1',
    SAOMATEUSI: 'São Mateus 1',
    SAOMATEUS2: 'São Mateus II',
    SAOMATEUSII: 'São Mateus II',
    SAOMIGUEL: 'São Miguel 1',
    SAOMIGUEL1: 'São Miguel 1',
    SAOMIGUEL2: 'São Miguel II',
    SAOMIGUEL3: 'São Miguel III - Serra Dourada',
    SAOMIGUEL4: 'São Miguel IV',
    ITAIM1: 'Itaim',
    PIRAJUSSARA1: 'Pirajussara',
    SANTOEDUARDO: 'Santo Eduardo/Embu',
    EMBU: 'Santo Eduardo/Embu',
    PARQUEINDEPENDENCIA: 'Parque Independência/Jd Angela',
    JDANGELA: 'Parque Independência/Jd Angela',
    GUARULHOS: 'Guarulhos - Gabinete',
  };

  return legacyAliases[key] || trimmed;
}

export function formatUnidadeForGoogleSheet(rawUnidade: string): string {
  return canonicalizeUnidadeName(rawUnidade);
}

/**
 * Converte qualquer variante ou abreviação de exame para um dos 11 Exames Oficiais OftalmoMed:
 * Mapeamento de Retina, OCT de Retina e Glaucoma, Retinografia Colorida, Campimetria,
 * Tonometria a Ar, Topografia, Paquimetria, Aberrometria, Microscopia, WaveFront, Pentacam
 */
export function canonicalizeExamName(rawExame: string): string {
  const trimmed = String(rawExame || '').trim();
  if (!trimmed) return 'OCT de Retina e Glaucoma';
  const key = normalizeAlphaNum(trimmed);

  for (const ex of EXAMES_PLANILHA_OFICIAL) {
    if (normalizeAlphaNum(ex) === key) {
      return ex;
    }
  }

  if (key.includes('MAPEAMENTO')) return 'Mapeamento de Retina';
  if (key.includes('OCT')) return 'OCT de Retina e Glaucoma';
  if (key.includes('RETINOGRAFIA')) return 'Retinografia Colorida';
  if (key.includes('CAMPIMETRIA')) return 'Campimetria';
  if (key.includes('TONOMETRIA') || key.includes('CURVA') || key.includes('GONIOSCOPIA'))
    return 'Tonometria a Ar';
  if (key.includes('TOPOGRAFIA')) return 'Topografia';
  if (key.includes('PAQUIMETRIA') || key.includes('PAM')) return 'Paquimetria';
  if (key.includes('ABERROMETRIA')) return 'Aberrometria';
  if (key.includes('MICROSCOPIA') || key.includes('BIOMETRIA')) return 'Microscopia';
  if (key.includes('WAVEFRONT') || key.includes('WAVE')) return 'WaveFront';
  if (key.includes('PENTACAM') || key.includes('PENTACAN')) return 'Pentacam';

  return trimmed;
}

export function formatExameForGoogleSheet(rawExame: string): string {
  return canonicalizeExamName(rawExame);
}

export const OBS_STATUS_PADRAO = [
  'a ser entregue',
  'Entregue',
  'Laudo Pendente',
  'Entregue ao Médico',
] as const;

export interface DiagnosticKit {
  id: string;
  nome: string;
  descricao: string;
  exames: string[];
}

export const KITS_DIAGNOSTICOS: DiagnosticKit[] = [
  {
    id: 'kit-retina-camp-paq',
    nome: 'Retinografia + Campimetria + Paquimetria',
    descricao: 'Retinografia Colorida + Campimetria + Paquimetria',
    exames: ['Retinografia Colorida', 'Campimetria', 'Paquimetria'],
  },
  {
    id: 'kit-glaucoma-completo',
    nome: 'Protocolo Glaucoma Completo',
    descricao: 'Campimetria + OCT de Retina e Glaucoma + Tonometria a Ar + Paquimetria',
    exames: [
      'Campimetria',
      'OCT de Retina e Glaucoma',
      'Tonometria a Ar',
      'Paquimetria',
    ],
  },
  {
    id: 'kit-glaucoma-basico',
    nome: 'Triagem Glaucoma / Pressão',
    descricao: 'Tonometria a Ar + Paquimetria + Retinografia Colorida',
    exames: ['Tonometria a Ar', 'Paquimetria', 'Retinografia Colorida'],
  },
  {
    id: 'kit-cornea-ceratocone',
    nome: 'Protocolo Córnea / Ceratocone',
    descricao: 'Pentacam + Topografia + Paquimetria',
    exames: ['Pentacam', 'Topografia', 'Paquimetria'],
  },
  {
    id: 'kit-pre-catarata',
    nome: 'Pré-Operatório Catarata & Refrativa',
    descricao: 'Microscopia + Topografia + Paquimetria + Aberrometria',
    exames: ['Microscopia', 'Topografia', 'Paquimetria', 'Aberrometria'],
  },
  {
    id: 'kit-retina',
    nome: 'Avaliação Completa de Retina',
    descricao: 'Mapeamento de Retina + OCT de Retina e Glaucoma + Retinografia Colorida',
    exames: [
      'Mapeamento de Retina',
      'OCT de Retina e Glaucoma',
      'Retinografia Colorida',
    ],
  },
];

export interface DefaultPriceEntry {
  valorExame: number;
  repasseValor: number;
}

/**
 * Retorna a alíquota oficial de repasse de realização (que realiza o exame):
 * - Particular / Part/Ato: 3% (0.03)
 * - Convênios (São Miguel Saúde, etc.): 10% (0.10)
 * - Cortesia / Retorno: 0% (0)
 */
export function getReceptionRepasseRate(convenio: string): number {
  const norm = (convenio || '').trim().toUpperCase();
  if (norm.includes('CORTESIA') || norm.includes('RETORNO')) {
    return 0;
  }
  if (
    norm === 'PARTICULAR' ||
    norm === 'PART/ATO' ||
    norm.startsWith('PART')
  ) {
    return 0.03; // 3% Particular
  }
  return 0.1; // 10% Convênios
}

export const getRealizacaoRepasseRate = getReceptionRepasseRate;

/**
 * Calcula automaticamente o valor de Repasse de Realização (em R$)
 * aplicando 3% para Particular/Part-Ato e 10% para Convênios sobre o Valor do Exame.
 */
export function calculateReceptionRepasse(
  valorExame: number,
  convenio: string
): number {
  if (!Number.isFinite(valorExame) || valorExame <= 0) return 0;
  const rate = getReceptionRepasseRate(convenio);
  return Number((valorExame * rate).toFixed(2));
}

export const calculateRealizacaoRepasse = calculateReceptionRepasse;

export interface ExamValidationAudit {
  isValid: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  allMissing: string[];
}

/**
 * Identifica campos com informações pendentes ou faltantes em um registro de exame.
 */
export function getMissingExamFields(exam: {
  pacienteNome?: string;
  pedidoEmed?: string;
  dataRealizado?: string;
  convenio?: string;
  unidadeIndicadora?: string;
  medicoOpto?: string;
  exameTipo?: string;
  valorExame?: number;
  repasseValor?: number;
}): ExamValidationAudit {
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  const paciente = (exam.pacienteNome || '').trim();
  if (!paciente || paciente.length < 2) {
    missingRequired.push('Nome do Paciente');
  }

  const data = (exam.dataRealizado || '').trim();
  if (!data) {
    missingRequired.push('Data de Realização');
  }

  const conv = (exam.convenio || '').trim();
  if (!conv) {
    missingRequired.push('Convênio');
  }

  const tipo = (exam.exameTipo || '').trim();
  if (!tipo) {
    missingRequired.push('Exame Realizado');
  }

  const ped = (exam.pedidoEmed || '').trim().toUpperCase();
  if (!ped || ped === 'S/N' || ped === 'SEM NUMERO' || ped === '0') {
    missingRecommended.push('Pedido eMed');
  }

  const unid = (exam.unidadeIndicadora || '').trim().toUpperCase();
  if (!unid || unid === 'NÃO INFORMADA' || unid === 'NAO INFORMADA' || unid === 'SEM UNIDADE') {
    missingRecommended.push('Unidade Indicadora');
  }

  const med = (exam.medicoOpto || '').trim().toUpperCase();
  if (!med || med === 'FORA' || med === 'SEM MÉDICO' || med === 'SEM MEDICO' || med === 'NÃO INFORMADO') {
    missingRecommended.push('Médico/Opto Solicitante');
  }

  const valor = Number(exam.valorExame);
  if (!Number.isFinite(valor) || valor <= 0) {
    missingRecommended.push('Valor do Exame (R$ 0,00)');
  }

  const allMissing = [...missingRequired, ...missingRecommended];

  return {
    isValid: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
    allMissing,
  };
}

/**
 * Linhas iniciais sincronizadas com o banco da unidade São Mateus 1:
 */
export const INITIAL_ATTACHED_SPREADSHEET_ROWS = [
  {
    seqNumber: 1,
    pedidoEmed: '934257',
    pacienteNome: 'MARCELO ARAUJO DE OLIVEIRA',
    dataRealizado: '2026-10-07',
    convenio: 'PARTICULAR',
    unidadeIndicadora: 'São Mateus II',
    medicoOpto: 'DR JOSÉ EDUARDO FERREIRA DA COSTA',
    repasseValor: 7.5,
    valorExame: 250.0,
    exameTipo: 'Topografia',
    observacoes: 'Entregue',
  },
  {
    seqNumber: 2,
    pedidoEmed: '934394',
    pacienteNome: 'NEIDE RIBEIRO DA SILVA',
    dataRealizado: '2026-10-08',
    convenio: 'SÃO MIGUEL',
    unidadeIndicadora: 'São Mateus 1',
    medicoOpto: 'MÉDICO DE FORA',
    repasseValor: 16.0,
    valorExame: 160.0,
    exameTipo: 'OCT de Retina e Glaucoma',
    observacoes: 'a ser entregue',
  },
  {
    seqNumber: 3,
    pedidoEmed: '934586',
    pacienteNome: 'ELISANGELA SOUZA MARTINS',
    dataRealizado: '2026-10-08',
    convenio: 'SÃO MIGUEL',
    unidadeIndicadora: 'São Miguel 1',
    medicoOpto: 'DR.RAMY BACHIO GHANDOUR',
    repasseValor: 3.15,
    valorExame: 31.5,
    exameTipo: 'Campimetria',
    observacoes: 'Entregue',
  },
  {
    seqNumber: 4,
    pedidoEmed: '934586',
    pacienteNome: 'ELISANGELA SOUZA MARTINS',
    dataRealizado: '2026-10-08',
    convenio: 'SÃO MIGUEL',
    unidadeIndicadora: 'São Miguel 1',
    medicoOpto: 'DR.RAMY BACHIO GHANDOUR',
    repasseValor: 5.5,
    valorExame: 55.0,
    exameTipo: 'Paquimetria',
    observacoes: 'Entregue',
  },
  {
    seqNumber: 5,
    pedidoEmed: '934586',
    pacienteNome: 'ELISANGELA SOUZA MARTINS',
    dataRealizado: '2026-10-08',
    convenio: 'SÃO MIGUEL',
    unidadeIndicadora: 'São Miguel 1',
    medicoOpto: 'DR.RAMY BACHIO GHANDOUR',
    repasseValor: 16.0,
    valorExame: 160.0,
    exameTipo: 'OCT de Retina e Glaucoma',
    observacoes: 'Entregue',
  },
  {
    seqNumber: 6,
    pedidoEmed: '934837',
    pacienteNome: 'ADALGIZA VAZ PEREIRA',
    dataRealizado: '2026-10-09',
    convenio: 'NIPOMED',
    unidadeIndicadora: 'São Mateus 1',
    medicoOpto: 'DR. HELDER VASCONCELOS',
    repasseValor: 18.0,
    valorExame: 180.0,
    exameTipo: 'OCT de Retina e Glaucoma',
    observacoes: 'a ser entregue',
  },
  {
    seqNumber: 7,
    pedidoEmed: '934837',
    pacienteNome: 'ADALGIZA VAZ PEREIRA',
    dataRealizado: '2026-10-09',
    convenio: 'NIPOMED',
    unidadeIndicadora: 'São Mateus 1',
    medicoOpto: 'DR. HELDER VASCONCELOS',
    repasseValor: 12.0,
    valorExame: 120.0,
    exameTipo: 'Retinografia Colorida',
    observacoes: 'a ser entregue',
  },
];

/**
 * Tabela base de preenchimento automático calibrada com os 11 Exames Oficiais OftalmoMed:
 * - Repasse de Realização Particular / Part/Ato = 3% do valor do exame
 * - Repasse de Realização Convênios (São Miguel Saúde e Outros) = 10% do valor do exame
 */
export const BASE_EXAM_VALUES: Record<
  string,
  {
    saoMiguel: DefaultPriceEntry;
    particular: DefaultPriceEntry;
    partAto: DefaultPriceEntry;
    outrosConvenios: DefaultPriceEntry;
  }
> = {
  'Mapeamento de Retina': {
    saoMiguel: { valorExame: 80, repasseValor: 8.0 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 140, repasseValor: 4.2 },
    outrosConvenios: { valorExame: 95, repasseValor: 9.5 },
  },
  'OCT de Retina e Glaucoma': {
    saoMiguel: { valorExame: 160, repasseValor: 16.0 },
    particular: { valorExame: 370, repasseValor: 11.1 },
    partAto: { valorExame: 250, repasseValor: 7.5 },
    outrosConvenios: { valorExame: 160, repasseValor: 16.0 },
  },
  'Retinografia Colorida': {
    saoMiguel: { valorExame: 95, repasseValor: 9.5 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 160, repasseValor: 4.8 },
    outrosConvenios: { valorExame: 110, repasseValor: 11.0 },
  },
  Campimetria: {
    saoMiguel: { valorExame: 95, repasseValor: 9.5 },
    particular: { valorExame: 150, repasseValor: 4.5 },
    partAto: { valorExame: 150, repasseValor: 4.5 },
    outrosConvenios: { valorExame: 110, repasseValor: 11.0 },
  },
  'Tonometria a Ar': {
    saoMiguel: { valorExame: 35, repasseValor: 3.5 },
    particular: { valorExame: 150, repasseValor: 4.5 },
    partAto: { valorExame: 60, repasseValor: 1.8 },
    outrosConvenios: { valorExame: 42, repasseValor: 4.2 },
  },
  Topografia: {
    saoMiguel: { valorExame: 36, repasseValor: 3.6 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 250, repasseValor: 7.5 },
    outrosConvenios: { valorExame: 98, repasseValor: 9.8 },
  },
  Paquimetria: {
    saoMiguel: { valorExame: 55, repasseValor: 5.5 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 90, repasseValor: 2.7 },
    outrosConvenios: { valorExame: 65, repasseValor: 6.5 },
  },
  Aberrometria: {
    saoMiguel: { valorExame: 120, repasseValor: 12.0 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 180, repasseValor: 5.4 },
    outrosConvenios: { valorExame: 140, repasseValor: 14.0 },
  },
  Microscopia: {
    saoMiguel: { valorExame: 26.75, repasseValor: 2.68 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 180, repasseValor: 5.4 },
    outrosConvenios: { valorExame: 125, repasseValor: 12.5 },
  },
  WaveFront: {
    saoMiguel: { valorExame: 120, repasseValor: 12.0 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 180, repasseValor: 5.4 },
    outrosConvenios: { valorExame: 140, repasseValor: 14.0 },
  },
  Pentacam: {
    saoMiguel: { valorExame: 160, repasseValor: 16.0 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 250, repasseValor: 7.5 },
    outrosConvenios: { valorExame: 180, repasseValor: 18.0 },
  },
};

export interface CustomPricingRuleDoc {
  id: string;
  ownerId: string;
  convenio: string;
  exameTipo: string;
  valorExame: number;
  repasseValor: number;
}

export function normalizeConvenioKey(convenio: string): string {
  const raw = (convenio || '').trim().toUpperCase();
  if (raw.includes('SÃO MIGUEL') || raw.includes('SAO MIGUEL')) {
    return 'SÃO MIGUEL';
  }
  if (raw.includes('PART/ATO') || raw.includes('ATO')) {
    return 'PART/ATO';
  }
  return raw;
}

export function resolveAutoPrice(
  convenio: string,
  exameTipo: string,
  customRules: CustomPricingRuleDoc[]
): DefaultPriceEntry {
  const normConv = convenio.trim().toUpperCase();
  const normConvKey = normalizeConvenioKey(normConv);
  const canonicalExam = canonicalizeExamName(exameTipo);
  const normExamUpper = canonicalExam.toUpperCase();

  if (normConv.includes('CORTESIA') || normConv.includes('RETORNO')) {
    return { valorExame: 0, repasseValor: 0 };
  }

  // 1. Check user's custom rules first
  const exactCustom = customRules.find(
    (r) =>
      (r.convenio.trim().toUpperCase() === normConv ||
        normalizeConvenioKey(r.convenio) === normConvKey) &&
      (r.exameTipo.trim().toUpperCase() === normExamUpper ||
        canonicalizeExamName(r.exameTipo).toUpperCase() === normExamUpper)
  );
  if (exactCustom) {
    return {
      valorExame: exactCustom.valorExame,
      repasseValor: exactCustom.repasseValor,
    };
  }

  // 2. Fallback to built-in matrix (3% Particular/Part-Ato, 10% Convênios)
  const base = BASE_EXAM_VALUES[canonicalExam] || {
    saoMiguel: { valorExame: 160, repasseValor: 16.0 },
    particular: { valorExame: 250, repasseValor: 7.5 },
    partAto: { valorExame: 250, repasseValor: 7.5 },
    outrosConvenios: { valorExame: 160, repasseValor: 16.0 },
  };

  if (normConvKey === 'SÃO MIGUEL') {
    return base.saoMiguel;
  }
  if (normConvKey === 'PARTICULAR') {
    return base.particular;
  }
  if (normConvKey === 'PART/ATO') {
    return base.partAto;
  }
  return base.outrosConvenios;
}

export function sanitizeString(val: string, maxLength: number): string {
  return val.trim().slice(0, maxLength);
}

export function clampNumber(val: number, min: number, max: number): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, Number(val.toFixed(2))));
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function parseBRDateToISO(input: string, fallbackISO: string): string {
  const clean = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return fallbackISO;
}

export function formatMonthLabel(yyyyMm: string): string {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm;
  const [year, month] = yyyyMm.split('-').map(Number);
  const months = [
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
  return `${months[(month - 1) % 12] || ''} de ${year}`;
}

export function getMonthNameFromISO(isoDate: string): string {
  if (!isoDate || isoDate.length < 7) return 'Outubro';
  const monthNum = parseInt(isoDate.slice(5, 7), 10);
  const months = [
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
  return months[(monthNum - 1) % 12] || 'Outubro';
}
