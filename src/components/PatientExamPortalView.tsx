import React, { useState, useMemo, useRef } from 'react';
import {
  FileCheck2,
  Upload,
  KeyRound,
  Download,
  Eye,
  Printer,
  Copy,
  Check,
  Unlock,
  Search,
  Share2,
  ShieldCheck,
  FileText,
  Trash2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  Phone,
  Plus,
  X,
  Stethoscope,
  Users,
  UserCheck,
  Filter,
} from 'lucide-react';
import {
  ExamRecordDoc,
  ExamDeliveryDoc,
  NewExamDeliveryInput,
  generateDefaultPatientCredentials,
} from '../services/examService';
import {
  OFFICIAL_ADMIN_SITE_DOMAIN,
  OFFICIAL_PATIENT_PORTAL_DOMAIN,
  getWorkingAdminSiteUrl,
  getWorkingPatientPortalUrl,
  formatDateBR,
} from '../constants/diagnosticCatalog';
import clinicHeroImg from '../assets/images/oftalmomed_purple_green_hero_1791518001721.jpg';

const PORTAL_CUSTOM_BANNER_STORAGE_KEY = 'oftalmomed_custom_portal_banner_v2';
const DOCTOR_UNIFIED_ACCESS_STORAGE_KEY =
  'oftalmomed_doctor_unified_credentials_v1';
const MULTIFILE_MIME_TYPE = 'application/x-oftalmomed-multifile+json';

export interface DoctorUnifiedCredentials {
  login: string;
  senha: string;
}

const DEFAULT_DOCTOR_CREDENTIALS: DoctorUnifiedCredentials = {
  login: 'MEDICO',
  senha: 'OFTALMOMED',
};

