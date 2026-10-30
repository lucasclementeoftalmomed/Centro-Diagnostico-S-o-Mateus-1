import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  VALIDATION_LIMITS,
  sanitizeString,
  clampNumber,
} from '../constants/diagnosticCatalog';

export interface ExamRecordDoc {
  id: string;
  ownerId: string;
  seqNumber: number;
  pedidoEmed: string;
  pacienteNome: string;
  dataRealizado: string; // YYYY-MM-DD
  mesCompetencia: string; // YYYY-MM
  convenio: string;
  unidadeIndicadora: string;
  medicoOpto: string;
  repasseValor: number;
  valorExame: number;
  exameTipo: string;
  observacoes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NewExamInput {
  seqNumber: number;
  pedidoEmed: string;
  pacienteNome: string;
  dataRealizado: string;
  convenio: string;
  unidadeIndicadora: string;
  medicoOpto: string;
  repasseValor: number;
  valorExame: number;
  exameTipo: string;
  observacoes?: string;
}

export interface ExamDeliveryDoc {
  id: string;
  ownerId: string;
  examRecordId: string;
  seqNumber: number;
  pedidoEmed: string;
  pacienteNome: string;
  exameTipo: string;
  dataRealizado: string;
  pacienteLogin: string;
  pacienteSenha: string;
  arquivoNome: string;
  arquivoMime: string;
  arquivoConteudo: string;
  laudoObservacoes: string;
  retiradoEm: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NewExamDeliveryInput {
  examRecordId: string;
  seqNumber: number;
  pedidoEmed: string;
  pacienteNome: string;
  exameTipo: string;
  dataRealizado: string;
  pacienteLogin: string;
  pacienteSenha: string;
  arquivoNome: string;
  arquivoMime: string;
  arquivoConteudo: string;
  laudoObservacoes?: string;
  retiradoEm?: string;
}

export interface ClinicConfigDoc {
  ownerId: string;
  unidadePadrao: string;
  metaMensalExames: number;
  metaMensalFaturamento: number;
}

export function generateSafeId(prefix: string): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now()}_${randomPart}`;
}

/**
 * Gera Login e Senha unificados POR PACIENTE (mesmo login e mesma senha para todos os exames do mesmo paciente/pedido)
 */
export function generateDefaultPatientCredentials(
  pedidoEmed: string,
  pacienteNome: string,
  seqNumber: number
): { login: string; senha: string } {
  const cleanPedido = (pedidoEmed || '').replace(/\D/g, '').trim();
  const fullCleanName = (pacienteNome || 'PACIENTE')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toUpperCase();
  const firstWord = fullCleanName.split(/\s+/)[0] || 'PACIENTE';

  const login = cleanPedido || `${firstWord}${seqNumber}`;
  // Senha determinística de 6 dígitos por paciente (baseada no pedido + nome do paciente, sem depender do seqNumber quando houver nome/pedido)
  const patientIdentity = cleanPedido || fullCleanName || String(seqNumber);
  const seedStr = `${login}_${patientIdentity}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 900000;
  }
  const code = String(Math.abs(hash) + 100000).slice(0, 6);
  return {
    login,
    senha: code,
  };
}

function sanitizeExamPayload(ownerId: string, input: NewExamInput) {
  const safeOwnerId = sanitizeString(ownerId, VALIDATION_LIMITS.OWNER_ID_MAX);
  const safeDate = VALIDATION_LIMITS.DATE_PATTERN.test(input.dataRealizado)
    ? input.dataRealizado
    : '2026-10-08';
  const safeMonth = safeDate.slice(0, 7);

  const safePaciente =
    sanitizeString(
      input.pacienteNome.toUpperCase(),
      VALIDATION_LIMITS.PACIENTE_NOME_MAX
    ) || 'PACIENTE NÃO IDENTIFICADO';
  const safeConvenio =
    sanitizeString(
      input.convenio.toUpperCase(),
      VALIDATION_LIMITS.CONVENIO_MAX
    ) || 'SÃO MIGUEL';
  const safeExame =
    sanitizeString(input.exameTipo.toUpperCase(), VALIDATION_LIMITS.EXAME_MAX) ||
    'OCT';

  return {
    ownerId: safeOwnerId,
    seqNumber: Math.max(
      VALIDATION_LIMITS.SEQ_MIN,
      Math.min(VALIDATION_LIMITS.SEQ_MAX, Math.round(input.seqNumber || 1))
    ),
    pedidoEmed: sanitizeString(
      input.pedidoEmed,
      VALIDATION_LIMITS.PEDIDO_EMED_MAX
    ),
    pacienteNome: safePaciente,
    dataRealizado: safeDate,
    mesCompetencia: safeMonth,
    convenio: safeConvenio,
    unidadeIndicadora: sanitizeString(
      input.unidadeIndicadora.toUpperCase(),
      VALIDATION_LIMITS.UNIDADE_MAX
    ),
    medicoOpto: sanitizeString(
      input.medicoOpto.toUpperCase(),
      VALIDATION_LIMITS.MEDICO_MAX
    ),
    repasseValor: clampNumber(
      Number(input.repasseValor),
      VALIDATION_LIMITS.VALOR_MIN,
      VALIDATION_LIMITS.VALOR_MAX
    ),
    valorExame: clampNumber(
      Number(input.valorExame),
      VALIDATION_LIMITS.VALOR_MIN,
      VALIDATION_LIMITS.VALOR_MAX
    ),
    exameTipo: safeExame,
    observacoes: sanitizeString(
      input.observacoes || '',
      VALIDATION_LIMITS.OBS_MAX
    ),
  };
}

function sanitizeExamDeliveryPayload(
  ownerId: string,
  input: NewExamDeliveryInput
) {
  const safeOwnerId = sanitizeString(ownerId, VALIDATION_LIMITS.OWNER_ID_MAX);
  const safeDate = VALIDATION_LIMITS.DATE_PATTERN.test(input.dataRealizado)
    ? input.dataRealizado
    : '2026-10-08';
  const safePaciente =
    sanitizeString(
      input.pacienteNome.toUpperCase(),
      VALIDATION_LIMITS.PACIENTE_NOME_MAX
    ) || 'PACIENTE';
  const safeExame =
    sanitizeString(input.exameTipo.toUpperCase(), VALIDATION_LIMITS.EXAME_MAX) ||
    'EXAME OFTALMOLÓGICO';
  const defaults = generateDefaultPatientCredentials(
    input.pedidoEmed,
    safePaciente,
    input.seqNumber || 1
  );

  return {
    ownerId: safeOwnerId,
    examRecordId:
      sanitizeString(input.examRecordId || `seq_${input.seqNumber}`, 128) ||
      'seq_1',
    seqNumber: Math.max(
      VALIDATION_LIMITS.SEQ_MIN,
      Math.min(VALIDATION_LIMITS.SEQ_MAX, Math.round(input.seqNumber || 1))
    ),
    pedidoEmed: sanitizeString(
      input.pedidoEmed || '',
      VALIDATION_LIMITS.PEDIDO_EMED_MAX
    ),
    pacienteNome: safePaciente,
    exameTipo: safeExame,
    dataRealizado: safeDate,
    pacienteLogin:
      sanitizeString(
        input.pacienteLogin || defaults.login,
        VALIDATION_LIMITS.LOGIN_MAX
      ) || defaults.login,
    pacienteSenha:
      sanitizeString(
        input.pacienteSenha || defaults.senha,
        VALIDATION_LIMITS.SENHA_MAX
      ) || defaults.senha,
    arquivoNome: sanitizeString(
      input.arquivoNome || '',
      VALIDATION_LIMITS.ARQUIVO_NOME_MAX
    ),
    arquivoMime: sanitizeString(
      input.arquivoMime || '',
      VALIDATION_LIMITS.ARQUIVO_MIME_MAX
    ),
    arquivoConteudo: (input.arquivoConteudo || '').slice(
      0,
      VALIDATION_LIMITS.ARQUIVO_CONTEUDO_MAX
    ),
    laudoObservacoes: sanitizeString(
      input.laudoObservacoes || '',
      VALIDATION_LIMITS.LAUDO_OBS_MAX
    ),
    retiradoEm: sanitizeString(input.retiradoEm || '', 40),
  };
}