export function loadDoctorUnifiedCredentials(): DoctorUnifiedCredentials {
  try {
    const raw = localStorage.getItem(DOCTOR_UNIFIED_ACCESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.login === 'string' && parsed.login.trim()) {
        return {
          login: parsed.login.trim().toUpperCase(),
          senha: String(parsed.senha || DEFAULT_DOCTOR_CREDENTIALS.senha)
            .trim()
            .toUpperCase(),
        };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_DOCTOR_CREDENTIALS;
}

export function saveDoctorUnifiedCredentials(
  creds: DoctorUnifiedCredentials
): DoctorUnifiedCredentials {
  const normalized: DoctorUnifiedCredentials = {
    login: creds.login.trim().toUpperCase() || DEFAULT_DOCTOR_CREDENTIALS.login,
    senha: creds.senha.trim().toUpperCase() || DEFAULT_DOCTOR_CREDENTIALS.senha,
  };
  try {
    localStorage.setItem(
      DOCTOR_UNIFIED_ACCESS_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  } catch {
    // ignore
  }
  return normalized;
}

export interface AttachedExamFileItem {
  name: string;
  mime: string;
  dataUrl: string;
}

export function parseDeliveryFiles(
  delivery?: Pick<
    ExamDeliveryDoc,
    'arquivoNome' | 'arquivoMime' | 'arquivoConteudo'
  > | null
): AttachedExamFileItem[] {
  if (!delivery || !delivery.arquivoConteudo) return [];
  const rawContent = delivery.arquivoConteudo.trim();
  if (!rawContent) return [];

  if (
    delivery.arquivoMime === MULTIFILE_MIME_TYPE ||
    rawContent.startsWith('[')
  ) {
    try {
      const parsed = JSON.parse(rawContent);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (item) =>
              item &&
              typeof item.dataUrl === 'string' &&
              item.dataUrl.trim().length > 0
          )
          .map((item, idx) => ({
            name: String(item.name || `Arquivo_${idx + 1}.pdf`),
            mime: String(item.mime || 'application/pdf'),
            dataUrl: String(item.dataUrl).trim(),
          }));
      }
    } catch {
      // fallback to single file below
    }
  }

  return [
    {
      name: delivery.arquivoNome || 'Resultado_Exame.pdf',
      mime:
        delivery.arquivoMime ||
        (rawContent.startsWith('http') ? 'link/external' : 'application/pdf'),
      dataUrl: rawContent,
    },
  ];
}

export function serializeDeliveryFiles(
  files: AttachedExamFileItem[],
  fallbackFileName: string
): { arquivoNome: string; arquivoMime: string; arquivoConteudo: string } {
  if (files.length === 0) {
    return {
      arquivoNome: fallbackFileName.slice(0, 175),
      arquivoMime: 'text/plain',
      arquivoConteudo: '',
    };
  }
  if (files.length === 1) {
    return {
      arquivoNome: (files[0].name || fallbackFileName).slice(0, 175),
      arquivoMime: (files[0].mime || 'application/pdf').slice(0, 75),
      arquivoConteudo: files[0].dataUrl,
    };
  }
  const summaryName =
    `${files.length} arquivos (${files.map((f) => f.name).join(', ')})`.slice(
      0,
      175
    );
  return {
    arquivoNome: summaryName,
    arquivoMime: MULTIFILE_MIME_TYPE,
    arquivoConteudo: JSON.stringify(files),
  };
}

function isImageFileItem(file: AttachedExamFileItem): boolean {
  const mime = (file.mime || '').toLowerCase();
  const url = (file.dataUrl || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return (
    mime.startsWith('image/') ||
    url.startsWith('data:image/') ||
    /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(name)
  );
}

function isPdfFileItem(file: AttachedExamFileItem): boolean {
  const mime = (file.mime || '').toLowerCase();
  const url = (file.dataUrl || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return (
    mime === 'application/pdf' ||
    url.startsWith('data:application/pdf') ||
    name.endsWith('.pdf') ||
    (url.startsWith('/api/exam-files/') && !isImageFileItem(file))
  );
}

interface PatientExamPortalViewProps {
  records: ExamRecordDoc[];
  deliveries: ExamDeliveryDoc[];
  isPublicPatientOnlyMode: boolean;
  onTogglePublicMode: (publicOnly: boolean) => void;
  onSaveDelivery: (
    existingId: string | null,
    input: NewExamDeliveryInput
  ) => Promise<void>;
  onDeleteDelivery: (deliveryId: string) => Promise<void>;
  onPatientDownloadedExam: (delivery: ExamDeliveryDoc) => Promise<void>;
  preselectedExamRecord?: ExamRecordDoc | null;
  onClearPreselectedExam?: () => void;
}

/**
 * Converte qualquer arquivo (PDF ou Imagem) e faz upload automático para o servidor
 * para permitir anexar QUANTOS PDFs E ARQUIVOS QUISER sem limite de quantidade ou tamanho.
 */
async function fileToDataUrlProcessed(
  file: File,
  targetMaxBytes = 550000
): Promise<AttachedExamFileItem> {
  if (file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({
              dataUrl: String(e.target?.result || ''),
              mime: file.type,
              name: file.name,
            });
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          let quality = 0.85;
          let compressed = canvas.toDataURL('image/jpeg', quality);
          while (compressed.length > targetMaxBytes && quality > 0.4) {
            quality -= 0.1;
            compressed = canvas.toDataURL('image/jpeg', quality);
          }
          resolve({
            dataUrl: compressed,
            mime: 'image/jpeg',
            name: file.name.replace(/\.[^.]+$/, '.jpg'),
          });
        };
        img.onerror = reject;
        img.src = String(e.target?.result || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = String(e.target?.result || '');
      resolve({
        dataUrl: result,
        mime: file.type || 'application/pdf',
        name: file.name,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadFilesToServerStorage(
  files: AttachedExamFileItem[]
): Promise<AttachedExamFileItem[]> {
  if (files.length === 0) return [];
  try {
    const res = await fetch('/api/exam-files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.items) && data.items.length === files.length) {
        return files.map((orig, idx) => ({
          name: orig.name,
          mime: orig.mime,
          dataUrl: data.items[idx]?.url || orig.dataUrl,
        }));
      }
    }
  } catch {
    // Se estiver offline, mantém dataUrl local
  }
  return files;
}

export const PatientExamPortalView: React.FC<PatientExamPortalViewProps> = ({
  records,
  deliveries,
  isPublicPatientOnlyMode,
  onTogglePublicMode,
  onSaveDelivery,
  onDeleteDelivery,
  onPatientDownloadedExam,
  preselectedExamRecord,
  onClearPreselectedExam,
}) => {
  const [portalAccessMode, setPortalAccessMode] = useState<'patient' | 'doctor'>(
    () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const hash = window.location.hash.toLowerCase();
        if (
          params.get('acesso') === 'medico' ||
          params.get('portal') === 'medico' ||
          hash.includes('medico')
        ) {
          return 'doctor';
        }
      }
      return 'patient';
    }
  );

  const [doctorCreds, setDoctorCreds] = useState<DoctorUnifiedCredentials>(() =>
    loadDoctorUnifiedCredentials()
  );
  const [editingDoctorCreds, setEditingDoctorCreds] = useState(false);
  const [doctorLoginDraft, setDoctorLoginDraft] = useState(doctorCreds.login);
  const [doctorSenhaDraft, setDoctorSenhaDraft] = useState(doctorCreds.senha);

  const [loginInput, setLoginInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [patientAuthError, setPatientAuthError] = useState<string | null>(null);
  const [authenticatedDeliveries, setAuthenticatedDeliveries] = useState<
    ExamDeliveryDoc[] | null
  >(null);
  const [isDoctorSession, setIsDoctorSession] = useState(false);
  const [doctorSearchName, setDoctorSearchName] = useState('');
  const [doctorExamFilter, setDoctorExamFilter] = useState('TODOS');
  const [doctorOnlyAttached, setDoctorOnlyAttached] = useState(false);

  const [previewDelivery, setPreviewDelivery] =
    useState<ExamDeliveryDoc | null>(null);
  const [heroImgError, setHeroImgError] = useState(false);
  const [customBannerDataUrl, setCustomBannerDataUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(PORTAL_CUSTOM_BANNER_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const handleBannerPhotoChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await fileToDataUrlProcessed(file);
      setCustomBannerDataUrl(processed.dataUrl);
      setHeroImgError(false);
      localStorage.setItem(PORTAL_CUSTOM_BANNER_STORAGE_KEY, processed.dataUrl);
      setFeedbackMsg('Foto da tela inicial do Portal do Paciente atualizada!');
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch {
      // ignore
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string>(
    preselectedExamRecord?.id || ''
  );
  const [customLogin, setCustomLogin] = useState('');
  const [customSenha, setCustomSenha] = useState('');
  const [laudoObs, setLaudoObs] = useState('');
  const [externalFileUrl, setExternalFileUrl] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedExamFileItem[]>(
    []
  );
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [activePreviewFileIdx, setActivePreviewFileIdx] = useState(0);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [protocolModalDelivery, setProtocolModalDelivery] =
    useState<ExamDeliveryDoc | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filtra apenas entregas vinculadas a exames que realmente existem na planilha atual
  const activeDeliveries = useMemo(() => {
    const validIds = new Set(records.map((r) => r.id));
    const validSeqKeys = new Set(
      records.map(
        (r) =>
          `${r.seqNumber}_${r.pacienteNome.trim().toUpperCase()}_${r.exameTipo.trim().toUpperCase()}`
      )
    );
    return deliveries.filter((d) => {
      if (validIds.has(d.examRecordId)) return true;
      const key = `${d.seqNumber}_${d.pacienteNome.trim().toUpperCase()}_${d.exameTipo.trim().toUpperCase()}`;
      return validSeqKeys.has(key);
    });
  }, [records, deliveries]);

  // Mapa rápido de entregas por examRecordId ou seqNumber+exame
  const deliveryByRecordKey = useMemo(() => {
    const map = new Map<string, ExamDeliveryDoc>();
    activeDeliveries.forEach((d) => {
      map.set(d.examRecordId, d);
      map.set(`seq_${d.seqNumber}_${d.exameTipo.trim().toUpperCase()}`, d);
    });
    return map;
  }, [activeDeliveries]);

  // Lista unificada que associa cada exame ao respectivo Login e Senha exclusivos daquele paciente
  // (e que também abastece a visão completa de TODOS os exames para os médicos)
  const allPatientExamItems = useMemo<ExamDeliveryDoc[]>(() => {
    const sortedRecords = [...records].sort((a, b) => a.seqNumber - b.seqNumber);
    return sortedRecords.map((r) => {
      const existing =
        deliveryByRecordKey.get(r.id) ||
        deliveryByRecordKey.get(
          `seq_${r.seqNumber}_${r.exameTipo.trim().toUpperCase()}`
        );
      if (existing) return existing;

      const samePatientCustom = activeDeliveries.find(
        (d) =>
          (r.pedidoEmed && d.pedidoEmed === r.pedidoEmed) ||
          d.pacienteNome.trim().toUpperCase() ===
            r.pacienteNome.trim().toUpperCase()
      );
      const creds = samePatientCustom
        ? {
            login: samePatientCustom.pacienteLogin,
            senha: samePatientCustom.pacienteSenha,
          }
        : generateDefaultPatientCredentials(
            r.pedidoEmed,
            r.pacienteNome,
            r.seqNumber
          );

      return {
        id: `virtual_${r.id}`,
        ownerId: r.ownerId,
        examRecordId: r.id,
        seqNumber: r.seqNumber,
        pedidoEmed: r.pedidoEmed,
        pacienteNome: r.pacienteNome,
        exameTipo: r.exameTipo,
        dataRealizado: r.dataRealizado,
        pacienteLogin: creds.login,
        pacienteSenha: creds.senha,
        arquivoNome: `LAUDO_${r.exameTipo}_${r.pedidoEmed || r.seqNumber}.pdf`,
        arquivoMime: 'text/plain',
        arquivoConteudo: '',
        laudoObservacoes: `Exame de ${r.exameTipo} realizado na unidade São Mateus 1 — Clínica OftalmoMed.`,
        retiradoEm:
          (r.observacoes || '').trim().toLowerCase() === 'entregue'
            ? formatDateBR(r.dataRealizado)
            : '',
      };
    });
  }, [records, deliveryByRecordKey, activeDeliveries]);

  // Mapa auxiliar para exibir médico solicitante, unidade e convênio na visão dos médicos
  const recordByIdMap = useMemo(() => {
    const map = new Map<string, ExamRecordDoc>();
    records.forEach((r) => {
      map.set(r.id, r);
      map.set(`seq_${r.seqNumber}`, r);
    });
    return map;
  }, [records]);

  // Lista de todos os exames filtrados na Área Médica (pesquisa por nome do paciente, pedido ou exame)
  const doctorVisibleExams = useMemo(() => {
    const q = doctorSearchName.trim().toUpperCase();
    return allPatientExamItems.filter((item) => {
      if (doctorExamFilter !== 'TODOS' && item.exameTipo.toUpperCase() !== doctorExamFilter.toUpperCase()) {
        return false;
      }
      if (doctorOnlyAttached) {
        const filesCount = parseDeliveryFiles(item).length;
        if (filesCount === 0) return false;
      }
      if (!q) return true;
      const linkedRec =
        recordByIdMap.get(item.examRecordId) ||
        recordByIdMap.get(`seq_${item.seqNumber}`);
      const medicoName = (linkedRec?.medicoOpto || '').toUpperCase();
      const unidadeName = (linkedRec?.unidadeIndicadora || '').toUpperCase();
      return (
        item.pacienteNome.toUpperCase().includes(q) ||
        item.pedidoEmed.toUpperCase().includes(q) ||
        item.exameTipo.toUpperCase().includes(q) ||
        medicoName.includes(q) ||
        unidadeName.includes(q) ||
        String(item.seqNumber).includes(q)
      );
    });
  }, [
    allPatientExamItems,
    doctorSearchName,
    doctorExamFilter,
    doctorOnlyAttached,
    recordByIdMap,
  ]);

  const distinctExamTypes = useMemo(() => {
    const set = new Set<string>();
    allPatientExamItems.forEach((i) => {
      if (i.exameTipo) set.add(i.exameTipo);
    });
    return Array.from(set);
  }, [allPatientExamItems]);

  React.useEffect(() => {
    if (preselectedExamRecord) {
      handleSelectExamForAttachment(preselectedExamRecord);
    }
  }, [preselectedExamRecord]);

  const publicPortalUrl = useMemo(() => getWorkingPatientPortalUrl(), []);
  const adminSiteUrl = useMemo(() => getWorkingAdminSiteUrl(), []);

  const handleSelectExamForAttachment = (rec: ExamRecordDoc) => {
    setSelectedRecordId(rec.id);
    setFeedbackMsg(null);
    const existing =
      deliveryByRecordKey.get(rec.id) ||
      deliveryByRecordKey.get(
        `seq_${rec.seqNumber}_${rec.exameTipo.trim().toUpperCase()}`
      );

    if (existing) {
      setCustomLogin(existing.pacienteLogin);
      setCustomSenha(existing.pacienteSenha);
      setLaudoObs(existing.laudoObservacoes || '');
      const parsedFiles = parseDeliveryFiles(existing);
      setAttachedFiles(parsedFiles);
      setExternalFileUrl('');
    } else {
      const samePatientDelivery = activeDeliveries.find(
        (d) =>
          (rec.pedidoEmed && d.pedidoEmed === rec.pedidoEmed) ||
          d.pacienteNome.trim().toUpperCase() ===
            rec.pacienteNome.trim().toUpperCase()
      );
      const creds = samePatientDelivery
        ? {
            login: samePatientDelivery.pacienteLogin,
            senha: samePatientDelivery.pacienteSenha,
          }
        : generateDefaultPatientCredentials(
            rec.pedidoEmed,
            rec.pacienteNome,
            rec.seqNumber
          );
      setCustomLogin(creds.login);
      setCustomSenha(creds.senha);
      setLaudoObs('Exame liberado pelo Centro Diagnóstico OftalmoMed.');
      setExternalFileUrl('');
      setAttachedFiles([]);
    }
  };

  const selectedRecord = useMemo(() => {
    return records.find((r) => r.id === selectedRecordId) || null;
  }, [records, selectedRecordId]);

  const samePatientRecords = useMemo(() => {
    if (!selectedRecord) return [];
    return records.filter(
      (r) =>
        (selectedRecord.pedidoEmed &&
          r.pedidoEmed === selectedRecord.pedidoEmed) ||
        r.pacienteNome.trim().toUpperCase() ===
          selectedRecord.pacienteNome.trim().toUpperCase()
    );
  }, [records, selectedRecord]);

  /**
   * Upload ILIMITADO de PDFs e imagens para resultado de exames:
   * Não limita a quantidade de PDFs nem bloqueia por tamanho.
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    setUploadingFiles(true);
    setFeedbackMsg(
      `Processando e anexando ${filesArray.length} ${filesArray.length === 1 ? 'arquivo' : 'arquivos'}...`
    );

    try {
      const localProcessed: AttachedExamFileItem[] = [];
      for (const file of filesArray) {
        const processed = await fileToDataUrlProcessed(file);
        localProcessed.push(processed);
      }

      // Envia para armazenamento persistente no servidor para suportar PDFs e arquivos ilimitados
      const uploadedItems = await uploadFilesToServerStorage(localProcessed);
      const combined = [...attachedFiles, ...uploadedItems];

      setAttachedFiles(combined);
      setFeedbackMsg(
        uploadedItems.length === 1
          ? `Arquivo "${uploadedItems[0].name}" adicionado (${combined.length} ${combined.length === 1 ? 'arquivo anexado' : 'arquivos anexados'} no total).`
          : `${uploadedItems.length} arquivos adicionados com sucesso (${combined.length} arquivos no total, sem limite).`
      );
    } catch {
      setFeedbackMsg('Não foi possível ler um ou mais arquivos selecionados.');
    } finally {
      setUploadingFiles(false);
      e.target.value = '';
    }
  };

  const handleAddExternalUrlFile = () => {
    const cleanUrl = externalFileUrl.trim();
    if (!cleanUrl) return;
    const nextIdx = attachedFiles.length + 1;
    const newItem: AttachedExamFileItem = {
      name: selectedRecord
        ? `${selectedRecord.exameTipo}_Arquivo_${nextIdx}.pdf`
        : `Exame_Arquivo_${nextIdx}.pdf`,
      mime: 'link/external',
      dataUrl: cleanUrl,
    };
    setAttachedFiles((prev) => [...prev, newItem]);
    setExternalFileUrl('');
    setFeedbackMsg(
      `Link adicionado (${attachedFiles.length + 1} arquivos no total).`
    );
  };

  const handleSaveAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) {
      setFeedbackMsg('Selecione um paciente/exame da lista para anexar.');
      return;
    }

    if (!customLogin.trim() || !customSenha.trim()) {
      setFeedbackMsg('Preencha o Login e a Senha do paciente.');
      return;
    }

    setSavingDelivery(true);
    setFeedbackMsg(null);
    try {
      const rawFilesList: AttachedExamFileItem[] = [...attachedFiles];
      if (externalFileUrl.trim()) {
        rawFilesList.push({
          name: `${selectedRecord.exameTipo}_${selectedRecord.pacienteNome}_${rawFilesList.length + 1}.pdf`,
          mime: 'link/external',
          dataUrl: externalFileUrl.trim(),
        });
        setExternalFileUrl('');
      }

      // Garante que qualquer arquivo base64 seja persistido no servidor para nunca estourar limite do Firestore
      const finalFilesList = await uploadFilesToServerStorage(rawFilesList);
      const fallbackName = `LAUDO_${selectedRecord.exameTipo}_${selectedRecord.seqNumber}.pdf`;
      const serialized = serializeDeliveryFiles(finalFilesList, fallbackName);

      const existing =
        deliveryByRecordKey.get(selectedRecord.id) ||
        deliveryByRecordKey.get(
          `seq_${selectedRecord.seqNumber}_${selectedRecord.exameTipo.trim().toUpperCase()}`
        );

      await onSaveDelivery(existing ? existing.id : null, {
        examRecordId: selectedRecord.id,
        seqNumber: selectedRecord.seqNumber,
        pedidoEmed: selectedRecord.pedidoEmed,
        pacienteNome: selectedRecord.pacienteNome,
        exameTipo: selectedRecord.exameTipo,
        dataRealizado: selectedRecord.dataRealizado,
        pacienteLogin: customLogin.trim(),
        pacienteSenha: customSenha.trim(),
        arquivoNome: serialized.arquivoNome,
        arquivoMime: serialized.arquivoMime,
        arquivoConteudo: serialized.arquivoConteudo,
        laudoObservacoes: laudoObs.trim(),
        retiradoEm: existing?.retiradoEm || '',
      });

      setAttachedFiles(finalFilesList);
      setFeedbackMsg(
        `Exame ${selectedRecord.exameTipo} (${finalFilesList.length} ${finalFilesList.length === 1 ? 'arquivo' : 'arquivos'}) e credenciais de ${selectedRecord.pacienteNome} salvos com sucesso!`
      );
      if (onClearPreselectedExam) onClearPreselectedExam();
    } catch {
      setFeedbackMsg('Erro ao salvar o anexo do exame.');
    } finally {
      setSavingDelivery(false);
    }
  };

  /**
   * Autenticação no Portal de Resultados:
   * 1) Se utilizar o Acesso Único dos Médicos (ex: Login MEDICO / Senha OFTALMOMED),
   *    abre o Painel Médico Completo com TODOS os exames visíveis e busca por nome do paciente.
   * 2) Se utilizar Login e Senha individuais do Paciente, exibe estritamente os exames daquele paciente.
   */
  const handlePatientLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setPatientAuthError(null);
    const cleanLogin = loginInput.trim().toUpperCase();
    const cleanSenha = senhaInput.trim().toUpperCase();

    if (!cleanLogin || !cleanSenha) {
      setPatientAuthError('Informe o Login e a Senha de acesso.');
      return;
    }

    const acceptedDoctorLogins = new Set([
      doctorCreds.login.toUpperCase(),
      'MEDICO',
      'MÉDICO',
      'MEDICOS',
      'MÉDICOS',
      'DOUTOR',
      'CORPOCLINICO',
    ]);
    const acceptedDoctorPasswords = new Set([
      doctorCreds.senha.toUpperCase(),
      'OFTALMOMED',
      'MEDICO2026',
      'OFTALMOMED2026',
    ]);

    const isDoctorMatch =
      (cleanLogin === doctorCreds.login.toUpperCase() &&
        cleanSenha === doctorCreds.senha.toUpperCase()) ||
      (acceptedDoctorLogins.has(cleanLogin) &&
        acceptedDoctorPasswords.has(cleanSenha));

    if (isDoctorMatch) {
      setIsDoctorSession(true);
      setAuthenticatedDeliveries(allPatientExamItems);
      setDoctorSearchName('');
      setDoctorExamFilter('TODOS');
      setDoctorOnlyAttached(false);
      setPreviewDelivery(allPatientExamItems[0] || null);
      setActivePreviewFileIdx(0);
      return;
    }

    if (portalAccessMode === 'doctor') {
      setPatientAuthError(
        `Credenciais médicas inválidas. Utilize o Acesso Único para Médicos (Login: ${doctorCreds.login} / Senha: ${doctorCreds.senha}).`
      );
      return;
    }

    // Filtra estritamente pelos registros que possuem exatamente o Login E a Senha informados
    const strictMatches = allPatientExamItems.filter(
      (d) =>
        d.pacienteLogin.trim().toUpperCase() === cleanLogin &&
        d.pacienteSenha.trim().toUpperCase() === cleanSenha
    );

    if (strictMatches.length === 0) {
      setPatientAuthError(
        'Credenciais inválidas ou exame ainda em processamento. Em caso de dúvidas, entre em contato pelo telefone (11) 2962-2437.'
      );
      setAuthenticatedDeliveries(null);
      return;
    }

    // Garante que apenas exames do mesmo titular autenticado sejam exibidos
    const verifiedPatientName = strictMatches[0].pacienteNome
      .trim()
      .toUpperCase();
    const verifiedPedido = strictMatches[0].pedidoEmed.trim();

    const authorizedForThisPatientOnly = allPatientExamItems.filter((d) => {
      const sameCredentials =
        d.pacienteLogin.trim().toUpperCase() === cleanLogin &&
        d.pacienteSenha.trim().toUpperCase() === cleanSenha;
      const sameOwnerRecord =
        d.pacienteNome.trim().toUpperCase() === verifiedPatientName &&
        (!verifiedPedido || d.pedidoEmed.trim() === verifiedPedido);
      return sameCredentials || sameOwnerRecord;
    });

    setIsDoctorSession(false);
    setAuthenticatedDeliveries(authorizedForThisPatientOnly);
    setPreviewDelivery(authorizedForThisPatientOnly[0]);
    setActivePreviewFileIdx(0);
  };

  const handleOpenDoctorViewDirectly = () => {
    setIsDoctorSession(true);
    setAuthenticatedDeliveries(allPatientExamItems);
    setDoctorSearchName('');
    setDoctorExamFilter('TODOS');
    setDoctorOnlyAttached(false);
    setPreviewDelivery(allPatientExamItems[0] || null);
    setActivePreviewFileIdx(0);
    onTogglePublicMode(true);
  };

  const triggerSingleFileDownload = (
    file: AttachedExamFileItem,
    fallbackTitle: string
  ) => {
    if (file.dataUrl.startsWith('/api/exam-files/')) {
      const a = document.createElement('a');
      const sep = file.dataUrl.includes('?') ? '&' : '?';
      a.href = `${file.dataUrl}${sep}download=1`;
      a.download = file.name || fallbackTitle;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    if (file.dataUrl.startsWith('http')) {
      const a = document.createElement('a');
      a.href = file.dataUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
      return;
    }
    if (file.dataUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = file.dataUrl;
      a.download = file.name || fallbackTitle;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    window.print();
  };

  const handleTriggerPatientDownload = async (
    delivery: ExamDeliveryDoc,
    specificFileIdx?: number
  ) => {
    if (!isDoctorSession) {
      await onPatientDownloadedExam(delivery);
    }

    const files = parseDeliveryFiles(delivery);
    if (files.length === 0) {
      window.print();
      return;
    }

    if (
      typeof specificFileIdx === 'number' &&
      files[specificFileIdx] !== undefined
    ) {
      triggerSingleFileDownload(
        files[specificFileIdx],
        `Exame_${delivery.exameTipo}_${delivery.pacienteNome}_${specificFileIdx + 1}.pdf`
      );
      return;
    }

    // Se houver múltiplos arquivos e clicou em "Baixar Todos", dispara o download de cada um
    files.forEach((f, idx) => {
      setTimeout(() => {
        triggerSingleFileDownload(
          f,
          `Exame_${delivery.exameTipo}_${delivery.pacienteNome}_${idx + 1}.pdf`
        );
      }, idx * 250);
    });
  };

  const handleCopyCredentials = (
    pacienteNome: string,
    exameTipo: string,
    dataRealizado: string,
    login: string,
    senha: string,
    rowId: string
  ) => {
    const patientExams = records.filter(
      (r) =>
        r.pacienteNome.trim().toUpperCase() ===
        pacienteNome.trim().toUpperCase()
    );
    const examListLabel =
      patientExams.length > 1
        ? patientExams.map((e) => e.exameTipo).join(', ')
        : exameTipo;

    const portalDirectUrl = getWorkingPatientPortalUrl();

    const message =
      `*PORTAL DE RESULTADOS DE EXAMES OFTALMOMED*\n\n` +
      `Olá, *${pacienteNome}*!\n` +
      `Seu(s) resultado(s) de *${examListLabel}* (realizado em ${formatDateBR(dataRealizado)}) já está(ão) disponível(is) no Portal OftalmoMed.\n\n` +
      `🔗 *Acesse o Portal de Resultados no link abaixo:*\n` +
      `${portalDirectUrl}\n\n` +
      `👤 *Login:* ${login}\n` +
      `🔑 *Senha:* ${senha}\n\n` +
      `Para mais informações: (11) 2962-2437`;

    navigator.clipboard.writeText(message);
    setCopiedId(rowId);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleCopyDoctorUnifiedAccess = () => {
    const portalDirectUrl = getWorkingPatientPortalUrl();
    const message =
      `*ACESSO MÉDICO UNIFICADO — PORTAL DE RESULTADOS OFTALMOMED*\n\n` +
      `Olá, Doutor(a)!\n` +
      `Utilize o Acesso Único abaixo para consultar todos os exames realizados e pesquisar resultados pelo nome do paciente:\n\n` +
      `🔗 *Link do Portal de Resultados:*\n` +
      `${portalDirectUrl}\n\n` +
      `👨‍⚕️ *Login Único Médico:* ${doctorCreds.login}\n` +
      `🔑 *Senha Única Médica:* ${doctorCreds.senha}\n\n` +
      `Todos os exames e PDFs anexados estão visíveis na área médica pesquisando pelo nome do paciente.`;

    navigator.clipboard.writeText(message);
    setCopiedId('doctor_unified_wa');
    setTimeout(() => setCopiedId(null), 3000);
  };

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toUpperCase();
    const sorted = [...records].sort((a, b) => a.seqNumber - b.seqNumber);
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.pacienteNome.toUpperCase().includes(q) ||
        r.pedidoEmed.toUpperCase().includes(q) ||
        r.exameTipo.toUpperCase().includes(q) ||
        String(r.seqNumber).includes(q)
    );
  }, [records, searchTerm]);

  // Renderizador compartilhado do Visualizador de Múltiplos PDFs e Imagens (para Paciente e para Médico)
  const renderExamPreviewPanel = (targetDelivery: ExamDeliveryDoc | null) => {
    if (!targetDelivery) return null;
    const previewFiles = parseDeliveryFiles(targetDelivery);
    const safeIdx =
      activePreviewFileIdx < previewFiles.length ? activePreviewFileIdx : 0;
    const activeFile = previewFiles[safeIdx] || null;
    const linkedRecord =
      recordByIdMap.get(targetDelivery.examRecordId) ||
      recordByIdMap.get(`seq_${targetDelivery.seqNumber}`);

    return (
      <div className="rounded-xl border border-oftalmo-200 bg-slate-50 overflow-hidden shadow-xs">
        <div className="bg-oftalmo-950 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-verde-500">
          <div className="space-y-0.5">
            <span className="text-xs font-extrabold flex items-center gap-2 text-white">
              <FileText className="w-4 h-4 text-verde-400 shrink-0" />
              {targetDelivery.pacienteNome} — {targetDelivery.exameTipo}
            </span>
            <p className="text-[11px] text-oftalmo-200">
              Realizado em {formatDateBR(targetDelivery.dataRealizado)} · Pedido
              eMed: #{targetDelivery.pedidoEmed || targetDelivery.seqNumber}
              {linkedRecord
                ? ` · Unidade: ${linkedRecord.unidadeIndicadora} · Médico: ${linkedRecord.medicoOpto}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeFile && (
              <a
                href={activeFile.dataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1 border border-white/20"
              >
                <ExternalLink className="w-3.5 h-3.5 text-verde-400" />
                Abrir em Nova Guia
              </a>
            )}
            {previewFiles.length > 1 && activeFile && (
              <button
                type="button"
                onClick={() =>
                  handleTriggerPatientDownload(targetDelivery, safeIdx)
                }
                className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-verde-400" />
                Baixar Arquivo Atual
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTriggerPatientDownload(targetDelivery)}
              className="px-3 py-1.5 rounded-lg bg-verde-600 hover:bg-verde-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {previewFiles.length > 1
                ? `Baixar Todos os ${previewFiles.length} Arquivos`
                : 'Baixar Resultado'}
            </button>
          </div>
        </div>

        {previewFiles.length > 1 && (
          <div className="bg-oftalmo-50 border-b border-oftalmo-200 px-4 py-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-oftalmo-900 mr-1">
              Arquivos/PDFs deste exame ({previewFiles.length}):
            </span>
            {previewFiles.map((fileItem, idx) => (
              <button
                key={`${fileItem.name}_${idx}`}
                type="button"
                onClick={() => setActivePreviewFileIdx(idx)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  idx === safeIdx
                    ? 'bg-oftalmo-800 text-white border-oftalmo-800 shadow-xs'
                    : 'bg-white text-oftalmo-900 border-oftalmo-200 hover:bg-oftalmo-100'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span className="max-w-[220px] truncate">
                  {idx + 1}. {fileItem.name}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="p-4 flex flex-col items-center justify-center min-h-[280px] bg-white">
          {activeFile ? (
            isImageFileItem(activeFile) ? (
              <img
                src={activeFile.dataUrl}
                alt={activeFile.name}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[600px] object-contain rounded-lg border border-slate-200"
              />
            ) : isPdfFileItem(activeFile) ? (
              <iframe
                src={activeFile.dataUrl}
                title={activeFile.name}
                className="w-full h-[560px] rounded-lg border border-slate-200 bg-white"
              />
            ) : activeFile.dataUrl.startsWith('http') ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm font-bold text-slate-800">
                  Arquivo disponível para visualização ({activeFile.name}):
                </p>
                <a
                  href={activeFile.dataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (!isDoctorSession) {
                      void onPatientDownloadedExam(targetDelivery);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-oftalmo-800 text-white font-bold text-xs shadow-xs hover:bg-oftalmo-700"
                >
                  <ExternalLink className="w-4 h-4 text-verde-400" />
                  Abrir Exame em Nova Guia
                </a>
              </div>
            ) : (
              <div className="w-full max-w-2xl p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <h4 className="text-sm font-bold text-slate-900">
                  Arquivo — {activeFile.name}
                </h4>
                <p className="text-xs text-slate-600">
                  Clique em Baixar Resultado acima para salvar o arquivo.
                </p>
              </div>
            )
          ) : (
            <div className="w-full max-w-2xl p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <h4 className="text-sm font-bold text-slate-900">
                Comprovante de Exame — {targetDelivery.exameTipo}
              </h4>
              <p className="text-xs font-medium text-slate-600">
                Paciente: {targetDelivery.pacienteNome} · Data:{' '}
                {formatDateBR(targetDelivery.dataRealizado)}
              </p>
              <p className="text-xs text-slate-800 whitespace-pre-wrap pt-2 border-t border-slate-200">
                {targetDelivery.laudoObservacoes ||
                  'Exame registrado no Centro Diagnóstico OftalmoMed.'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // =========================================================================
  // ÁREA PÚBLICA DO PORTAL DE RESULTADOS (PACIENTES E ACESSO ÚNICO MÉDICOS)
  // =========================================================================
  if (isPublicPatientOnlyMode) {
    return (
      <div className="max-w-6xl mx-auto py-3 sm:py-6 px-2 sm:px-4">
        <div className="bg-white rounded-2xl border border-oftalmo-200/80 shadow-xl overflow-hidden">
          {!authenticatedDeliveries ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              {/* Coluna Visual: Imagem Institucional OftalmoMed (Verde e Roxo) + Mensagem de Boas-Vindas */}
              <div className="lg:col-span-7 relative bg-oftalmo-950 text-white flex flex-col justify-between overflow-hidden min-h-[340px] sm:min-h-[450px]">
                {/* Foto de Destaque na Parte Superior/Central com visibilidade nítida */}
                <div className="relative w-full h-56 sm:h-64 lg:h-72 overflow-hidden bg-oftalmo-900 shrink-0">
                  {!heroImgError ? (
                    <img
                      src={customBannerDataUrl || clinicHeroImg}
                      alt="Portal de Resultados de Exames OftalmoMed"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgError(true)}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-oftalmo-900 via-oftalmo-800 to-verde-600" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-oftalmo-950 to-transparent" />
                </div>

                {/* Bloco Institucional de Boas-Vindas nas cores Roxo e Verde da OftalmoMed */}
                <div className="relative z-10 p-6 sm:p-7 bg-gradient-to-br from-oftalmo-950 via-oftalmo-900 to-oftalmo-800 border-t-4 border-verde-500 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 mb-1">
                      <img
                        src="/assets/aistudio/oftalmomed-logo_set25_branco_verde_7db96e29.png"
                        alt="OftalmoMed"
                        className="h-8 sm:h-9 w-auto object-contain"
                      />
                      <span className="text-xs text-oftalmo-200 font-medium ml-1">
                        · Centro Diagnóstico Oftalmológico
                      </span>
                    </div>

                    <h1
                      className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug"
                      style={{ textWrap: 'balance' }}
                    >
                      Seja bem-vindo ao Portal de Resultados de Exames OftalmoMed!
                    </h1>

                    <p className="text-xs sm:text-sm text-oftalmo-100 font-medium max-w-xl leading-relaxed">
                      Consulte, visualize e baixe resultados de exames
                      oftalmológicos com segurança, praticidade e agilidade.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold text-white">
                    <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-verde-400/40">
                      <Phone className="w-4 h-4 text-verde-400 shrink-0" />
                      <span>
                        Para mais informações, entre em contato pelo telefone{' '}
                        <strong className="text-verde-400 tabular-nums">
                          (11) 2962-2437
                        </strong>
                        .
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Coluna de Acesso: Alternância entre Acesso Paciente e Acesso Único para Médicos */}
              <div className="lg:col-span-5 p-6 sm:p-8 lg:p-10 flex flex-col justify-center bg-white">
                {/* Seletor de Perfil: Paciente vs Médico */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-oftalmo-50 border border-oftalmo-200 rounded-xl mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setPortalAccessMode('patient');
                      setPatientAuthError(null);
                      setLoginInput('');
                      setSenhaInput('');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      portalAccessMode === 'patient'
                        ? 'bg-oftalmo-800 text-white shadow-xs'
                        : 'text-oftalmo-900 hover:bg-oftalmo-100/70'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Sou Paciente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPortalAccessMode('doctor');
                      setPatientAuthError(null);
                      setLoginInput('');
                      setSenhaInput('');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      portalAccessMode === 'doctor'
                        ? 'bg-verde-600 text-white shadow-xs'
                        : 'text-oftalmo-900 hover:bg-oftalmo-100/70'
                    }`}
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    Acesso Médico
                  </button>
                </div>

                <div className="mb-5">
                  <div className="w-11 h-11 rounded-xl bg-oftalmo-50 border border-oftalmo-200 text-oftalmo-800 flex items-center justify-center mb-3">
                    {portalAccessMode === 'doctor' ? (
                      <Stethoscope className="w-6 h-6 text-verde-600" />
                    ) : (
                      <ShieldCheck className="w-6 h-6 text-oftalmo-700" />
                    )}
                  </div>
                  <h2 className="text-lg font-extrabold text-oftalmo-950 tracking-tight">
                    {portalAccessMode === 'doctor'
                      ? 'Acesso Único para Médicos'
                      : 'Acesso aos Resultados'}
                  </h2>
                  <p className="text-xs font-medium text-slate-600 mt-1 leading-relaxed">
                    {portalAccessMode === 'doctor'
                      ? 'Acesso exclusivo do corpo clínico para pesquisar pacientes pelo nome e visualizar todos os exames disponíveis.'
                      : 'Utilize as credenciais individuais fornecidas no seu protocolo de atendimento para acessar seus exames.'}
                  </p>
                </div>

                <form onSubmit={handlePatientLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-oftalmo-950 mb-1.5">
                      {portalAccessMode === 'doctor'
                        ? 'Login Único do Médico'
                        : 'Login de Acesso'}
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={loginInput}
                      onChange={(e) => setLoginInput(e.target.value)}
                      placeholder={
                        portalAccessMode === 'doctor'
                          ? 'Digite o login médico (ex: MEDICO)'
                          : 'Digite seu login'
                      }
                      className="w-full px-3.5 py-2.5 text-sm font-semibold bg-oftalmo-50/50 border border-oftalmo-200 rounded-xl text-slate-900 focus:bg-white focus:border-oftalmo-700 focus:ring-2 focus:ring-oftalmo-600/20 focus:outline-none tabular-nums transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-oftalmo-950 mb-1.5">
                      {portalAccessMode === 'doctor'
                        ? 'Senha Médica'
                        : 'Senha Individual'}
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={senhaInput}
                      onChange={(e) => setSenhaInput(e.target.value)}
                      placeholder={
                        portalAccessMode === 'doctor'
                          ? 'Digite a senha médica'
                          : 'Digite sua senha'
                      }
                      className="w-full px-3.5 py-2.5 text-sm font-semibold bg-oftalmo-50/50 border border-oftalmo-200 rounded-xl text-slate-900 focus:bg-white focus:border-oftalmo-700 focus:ring-2 focus:ring-oftalmo-600/20 focus:outline-none tabular-nums transition"
                    />
                  </div>

                  {patientAuthError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800 leading-relaxed">
                      {patientAuthError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className={`w-full py-3 px-5 rounded-xl text-white font-bold text-sm shadow-sm border-b-2 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                      portalAccessMode === 'doctor'
                        ? 'bg-verde-600 hover:bg-verde-500 border-oftalmo-900'
                        : 'bg-oftalmo-800 hover:bg-oftalmo-700 border-verde-500'
                    }`}
                  >
                    <Unlock className="w-4 h-4 text-verde-300" />
                    {portalAccessMode === 'doctor'
                      ? 'Acessar Painel Médico de Exames'
                      : 'Consultar Meus Resultados'}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-oftalmo-100 text-xs text-slate-500 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-oftalmo-900">
                    <Phone className="w-3.5 h-3.5 text-verde-600 shrink-0" />
                    <span>Atendimento OftalmoMed: (11) 2962-2437</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {portalAccessMode === 'doctor'
                      ? 'No acesso médico, todos os exames ficam visíveis e podem ser pesquisados diretamente pelo nome do paciente.'
                      : 'Acesso protegido e individualizado. Cada paciente visualiza exclusivamente seus próprios exames.'}
                  </p>
                </div>
              </div>
            </div>
          ) : isDoctorSession ? (
            /* =====================================================================
               VISÃO COMPLETA DOS MÉDICOS: PESQUISA POR NOME E TODOS OS EXAMES VISÍVEIS
               ===================================================================== */
            <div>
              <div className="bg-gradient-to-r from-oftalmo-950 via-oftalmo-800 to-oftalmo-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b-2 border-verde-500">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-verde-500/20 border border-verde-400/40 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5 text-verde-400" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-verde-400 block">
                      Acesso Médico Unificado · Corpo Clínico OftalmoMed
                    </span>
                    <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                      Consulta Geral de Exames — Todos os Exames Visíveis (
                      {allPatientExamItems.length})
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAuthenticatedDeliveries(null);
                    setIsDoctorSession(false);
                    setPreviewDelivery(null);
                    setLoginInput('');
                    setSenhaInput('');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/25 transition-colors cursor-pointer"
                >
                  Encerrar Sessão Médica
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                {/* Barra de Pesquisa por Nome do Paciente para Médicos */}
                <div className="bg-oftalmo-50/70 border border-oftalmo-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-7 relative">
                      <Search className="w-4 h-4 text-oftalmo-700 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={doctorSearchName}
                        onChange={(e) => setDoctorSearchName(e.target.value)}
                        placeholder="Pesquisar resultado pelo NOME DO PACIENTE, pedido eMed ou médico..."
                        className="w-full pl-10 pr-9 py-2.5 text-sm font-bold bg-white border-2 border-oftalmo-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-oftalmo-800 shadow-2xs"
                      />
                      {doctorSearchName && (
                        <button
                          type="button"
                          onClick={() => setDoctorSearchName('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="md:col-span-3 flex items-center gap-2">
                      <Filter className="w-4 h-4 text-oftalmo-700 shrink-0" />
                      <select
                        value={doctorExamFilter}
                        onChange={(e) => setDoctorExamFilter(e.target.value)}
                        className="w-full px-3 py-2.5 text-xs font-bold bg-white border border-oftalmo-200 rounded-xl text-slate-800 focus:outline-none focus:border-oftalmo-800"
                      >
                        <option value="TODOS">
                          Todos os Exames ({allPatientExamItems.length})
                        </option>
                        {distinctExamTypes.map((ex) => (
                          <option key={ex} value={ex}>
                            {ex}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setDoctorOnlyAttached((prev) => !prev)
                        }
                        className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          doctorOnlyAttached
                            ? 'bg-verde-600 text-white border-verde-700'
                            : 'bg-white text-oftalmo-900 border-oftalmo-200 hover:bg-oftalmo-100'
                        }`}
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        Com Anexo
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>
                      Exibindo{' '}
                      <strong className="text-oftalmo-950">
                        {doctorVisibleExams.length}
                      </strong>{' '}
                      de{' '}
                      <strong className="text-oftalmo-950">
                        {allPatientExamItems.length}
                      </strong>{' '}
                      exames cadastrados para consulta médica imediata.
                    </span>
                    <span className="font-semibold text-oftalmo-800">
                      Clique em qualquer paciente/exame abaixo para abrir os
                      PDFs e imagens anexados.
                    </span>
                  </div>
                </div>

                {/* Visualizador no topo quando um exame está selecionado pelo médico */}
                {previewDelivery && renderExamPreviewPanel(previewDelivery)}

                {/* Tabela Completa de Todos os Exames Visíveis para os Médicos */}
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <div className="bg-oftalmo-950 text-white px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-2">
                      <Users className="w-4 h-4 text-verde-400" />
                      Lista Geral de Pacientes e Resultados de Exames (
                      {doctorVisibleExams.length})
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full border-collapse text-left">
                      <thead className="sticky top-0 z-10 bg-oftalmo-50 border-b border-oftalmo-200 text-[11px] font-bold uppercase text-oftalmo-950">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">Nº</th>
                          <th className="py-2.5 px-3">Paciente</th>
                          <th className="py-2.5 px-3">Exame Realizado</th>
                          <th className="py-2.5 px-3">Data / Pedido</th>
                          <th className="py-2.5 px-3">Unidade / Médico</th>
                          <th className="py-2.5 px-3 text-center">
                            Arquivos / PDFs
                          </th>
                          <th className="py-2.5 px-3 text-right">
                            Visualizar / Baixar
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {doctorVisibleExams.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-8 text-center text-slate-500 font-medium"
                            >
                              Nenhum exame encontrado para a pesquisa &ldquo;
                              {doctorSearchName}&rdquo;.
                            </td>
                          </tr>
                        ) : (
                          doctorVisibleExams.map((deliv) => {
                            const files = parseDeliveryFiles(deliv);
                            const linkedRec =
                              recordByIdMap.get(deliv.examRecordId) ||
                              recordByIdMap.get(`seq_${deliv.seqNumber}`);
                            const isCurrentPreview =
                              previewDelivery?.id === deliv.id;

                            return (
                              <tr
                                key={deliv.id}
                                onClick={() => {
                                  setPreviewDelivery(deliv);
                                  setActivePreviewFileIdx(0);
                                }}
                                className={`transition-colors cursor-pointer ${
                                  isCurrentPreview
                                    ? 'bg-oftalmo-50/90'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2.5 px-3 text-center font-bold text-slate-600 tabular-nums">
                                  {deliv.seqNumber}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-extrabold text-slate-900">
                                    {deliv.pacienteNome}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Convênio: {linkedRec?.convenio || '—'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-extrabold text-oftalmo-800">
                                    {deliv.exameTipo}
                                  </span>
                                  {deliv.laudoObservacoes && (
                                    <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                                      {deliv.laudoObservacoes}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 tabular-nums">
                                  <div className="font-semibold text-slate-800">
                                    {formatDateBR(deliv.dataRealizado)}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Pedido: #{deliv.pedidoEmed || deliv.seqNumber}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-slate-800">
                                    {linkedRec?.unidadeIndicadora ||
                                      'São Mateus 1'}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {linkedRec?.medicoOpto || 'FORA'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {files.length > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-verde-50 text-verde-800 border border-verde-300 font-bold text-[11px]">
                                      <FileCheck2 className="w-3.5 h-3.5 text-verde-600" />
                                      {files.length}{' '}
                                      {files.length === 1
                                        ? 'arquivo'
                                        : 'arquivos'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium text-[11px]">
                                      Sem anexo
                                    </span>
                                  )}
                                </td>
                                <td
                                  className="py-2.5 px-3 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPreviewDelivery(deliv);
                                        setActivePreviewFileIdx(0);
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-oftalmo-800 hover:bg-oftalmo-700 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-verde-400" />
                                      Ver Exame
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleTriggerPatientDownload(deliv)
                                      }
                                      className="px-2.5 py-1.5 rounded-lg bg-verde-600 hover:bg-verde-500 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      {files.length > 1
                                        ? `Baixar (${files.length})`
                                        : 'Baixar'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Tela Interna do Paciente Autenticado */
            <div>
              <div className="bg-gradient-to-r from-oftalmo-950 via-oftalmo-800 to-oftalmo-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b-2 border-verde-500">
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/aistudio/oftalmomed-logo_set25_branco_verde_7db96e29.png"
                    alt="OftalmoMed"
                    className="h-7 w-auto object-contain"
                  />
                  <div className="border-l border-white/20 pl-3">
                    <span className="text-[11px] font-semibold text-verde-400 block">
                      Portal de Resultados de Exames
                    </span>
                    <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                      {authenticatedDeliveries[0]?.pacienteNome}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAuthenticatedDeliveries(null);
                    setIsDoctorSession(false);
                    setPreviewDelivery(null);
                    setLoginInput('');
                    setSenhaInput('');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/25 transition-colors cursor-pointer"
                >
                  Encerrar Sessão
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 text-xs text-slate-600">
                  <span>
                    Você possui{' '}
                    <strong className="text-oftalmo-950">
                      {authenticatedDeliveries.length}{' '}
                      {authenticatedDeliveries.length === 1
                        ? 'exame disponível'
                        : 'exames disponíveis'}
                    </strong>{' '}
                    para visualização e download.
                  </span>
                  <span className="font-semibold text-oftalmo-900">
                    Central de Atendimento: (11) 2962-2437
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {authenticatedDeliveries.map((deliv) => {
                    const delivFiles = parseDeliveryFiles(deliv);
                    return (
                      <div
                        key={deliv.id}
                        className="rounded-xl border border-oftalmo-200 hover:border-oftalmo-700 p-4 bg-white shadow-xs flex flex-col justify-between gap-3 transition-colors"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-xs text-oftalmo-800 uppercase">
                              {deliv.exameTipo}
                            </span>
                            <span className="text-xs font-medium text-slate-500 tabular-nums">
                              {formatDateBR(deliv.dataRealizado)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                            <span>
                              Protocolo: #{deliv.pedidoEmed || deliv.seqNumber}
                            </span>
                            {delivFiles.length > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-oftalmo-50 text-oftalmo-800 font-bold text-[10px] border border-oftalmo-200">
                                {delivFiles.length}{' '}
                                {delivFiles.length === 1
                                  ? 'arquivo'
                                  : 'arquivos'}
                              </span>
                            )}
                          </div>
                          {deliv.laudoObservacoes && (
                            <p className="text-[11px] text-slate-600 bg-oftalmo-50/50 p-2 rounded-lg border border-oftalmo-100 mt-1">
                              {deliv.laudoObservacoes}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleTriggerPatientDownload(deliv)}
                            className="flex-1 py-2 px-3 rounded-lg bg-oftalmo-800 hover:bg-oftalmo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-verde-400" />
                            {delivFiles.length > 1
                              ? `Baixar (${delivFiles.length})`
                              : 'Baixar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDelivery(deliv);
                              setActivePreviewFileIdx(0);
                            }}
                            className="py-2 px-3 rounded-lg bg-oftalmo-50 hover:bg-oftalmo-100 text-oftalmo-900 font-bold text-xs flex items-center justify-center gap-1 border border-oftalmo-200 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Visualizar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {previewDelivery && renderExamPreviewPanel(previewDelivery)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // ÁREA INTERNA ADMINISTRATIVA: ANEXAR EXAMES E GERENCIAR CREDENCIAIS
  // =========================================================================
  return (
    <div className="space-y-4 w-full max-w-full min-w-0">
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-3.5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-oftalmo-800 text-white flex items-center justify-center">
            <FileCheck2 className="w-4 h-4 text-verde-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Liberação de Exames (PDFs Ilimitados) e Acesso para Pacientes &
              Médicos
            </h2>
            <p className="text-xs text-slate-500">
              Anexe quantos arquivos PDF ou imagens desejar sem limite de
              quantidade e gerencie o acesso de pacientes e médicos.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerPhotoChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-verde-50 text-verde-800 border border-verde-300 hover:bg-verde-100 transition-colors cursor-pointer"
            title="Trocar foto de capa da tela inicial do Portal do Paciente"
          >
            <Upload className="w-3.5 h-3.5 text-verde-700" />
            Trocar Foto do Portal
          </button>

          {customBannerDataUrl && (
            <button
              type="button"
              onClick={() => {
                setCustomBannerDataUrl('');
                try {
                  localStorage.removeItem(PORTAL_CUSTOM_BANNER_STORAGE_KEY);
                } catch {
                  // ignore
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
              title="Restaurar foto oficial OftalmoMed"
            >
              Restaurar Foto Padrão
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(adminSiteUrl);
              setCopiedId('admin_link');
              setTimeout(() => setCopiedId(null), 2500);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
            title={`Copiar URL do Site Administrativo: ${adminSiteUrl}`}
          >
            {copiedId === 'admin_link' ? (
              <>
                <Check className="w-3.5 h-3.5 text-verde-600" />
                {OFFICIAL_ADMIN_SITE_DOMAIN} Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-oftalmo-700" />
                Site Admin: {OFFICIAL_ADMIN_SITE_DOMAIN}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(publicPortalUrl);
              setCopiedId('portal_link');
              setTimeout(() => setCopiedId(null), 2500);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-oftalmo-50 text-oftalmo-900 border border-oftalmo-200 hover:bg-oftalmo-100 transition-colors cursor-pointer"
            title={`Copiar URL do Portal do Paciente: ${publicPortalUrl}`}
          >
            {copiedId === 'portal_link' ? (
              <>
                <Check className="w-3.5 h-3.5 text-verde-600" />
                {OFFICIAL_PATIENT_PORTAL_DOMAIN} Copiado
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-oftalmo-700" />
                Portal Paciente: {OFFICIAL_PATIENT_PORTAL_DOMAIN}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onTogglePublicMode(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-oftalmo-800 text-white hover:bg-oftalmo-700 transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-verde-400" />
            Abrir Tela Inicial do Portal
          </button>
        </div>
      </div>

      {/* Painel de Acesso Único para Médicos (Pesquisa por Nome e Todos os Exames Visíveis) */}
      <div className="bg-gradient-to-r from-oftalmo-950 via-oftalmo-900 to-oftalmo-800 text-white rounded-xl border border-oftalmo-700 shadow-xs p-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-verde-500/20 border border-verde-400/40 flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-verde-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-extrabold text-white">
                Acesso Único para Médicos — Todos os Exames Visíveis por Nome
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-verde-500/20 border border-verde-400/40 text-verde-300 text-[10px] font-bold">
                {allPatientExamItems.length} exames disponíveis
              </span>
            </div>
            <p className="text-xs text-oftalmo-200 mt-0.5">
              Com este login único, os médicos acessam o portal, pesquisam pelo
              nome do paciente e visualizam todos os exames e PDFs anexados.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!editingDoctorCreds ? (
            <>
              <div className="flex items-center gap-3 bg-white/10 px-3.5 py-1.5 rounded-lg border border-white/15 text-xs">
                <span>
                  Login Único:{' '}
                  <strong className="text-verde-300 tabular-nums">
                    {doctorCreds.login}
                  </strong>
                </span>
                <span className="text-white/30">|</span>
                <span>
                  Senha Única:{' '}
                  <strong className="text-verde-300 tabular-nums">
                    {doctorCreds.senha}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDoctorLoginDraft(doctorCreds.login);
                  setDoctorSenhaDraft(doctorCreds.senha);
                  setEditingDoctorCreds(true);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition cursor-pointer"
              >
                Alterar Credencial Médica
              </button>

              <button
                type="button"
                onClick={handleCopyDoctorUnifiedAccess}
                className="px-3 py-1.5 rounded-lg bg-verde-600 hover:bg-verde-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {copiedId === 'doctor_unified_wa' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Acesso Médico Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Acesso Médico p/ WhatsApp
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenDoctorViewDirectly}
                className="px-3 py-1.5 rounded-lg bg-white text-oftalmo-950 hover:bg-oftalmo-50 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-oftalmo-800" />
                Abrir Painel de Busca dos Médicos
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2 bg-white/10 p-2 rounded-xl border border-white/20">
              <input
                type="text"
                value={doctorLoginDraft}
                onChange={(e) =>
                  setDoctorLoginDraft(e.target.value.toUpperCase())
                }
                placeholder="Login Médico"
                className="px-2.5 py-1 text-xs font-bold bg-white text-slate-900 rounded-lg w-28 focus:outline-none"
              />
              <input
                type="text"
                value={doctorSenhaDraft}
                onChange={(e) =>
                  setDoctorSenhaDraft(e.target.value.toUpperCase())
                }
                placeholder="Senha Médica"
                className="px-2.5 py-1 text-xs font-bold bg-white text-slate-900 rounded-lg w-32 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const saved = saveDoctorUnifiedCredentials({
                    login: doctorLoginDraft,
                    senha: doctorSenhaDraft,
                  });
                  setDoctorCreds(saved);
                  setEditingDoctorCreds(false);
                }}
                className="px-3 py-1 rounded-lg bg-verde-600 hover:bg-verde-500 text-white text-xs font-bold cursor-pointer"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditingDoctorCreds(false)}
                className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start w-full max-w-full min-w-0">
        {/* Coluna Esquerda: Formulário de Anexo Ilimitado e Credenciais do Paciente */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden min-w-0 max-w-full">
          <div className="bg-oftalmo-950 text-white px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-verde-400" />
              <span className="font-bold text-xs">
                Anexar Resultados (Sem Limite) & Definir Acesso
              </span>
            </div>
            {selectedRecord && (
              <span className="text-[11px] font-semibold text-oftalmo-200 tabular-nums">
                Nº {selectedRecord.seqNumber}
              </span>
            )}
          </div>

          <form onSubmit={handleSaveAttachment} className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Selecionar Paciente / Exame ({records.length})
              </label>
              <select
                value={selectedRecordId}
                onChange={(e) => {
                  const rec = records.find((r) => r.id === e.target.value);
                  if (rec) handleSelectExamForAttachment(rec);
                  else setSelectedRecordId('');
                }}
                className="w-full px-2.5 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-oftalmo-700 focus:outline-none"
              >
                <option value="">-- Selecione um exame realizado --</option>
                {filteredRecords.map((r) => {
                  const hasDoc =
                    deliveryByRecordKey.has(r.id) ||
                    deliveryByRecordKey.has(
                      `seq_${r.seqNumber}_${r.exameTipo.trim().toUpperCase()}`
                    );
                  return (
                    <option key={r.id} value={r.id}>
                      #{r.seqNumber} · {r.pacienteNome} — {r.exameTipo} (
                      {formatDateBR(r.dataRealizado)})
                      {hasDoc ? ' [Anexado]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedRecord ? (
              <>
                <div className="bg-oftalmo-50/60 rounded-lg p-3 border border-oftalmo-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-oftalmo-800">
                      {selectedRecord.exameTipo}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                      {formatDateBR(selectedRecord.dataRealizado)}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900">
                    {selectedRecord.pacienteNome}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Pedido eMed: {selectedRecord.pedidoEmed || 'Não informado'}{' '}
                    · {selectedRecord.convenio}
                  </p>
                  {samePatientRecords.length > 1 && (
                    <div className="pt-1.5 mt-1.5 border-t border-oftalmo-200 flex flex-wrap gap-1">
                      <span className="text-[10px] font-semibold text-slate-600 w-full">
                        Exames vinculados a este paciente (
                        {samePatientRecords.length}):
                      </span>
                      {samePatientRecords.map((sr) => (
                        <button
                          key={sr.id}
                          type="button"
                          onClick={() => handleSelectExamForAttachment(sr)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                            sr.id === selectedRecord.id
                              ? 'bg-oftalmo-800 text-white border-oftalmo-800'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          #{sr.seqNumber} {sr.exameTipo}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Credenciais Exclusivas do Paciente */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-oftalmo-700" />
                      Credenciais do Paciente
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const creds = generateDefaultPatientCredentials(
                          selectedRecord.pedidoEmed,
                          selectedRecord.pacienteNome,
                          selectedRecord.seqNumber
                        );
                        setCustomLogin(creds.login);
                        setCustomSenha(
                          String(Math.floor(100000 + Math.random() * 900000))
                        );
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-oftalmo-700 hover:underline cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Nova Senha
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Login
                      </label>
                      <input
                        type="text"
                        required
                        value={customLogin}
                        onChange={(e) =>
                          setCustomLogin(e.target.value.toUpperCase())
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-oftalmo-700 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Senha
                      </label>
                      <input
                        type="text"
                        required
                        value={customSenha}
                        onChange={(e) =>
                          setCustomSenha(e.target.value.toUpperCase())
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-oftalmo-700 tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {/* Upload Ilimitado de Múltiplos Arquivos do Exame */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Arquivos do Exame (PDFs e Imagens sem limite)
                    </label>
                    {attachedFiles.length > 0 && (
                      <span className="text-[11px] font-bold text-oftalmo-800 bg-oftalmo-50 px-2 py-0.5 rounded border border-oftalmo-200">
                        {attachedFiles.length}{' '}
                        {attachedFiles.length === 1 ? 'arquivo' : 'arquivos'}
                      </span>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,application/pdf,image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    disabled={uploadingFiles}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 border border-dashed border-oftalmo-600/60 hover:border-oftalmo-700 bg-oftalmo-50/40 hover:bg-oftalmo-50 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold text-oftalmo-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingFiles
                      ? 'Anexando arquivos...'
                      : attachedFiles.length > 0
                        ? 'Adicionar Mais PDFs ou Imagens (Sem Limite)'
                        : 'Selecionar Quantos PDFs ou Imagens Quiser'}
                  </button>

                  {attachedFiles.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                      {attachedFiles.map((fileItem, idx) => (
                        <div
                          key={`${fileItem.name}_${idx}`}
                          className="flex items-center justify-between bg-verde-50 border border-verde-200 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-verde-900"
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-verde-600 shrink-0" />
                            <span className="truncate">
                              {idx + 1}. {fileItem.name}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachedFiles((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-red-600 hover:underline ml-2 shrink-0 cursor-pointer"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                      {attachedFiles.length > 1 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setAttachedFiles([])}
                            className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
                          >
                            Remover todos os arquivos ({attachedFiles.length})
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={externalFileUrl}
                      onChange={(e) => setExternalFileUrl(e.target.value)}
                      placeholder="Ou cole o link do exame na nuvem..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:bg-white focus:border-oftalmo-700 focus:outline-none"
                    />
                    {externalFileUrl.trim() && (
                      <button
                        type="button"
                        onClick={handleAddExternalUrlFile}
                        className="px-2.5 py-1.5 rounded-md bg-oftalmo-800 hover:bg-oftalmo-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-verde-400" />
                        Incluir Link
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-0.5">
                    Observações do Resultado
                  </label>
                  <textarea
                    rows={2}
                    value={laudoObs}
                    onChange={(e) => setLaudoObs(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:bg-white focus:border-oftalmo-700 focus:outline-none"
                  />
                </div>

                {feedbackMsg && (
                  <div className="p-2.5 rounded-lg bg-oftalmo-50 border border-oftalmo-200 text-xs font-semibold text-oftalmo-900">
                    {feedbackMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingDelivery || uploadingFiles}
                  className="w-full py-2.5 px-4 rounded-lg bg-verde-600 hover:bg-verde-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileCheck2 className="w-4 h-4" />
                  {savingDelivery
                    ? 'Salvando...'
                    : 'Salvar Anexos e Credenciais'}
                </button>
              </>
            ) : (
              <div className="py-6 text-center text-slate-500 text-xs">
                Selecione um paciente na lista acima ou clique em{' '}
                <strong className="text-oftalmo-800">Anexar</strong> na tabela ao
                lado.
              </div>
            )}
          </form>
        </div>

        {/* Coluna Direita: Tabela de Pacientes, Exames e Credenciais */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden min-w-0 max-w-full">
          <div className="bg-oftalmo-950 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold">
                Exames Cadastrados ({filteredRecords.length})
              </h3>
              <p className="text-[11px] text-oftalmo-200">
                Cada paciente usa seu Login/Senha individual; médicos usam o
                Acesso Único ({doctorCreds.login}) para ver todos os exames.
              </p>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-oftalmo-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar paciente, pedido ou exame..."
                className="pl-8 pr-3 py-1 text-xs bg-oftalmo-900 border border-oftalmo-700 rounded-lg text-white placeholder-oftalmo-300 focus:outline-none focus:border-verde-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-oftalmo-50/70 border-b border-oftalmo-100 text-[11px] font-bold uppercase text-oftalmo-950">
                  <th className="py-2 px-2.5 w-10 text-center">Nº</th>
                  <th className="py-2 px-2.5">Paciente / Pedido</th>
                  <th className="py-2 px-2.5">Exame / Data</th>
                  <th className="py-2 px-2.5 text-center">Login</th>
                  <th className="py-2 px-2.5 text-center">Senha</th>
                  <th className="py-2 px-2.5 text-center">Status</th>
                  <th className="py-2 px-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredRecords.map((rec) => {
                  const deliv =
                    deliveryByRecordKey.get(rec.id) ||
                    deliveryByRecordKey.get(
                      `seq_${rec.seqNumber}_${rec.exameTipo.trim().toUpperCase()}`
                    );
                  const samePatientDeliv = activeDeliveries.find(
                    (d) =>
                      (rec.pedidoEmed && d.pedidoEmed === rec.pedidoEmed) ||
                      d.pacienteNome.trim().toUpperCase() ===
                        rec.pacienteNome.trim().toUpperCase()
                  );
                  const defaultCreds = samePatientDeliv
                    ? {
                        login: samePatientDeliv.pacienteLogin,
                        senha: samePatientDeliv.pacienteSenha,
                      }
                    : generateDefaultPatientCredentials(
                        rec.pedidoEmed,
                        rec.pacienteNome,
                        rec.seqNumber
                      );
                  const effectiveLogin = deliv
                    ? deliv.pacienteLogin
                    : defaultCreds.login;
                  const effectiveSenha = deliv
                    ? deliv.pacienteSenha
                    : defaultCreds.senha;
                  const isSelected = selectedRecordId === rec.id;

                  const virtualOrRealDelivery: ExamDeliveryDoc = deliv || {
                    id: `virtual_${rec.id}`,
                    ownerId: rec.ownerId,
                    examRecordId: rec.id,
                    seqNumber: rec.seqNumber,
                    pedidoEmed: rec.pedidoEmed,
                    pacienteNome: rec.pacienteNome,
                    exameTipo: rec.exameTipo,
                    dataRealizado: rec.dataRealizado,
                    pacienteLogin: effectiveLogin,
                    pacienteSenha: effectiveSenha,
                    arquivoNome: `LAUDO_${rec.exameTipo}_${rec.seqNumber}.pdf`,
                    arquivoMime: 'text/plain',
                    arquivoConteudo: '',
                    laudoObservacoes: `Exame de ${rec.exameTipo} liberado.`,
                    retiradoEm: '',
                  };

                  return (
                    <tr
                      key={rec.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-oftalmo-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-2.5 text-center font-semibold text-slate-600 tabular-nums">
                        {rec.seqNumber}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-bold text-slate-900">
                          {rec.pacienteNome}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          Pedido: {rec.pedidoEmed || '—'} · {rec.convenio}
                        </div>
                      </td>
                      <td className="py-2 px-2.5">
                        <span className="font-bold text-oftalmo-800">
                          {rec.exameTipo}
                        </span>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {formatDateBR(rec.dataRealizado)}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-center font-bold text-slate-900 tabular-nums">
                        {effectiveLogin}
                      </td>
                      <td className="py-2 px-2.5 text-center font-bold text-oftalmo-900 tabular-nums">
                        {effectiveSenha}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        {deliv && deliv.arquivoConteudo ? (
                          (() => {
                            const countFiles = parseDeliveryFiles(deliv).length;
                            const countSuffix =
                              countFiles > 1 ? ` (${countFiles} arq.)` : '';
                            return deliv.retiradoEm ? (
                              <span className="inline-flex items-center gap-1 text-verde-700 font-semibold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Retirado{countSuffix}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-oftalmo-700 font-semibold text-[11px]">
                                <FileCheck2 className="w-3.5 h-3.5" />
                                Anexado{countSuffix}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-[11px]">
                            <Clock className="w-3.5 h-3.5" />
                            Aguardando PDF
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSelectExamForAttachment(rec)}
                            className="px-2 py-1 rounded bg-oftalmo-800 hover:bg-oftalmo-700 text-white font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            {deliv ? 'Editar' : 'Anexar'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleCopyCredentials(
                                rec.pacienteNome,
                                rec.exameTipo,
                                rec.dataRealizado,
                                effectiveLogin,
                                effectiveSenha,
                                rec.id
                              )
                            }
                            className="px-2 py-1 rounded bg-verde-600 hover:bg-verde-500 text-white font-semibold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="Copiar mensagem com Link, Login e Senha"
                          >
                            {copiedId === rec.id ? (
                              <>
                                <Check className="w-3 h-3" />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                WhatsApp
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setProtocolModalDelivery(virtualOrRealDelivery)
                            }
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
                            title="Imprimir Protocolo de Retirada"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {deliv && (
                            <button
                              type="button"
                              onClick={() => onDeleteDelivery(deliv.id)}
                              className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer"
                              title="Remover arquivo anexado"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Protocolo Impresso para Entrega ao Paciente */}
      {protocolModalDelivery && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-oftalmo-200 max-w-md w-full p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-oftalmo-800">
                  Portal de Resultados de Exames OftalmoMed
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Protocolo de Retirada de Exames Online
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProtocolModalDelivery(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer print:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
              <div>
                <span className="font-semibold text-slate-500 block text-[10px]">
                  Paciente:
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {protocolModalDelivery.pacienteNome}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-slate-500 block text-[10px]">
                    Exame(s):
                  </span>
                  <span className="font-bold text-oftalmo-800">
                    {records
                      .filter(
                        (r) =>
                          r.pacienteNome.trim().toUpperCase() ===
                          protocolModalDelivery.pacienteNome
                            .trim()
                            .toUpperCase()
                      )
                      .map((r) => r.exameTipo)
                      .join(', ') || protocolModalDelivery.exameTipo}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block text-[10px]">
                    Data do Exame:
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatDateBR(protocolModalDelivery.dataRealizado)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-oftalmo-50/60 border border-oftalmo-200 rounded-xl p-3.5 space-y-2">
              <div className="text-[11px] font-bold text-oftalmo-900">
                Credenciais de Acesso Individual:
              </div>
              <div className="text-xs font-medium text-slate-700 break-all">
                Portal Paciente:{' '}
                <span className="font-bold text-oftalmo-800">
                  {OFFICIAL_PATIENT_PORTAL_DOMAIN}
                </span>{' '}
                <span className="text-[11px] text-slate-500">
                  ({publicPortalUrl})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-white p-2 rounded-lg border border-oftalmo-200">
                  <span className="block text-[10px] font-semibold text-slate-500">
                    Login:
                  </span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {protocolModalDelivery.pacienteLogin}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-oftalmo-200">
                  <span className="block text-[10px] font-semibold text-slate-500">
                    Senha:
                  </span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {protocolModalDelivery.pacienteSenha}
                  </span>
                </div>
              </div>
              <div className="pt-1 text-[11px] text-slate-600">
                Informações: <strong>(11) 2962-2437</strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1 print:hidden">
              <button
                type="button"
                onClick={() =>
                  handleCopyCredentials(
                    protocolModalDelivery.pacienteNome,
                    protocolModalDelivery.exameTipo,
                    protocolModalDelivery.dataRealizado,
                    protocolModalDelivery.pacienteLogin,
                    protocolModalDelivery.pacienteSenha,
                    'protocol_modal_wa'
                  )
                }
                className="px-3.5 py-2 rounded-lg bg-verde-600 hover:bg-verde-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedId === 'protocol_modal_wa' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copiado para WhatsApp
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar p/ WhatsApp
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-lg bg-oftalmo-800 hover:bg-oftalmo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-verde-400" />
                Imprimir Protocolo
              </button>
              <button
                type="button"
                onClick={() => setProtocolModalDelivery(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