export async function createExamRecord(
  ownerId: string,
  input: NewExamInput,
  customId?: string
): Promise<string> {
  const recordId =
    customId && VALIDATION_LIMITS.ID_PATTERN.test(customId)
      ? customId
      : generateSafeId('exm');
  const path = `exam_records/${recordId}`;
  const clean = sanitizeExamPayload(ownerId, input);

  try {
    await setDoc(doc(db, 'exam_records', recordId), {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return recordId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createBatchExamRecords(
  ownerId: string,
  inputs: NewExamInput[],
  customIds?: string[]
): Promise<string[]> {
  if (inputs.length === 0) return [];
  const batch = writeBatch(db);
  const path = 'exam_records';
  const ids: string[] = [];

  try {
    for (let i = 0; i < inputs.length; i++) {
      const item = inputs[i];
      const candidateId = customIds?.[i];
      const recordId =
        candidateId && VALIDATION_LIMITS.ID_PATTERN.test(candidateId)
          ? candidateId
          : `${generateSafeId('exm')}_${i}`;
      ids.push(recordId);
      const clean = sanitizeExamPayload(ownerId, item);
      batch.set(doc(db, 'exam_records', recordId), {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return ids;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateExamRecord(
  recordId: string,
  ownerId: string,
  input: NewExamInput
): Promise<void> {
  const path = `exam_records/${recordId}`;
  const clean = sanitizeExamPayload(ownerId, input);

  try {
    await updateDoc(doc(db, 'exam_records', recordId), {
      seqNumber: clean.seqNumber,
      pedidoEmed: clean.pedidoEmed,
      pacienteNome: clean.pacienteNome,
      dataRealizado: clean.dataRealizado,
      mesCompetencia: clean.mesCompetencia,
      convenio: clean.convenio,
      unidadeIndicadora: clean.unidadeIndicadora,
      medicoOpto: clean.medicoOpto,
      repasseValor: clean.repasseValor,
      valorExame: clean.valorExame,
      exameTipo: clean.exameTipo,
      observacoes: clean.observacoes,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeExamRecord(recordId: string): Promise<void> {
  const path = `exam_records/${recordId}`;
  try {
    await deleteDoc(doc(db, 'exam_records', recordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Sincroniza a lista completa vinda da Planilha (incluindo apagar do Firestore exames que foram apagados na Planilha)
 */
export async function reconcileExamRecordsInCloud(
  ownerId: string,
  currentDocs: ExamRecordDoc[],
  nextDocs: ExamRecordDoc[]
): Promise<void> {
  const batch = writeBatch(db);
  const nextIds = new Set(nextDocs.map((d) => d.id));

  try {
    // 1. Apagar do banco todos os registros que foram removidos da planilha
    for (const oldDoc of currentDocs) {
      if (
        !nextIds.has(oldDoc.id) &&
        !oldDoc.id.startsWith('seed_') &&
        !oldDoc.id.startsWith('local_')
      ) {
        batch.delete(doc(db, 'exam_records', oldDoc.id));
      }
    }

    // 2. Criar ou atualizar os registros presentes na planilha
    const oldMap = new Map(currentDocs.map((d) => [d.id, d]));
    for (const item of nextDocs) {
      const clean = sanitizeExamPayload(ownerId, item);
      const existed =
        oldMap.has(item.id) &&
        !item.id.startsWith('seed_') &&
        !item.id.startsWith('local_');
      if (existed) {
        batch.update(doc(db, 'exam_records', item.id), {
          seqNumber: clean.seqNumber,
          pedidoEmed: clean.pedidoEmed,
          pacienteNome: clean.pacienteNome,
          dataRealizado: clean.dataRealizado,
          mesCompetencia: clean.mesCompetencia,
          convenio: clean.convenio,
          unidadeIndicadora: clean.unidadeIndicadora,
          medicoOpto: clean.medicoOpto,
          repasseValor: clean.repasseValor,
          valorExame: clean.valorExame,
          exameTipo: clean.exameTipo,
          observacoes: clean.observacoes,
          updatedAt: serverTimestamp(),
        });
      } else {
        const validId =
          !item.id.startsWith('seed_') &&
          !item.id.startsWith('local_') &&
          VALIDATION_LIMITS.ID_PATTERN.test(item.id)
            ? item.id
            : generateSafeId('exm');
        batch.set(doc(db, 'exam_records', validId), {
          ...clean,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'exam_records');
  }
}

export async function upsertExamDelivery(
  ownerId: string,
  existingDeliveryId: string | null,
  input: NewExamDeliveryInput
): Promise<string> {
  const clean = sanitizeExamDeliveryPayload(ownerId, input);

  if (existingDeliveryId && !existingDeliveryId.startsWith('local_')) {
    const path = `exam_deliveries/${existingDeliveryId}`;
    try {
      await updateDoc(doc(db, 'exam_deliveries', existingDeliveryId), {
        examRecordId: clean.examRecordId,
        seqNumber: clean.seqNumber,
        pedidoEmed: clean.pedidoEmed,
        pacienteNome: clean.pacienteNome,
        exameTipo: clean.exameTipo,
        dataRealizado: clean.dataRealizado,
        pacienteLogin: clean.pacienteLogin,
        pacienteSenha: clean.pacienteSenha,
        arquivoNome: clean.arquivoNome,
        arquivoMime: clean.arquivoMime,
        arquivoConteudo: clean.arquivoConteudo,
        laudoObservacoes: clean.laudoObservacoes,
        retiradoEm: clean.retiradoEm,
        updatedAt: serverTimestamp(),
      });
      return existingDeliveryId;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  const deliveryId = generateSafeId('dlv');
  const path = `exam_deliveries/${deliveryId}`;
  try {
    await setDoc(doc(db, 'exam_deliveries', deliveryId), {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return deliveryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeExamDelivery(deliveryId: string): Promise<void> {
  if (deliveryId.startsWith('local_')) return;
  const path = `exam_deliveries/${deliveryId}`;
  try {
    await deleteDoc(doc(db, 'exam_deliveries', deliveryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertPricingRule(
  ownerId: string,
  existingRuleId: string | null,
  convenio: string,
  exameTipo: string,
  valorExame: number,
  repasseValor: number
): Promise<void> {
  const safeConvenio =
    sanitizeString(convenio.toUpperCase(), VALIDATION_LIMITS.CONVENIO_MAX) ||
    'SÃO MIGUEL SAÚDE';
  const safeExame =
    sanitizeString(exameTipo.toUpperCase(), VALIDATION_LIMITS.EXAME_MAX) ||
    'OCT';
  const safeValor = clampNumber(
    valorExame,
    VALIDATION_LIMITS.VALOR_MIN,
    VALIDATION_LIMITS.VALOR_MAX
  );
  const safeRepasse = clampNumber(
    repasseValor,
    VALIDATION_LIMITS.VALOR_MIN,
    VALIDATION_LIMITS.VALOR_MAX
  );

  if (existingRuleId) {
    const path = `pricing_rules/${existingRuleId}`;
    try {
      await updateDoc(doc(db, 'pricing_rules', existingRuleId), {
        convenio: safeConvenio,
        exameTipo: safeExame,
        valorExame: safeValor,
        repasseValor: safeRepasse,
        updatedAt: serverTimestamp(),
      });
      return;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  const ruleId = generateSafeId('prc');
  const path = `pricing_rules/${ruleId}`;
  try {
    await setDoc(doc(db, 'pricing_rules', ruleId), {
      ownerId: sanitizeString(ownerId, VALIDATION_LIMITS.OWNER_ID_MAX),
      convenio: safeConvenio,
      exameTipo: safeExame,
      valorExame: safeValor,
      repasseValor: safeRepasse,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removePricingRule(ruleId: string): Promise<void> {
  const path = `pricing_rules/${ruleId}`;
  try {
    await deleteDoc(doc(db, 'pricing_rules', ruleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertClinicConfig(
  ownerId: string,
  hasExisting: boolean,
  unidadePadrao: string,
  metaMensalExames: number,
  metaMensalFaturamento: number
): Promise<void> {
  const safeOwnerId = sanitizeString(ownerId, VALIDATION_LIMITS.OWNER_ID_MAX);
  const safeUnidade =
    sanitizeString(unidadePadrao.toUpperCase(), VALIDATION_LIMITS.UNIDADE_MAX) ||
    'SÃO MATEUS 1';
  const safeMetaExames = Math.max(
    1,
    Math.min(50000, Math.round(metaMensalExames || 300))
  );
  const safeMetaFat = clampNumber(metaMensalFaturamento || 35000, 0, 10000000);
  const path = `clinic_configs/${safeOwnerId}`;

  try {
    if (hasExisting) {
      await updateDoc(doc(db, 'clinic_configs', safeOwnerId), {
        unidadePadrao: safeUnidade,
        metaMensalExames: safeMetaExames,
        metaMensalFaturamento: safeMetaFat,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'clinic_configs', safeOwnerId), {
        ownerId: safeOwnerId,
        unidadePadrao: safeUnidade,
        metaMensalExames: safeMetaExames,
        metaMensalFaturamento: safeMetaFat,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      hasExisting ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}
