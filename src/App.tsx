import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import {
  LayoutDashboard,
  FileBarChart2,
  Download,
  DollarSign,
  Activity,
  Building2,
  UserCheck,
  Wallet,
  Search,
  Plus,
  Eye,
  Edit3,
  Trash2,
  X,
  Layers,
  CheckCircle2,
  Copy,
  Sparkles,
  Check,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
  Bell,
  Settings2,
  Save,
  FileCheck2,
  KeyRound,
  Lock,
  Unlock,
  Share2,
  Target,
  Calendar,
  Flame,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  db,
  testFirestoreConnection,
} from './firebase';
import {
  ExamRecordDoc,
  NewExamInput,
  ExamDeliveryDoc,
  NewExamDeliveryInput,
  generateSafeId,
  createExamRecord,
  createBatchExamRecords,
  updateExamRecord,
  removeExamRecord,
  reconcileExamRecordsInCloud,
  upsertPricingRule,
  upsertExamDelivery,
  removeExamDelivery,
  generateDefaultPatientCredentials,
} from './services/examService';
import {
  OFFICIAL_ADMIN_SITE_DOMAIN,
  OFFICIAL_PATIENT_PORTAL_DOMAIN,
  getWorkingAdminSiteUrl,
  getWorkingPatientPortalUrl,
  CONVENIOS_PADRAO,
  UNIDADES_INDICADORAS_PADRAO,
  MEDICOS_OPTO_PADRAO,
  TODOS_EXAMES,
  EXAMES_PLANILHA_OFICIAL,
  KITS_DIAGNOSTICOS,
  INITIAL_ATTACHED_SPREADSHEET_ROWS,
  CustomPricingRuleDoc,
  canonicalizeExamName,
  canonicalizeUnidadeName,
  resolveAutoPrice,
  calculateReceptionRepasse,
  getReceptionRepasseRate,
  calculateRealizacaoRepasse,
  getRealizacaoRepasseRate,
  getMissingExamFields,
  formatCurrencyBRL,
  formatDateBR,
  getMonthNameFromISO,
  VALIDATION_LIMITS,
} from './constants/diagnosticCatalog';
import {
  calculateSpreadsheetSummary,
  triggerDownloadSpreadsheetCSV,
} from './utils/spreadsheetCsvSync';
import {
  GoogleSheetsLinkConfig,
  SheetSyncDelta,
  loadGoogleSheetsConfig,
  saveGoogleSheetsConfig,
  pushToGoogleSheetOnline,
  pullFromGoogleSheetOnline,
} from './utils/googleSheetsSync';
import { MonthlyReportsView } from './components/MonthlyReportsView';
import { PatientExamPortalView } from './components/PatientExamPortalView';
import { MonthlyGoalProjectionView } from './components/MonthlyGoalProjectionView';

type PageTab = 1 | 2 | 3 | 4; // 1 = Planilha & Produção, 2 = Entrega de Exames, 3 = Relatórios Mensais, 4 = Projeção Meta Mensal
type LaunchMode = 'single' | 'multi';

const CLINIC_SHARED_SCOPE = 'sao_mateus_1';
const LOCAL_STORAGE_RECORDS_KEY = 'oftalmomed_sao_mateus_1_records_v6';
const LOCAL_STORAGE_PRICING_KEY = 'oftalmomed_sao_mateus_1_pricing_v1';
const LOCAL_STORAGE_DELIVERIES_KEY = 'oftalmomed_sao_mateus_1_deliveries_v2';
const LOCAL_STORAGE_CUSTOM_CONVENIOS_KEY =
  'oftalmomed_sao_mateus_1_custom_convenios_v1';
const LOCAL_STORAGE_SEEDED_FLAG = 'oftalmomed_sao_mateus_1_seeded_v6';
const SESSION_ADMIN_AUTH_KEY = 'oftalmomed_admin_authenticated_v1';

// Digest SHA-256 da credencial administrativa configurada no sistema (sem expor a senha no código-fonte)
const ADMIN_AUTH_DIGEST_HEX =
  '17bb572600b1e2b629c219dc24fd8a78e4461bca28ba677891ae92f5bfbb233f';

async function computeSha256Hex(message: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return '';
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

const MOTIVATIONAL_MESSAGES = [
  {
    quote:
      'Cada exame realizado transforma a visão e a vida de um paciente. Vamos juntos bater nossa meta do mês com dedicação e excelência!',
    author: 'Equipe OftalmoMed São Mateus 1',
  },
  {
    quote:
      'O sucesso é a soma de pequenos esforços diários. Foco no objetivo, energia positiva e vamos superar nossa meta!',
    author: 'Foco & Determinação',
  },
  {
    quote:
      'Excelência em cada atendimento, precisão em cada diagnóstico. Juntos somos mais fortes e vamos atingir os 100%!',
    author: 'Compromisso com o Paciente',
  },
  {
    quote:
      'Grandes conquistas nascem de grandes atitudes diárias. Energia total rumo ao topo da meta do mês!',
    author: 'União e Superação',
  },
  {
    quote:
      'Mais do que números, nossa dedicação cuida da saúde visual de centenas de pessoas. Bora bater a meta!',
    author: 'Propósito OftalmoMed',
  },
];

function createDefaultRecords(): ExamRecordDoc[] {
  return INITIAL_ATTACHED_SPREADSHEET_ROWS.map((row, idx) => ({
    id: `exm_row_${idx + 1}`,
    ownerId: CLINIC_SHARED_SCOPE,
    seqNumber: row.seqNumber,
    pedidoEmed: row.pedidoEmed,
    pacienteNome: row.pacienteNome,
    dataRealizado: row.dataRealizado,
    mesCompetencia: row.dataRealizado.slice(0, 7),
    convenio: row.convenio,
    unidadeIndicadora: row.unidadeIndicadora,
    medicoOpto: row.medicoOpto,
    repasseValor: row.repasseValor,
    valorExame: row.valorExame,
    exameTipo: row.exameTipo,
    observacoes: row.observacoes,
  }));
}

function createDefaultDeliveries(): ExamDeliveryDoc[] {
  return INITIAL_ATTACHED_SPREADSHEET_ROWS.map((row, idx) => {
    const creds = generateDefaultPatientCredentials(
      row.pedidoEmed,
      row.pacienteNome,
      row.seqNumber
    );
    return {
      id: `local_dlv_${idx + 1}`,
      ownerId: CLINIC_SHARED_SCOPE,
      examRecordId: `exm_row_${idx + 1}`,
      seqNumber: row.seqNumber,
      pedidoEmed: row.pedidoEmed,
      pacienteNome: row.pacienteNome,
      exameTipo: row.exameTipo,
      dataRealizado: row.dataRealizado,
      pacienteLogin: creds.login,
      pacienteSenha: creds.senha,
      arquivoNome: `LAUDO_${row.exameTipo}_${row.pedidoEmed}.pdf`,
      arquivoMime: 'text/plain',
      arquivoConteudo: '',
      laudoObservacoes: `Exame de ${row.exameTipo} realizado na unidade São Mateus 1 — Clínica OftalmoMed.`,
      retiradoEm: '',
    };
  });
}

function checkIsUrlPublicPortal(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const portalParam = (params.get('portal') || '').toLowerCase();
  const siteParam = (params.get('site') || '').toLowerCase();
  const modoParam = (params.get('modo') || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();

  if (
    host.includes('resultadoexamesoftalmomed') ||
    pathname.includes('resultadoexamesoftalmomed') ||
    pathname.includes('paciente') ||
    pathname.includes('portal') ||
    portalParam === 'paciente' ||
    portalParam === 'resultados' ||
    portalParam === '1' ||
    portalParam === 'true' ||
    portalParam.includes('resultadoexamesoftalmomed') ||
    modoParam === 'paciente' ||
    hash.includes('retirada') ||
    hash.includes('portal') ||
    hash.includes('paciente')
  ) {
    return true;
  }
  if (
    host.includes('cdooftalmomedsaomateus1') ||
    pathname.includes('cdooftalmomedsaomateus1') ||
    siteParam.includes('cdooftalmomedsaomateus1') ||
    modoParam === 'admin'
  ) {
    return false;
  }
  return false;
}

export default function App() {
  const isUrlPublicPortal = useMemo(() => checkIsUrlPublicPortal(), []);

  const [isPublicPatientOnlyMode, setIsPublicPatientOnlyMode] =
    useState<boolean>(isUrlPublicPortal);
  const [activePage, setActivePage] = useState<PageTab>(
    isUrlPublicPortal ? 2 : 1
  );

  // Escuta mudanças de hash ou navegação para abrir o Portal do Paciente imediatamente
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUrlChange = () => {
      const shouldBePublic = checkIsUrlPublicPortal();
      setIsPublicPatientOnlyMode(shouldBePublic);
      if (shouldBePublic) {
        setActivePage(2);
      }
    };
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  // Mantém a URL sincronizada via query string e hash compatíveis com WhatsApp e recarregamento de página
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const targetUrl = isPublicPatientOnlyMode
        ? '/?portal=paciente#retirada'
        : '/?modo=admin';
      const currentFull =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      if (currentFull !== targetUrl) {
        window.history.replaceState(null, '', targetUrl);
      }
      document.title = isPublicPatientOnlyMode
        ? `Portal de Resultados de Exames OftalmoMed — ${OFFICIAL_PATIENT_PORTAL_DOMAIN}`
        : `Centro Diagnóstico OftalmoMed São Mateus 1 — ${OFFICIAL_ADMIN_SITE_DOMAIN}`;
    } catch {
      // ignore history errors in sandboxed frames
    }
  }, [isPublicPatientOnlyMode]);

  const [showClinicUnlockModal, setShowClinicUnlockModal] = useState(false);
  const [clinicPinInput, setClinicPinInput] = useState('');
  const [clinicPinError, setClinicPinError] = useState<string | null>(null);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [preselectedExamForPortal, setPreselectedExamForPortal] =
    useState<ExamRecordDoc | null>(null);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [copiedAdminUrl, setCopiedAdminUrl] = useState(false);

  // Listas dinâmicas abastecidas pela Planilha Google (ex: lista de unidades indicadoras)
  const [sheetUnidades, setSheetUnidades] = useState<string[]>([
    ...UNIDADES_INDICADORAS_PADRAO,
  ]);
  const [sheetConvenios, setSheetConvenios] = useState<string[]>([
    ...CONVENIOS_PADRAO,
  ]);
  const [sheetExames, setSheetExames] = useState<string[]>([...TODOS_EXAMES]);

  const [records, setRecords] = useState<ExamRecordDoc[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_RECORDS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: ExamRecordDoc) => ({
            ...r,
            unidadeIndicadora: canonicalizeUnidadeName(
              r.unidadeIndicadora || 'São Mateus 1'
            ),
            exameTipo: canonicalizeExamName(
              r.exameTipo || 'OCT de Retina e Glaucoma'
            ),
          }));
        }
      }
    } catch {
      // ignore
    }
    return createDefaultRecords();
  });

  const recordsRef = useRef<ExamRecordDoc[]>(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const [deliveries, setDeliveries] = useState<ExamDeliveryDoc[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_DELIVERIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return createDefaultDeliveries();
  });

  const deliveriesRef = useRef<ExamDeliveryDoc[]>(deliveries);
  useEffect(() => {
    deliveriesRef.current = deliveries;
  }, [deliveries]);

  const [pricingRules, setPricingRules] = useState<CustomPricingRuleDoc[]>(
    () => {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_PRICING_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        // ignore
      }
      return [];
    }
  );

  const [gsheetsConfig] = useState<GoogleSheetsLinkConfig>(() =>
    loadGoogleSheetsConfig()
  );

  const [showPricingModal, setShowPricingModal] = useState(false);
  const [customConvSelect, setCustomConvSelect] = useState('AMIL');
  const [customExamSelect, setCustomExamSelect] = useState('Topografia');
  const [customValorInput, setCustomValorInput] = useState<number>(98);
  const [customRepasseInput, setCustomRepasseInput] = useState<number>(9.8);

  const [customConvenios, setCustomConvenios] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_CUSTOM_CONVENIOS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .map((c) => String(c || '').trim().toUpperCase())
            .filter(Boolean);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [showNewConvenioModal, setShowNewConvenioModal] = useState(false);
  const [newConvenioInput, setNewConvenioInput] = useState('');

  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [missingFieldsAlert, setMissingFieldsAlert] = useState<{
    type: 'error' | 'warning';
    title: string;
    missing: string[];
  } | null>(null);
  const [filterIncompleteOnly, setFilterIncompleteOnly] = useState(false);
  const [lastAddedIds, setLastAddedIds] = useState<string[]>([]);
  const seededCloudRef = useRef<boolean>(
    typeof window !== 'undefined' &&
      localStorage.getItem(LOCAL_STORAGE_SEEDED_FLAG) === '1'
  );
  const lastLocalMutationTimeRef = useRef<number>(0);
  const pacienteInputRef = useRef<HTMLInputElement | null>(null);

  // Pop-up motivador para atingir a meta mensal exibido toda vez que abrir o sistema
  const [showMotivationalModal, setShowMotivationalModal] = useState<boolean>(true);
  const [motivationalMessageIndex] = useState<number>(() =>
    Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)
  );

  const motivationalStats = useMemo(() => {
    const currentMonthPrefix = '2026-10';
    const monthRecords = records.filter((r) =>
      (r.dataRealizado || '').startsWith(currentMonthPrefix)
    );
    const monthBruto = monthRecords.reduce(
      (sum, r) => sum + (r.valorExame || 0),
      0
    );

    let targetGoal = 60000;
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('oftalmomed_monthly_goals_map_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed['Outubro']) targetGoal = Number(parsed['Outubro']) || 60000;
        }
      }
    } catch {}

    const pct = targetGoal > 0 ? (monthBruto / targetGoal) * 100 : 0;
    const remaining = Math.max(0, targetGoal - monthBruto);
    const isGoalBeaten = monthBruto >= targetGoal;
    const surplus = Math.max(0, monthBruto - targetGoal);

    // Dias de produção de segunda a sábado (sem domingos) em Outubro/2026
    let remainingProdDays = 0;
    let totalProdDays = 0;
    const todayDay = new Date().getDate();
    const curDay = Math.min(31, Math.max(1, todayDay));
    for (let d = 1; d <= 31; d++) {
      const dayOfWeek = new Date(2026, 9, d).getDay(); // Outubro
      if (dayOfWeek !== 0) {
        totalProdDays++;
        if (d >= curDay) {
          remainingProdDays++;
        }
      }
    }

    return {
      monthName: 'Outubro',
      monthBruto,
      targetGoal,
      pct,
      remaining,
      isGoalBeaten,
      surplus,
      remainingProdDays,
      totalProdDays,
      count: monthRecords.length,
    };
  }, [records]);

  const showToast = useCallback((msg: string) => {
    setSyncToast(msg);
    setTimeout(() => setSyncToast(null), 3500);
  }, []);

  const publicPortalUrl = useMemo(() => getWorkingPatientPortalUrl(), []);
  const adminSiteUrl = useMemo(() => getWorkingAdminSiteUrl(), []);

  // Combina as 29 unidades oficiais OftalmoMed com quaisquer unidades vindas da Planilha Google sem duplicar maiúsculas/minúsculas
  const unidadesDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    UNIDADES_INDICADORAS_PADRAO.forEach((u) => {
      const canon = canonicalizeUnidadeName(u);
      map.set(canon.toUpperCase(), canon);
    });
    sheetUnidades.forEach((u) => {
      const canon = canonicalizeUnidadeName(u);
      if (canon && !map.has(canon.toUpperCase())) {
        map.set(canon.toUpperCase(), canon);
      }
    });
    records.forEach((r) => {
      const canon = canonicalizeUnidadeName(r.unidadeIndicadora || '');
      if (canon && !map.has(canon.toUpperCase())) {
        map.set(canon.toUpperCase(), canon);
      }
    });
    return Array.from(map.values());
  }, [sheetUnidades, records]);

  const conveniosDisponiveis = useMemo(() => {
    const set = new Set<string>(CONVENIOS_PADRAO);
    sheetConvenios.forEach((c) => {
      const clean = (c || '').trim().toUpperCase();
      if (clean) set.add(clean);
    });
    customConvenios.forEach((c) => {
      const clean = (c || '').trim().toUpperCase();
      if (clean) set.add(clean);
    });
    pricingRules.forEach((p) => {
      const clean = (p.convenio || '').trim().toUpperCase();
      if (clean) set.add(clean);
    });
    records.forEach((r) => {
      const c = (r.convenio || '').trim().toUpperCase();
      if (c) set.add(c);
    });
    return Array.from(set);
  }, [sheetConvenios, customConvenios, pricingRules, records]);

  const examesDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    TODOS_EXAMES.forEach((ex) => {
      const canon = canonicalizeExamName(ex);
      map.set(canon.toUpperCase(), canon);
    });
    sheetExames.forEach((ex) => {
      const canon = canonicalizeExamName(ex);
      if (canon && !map.has(canon.toUpperCase())) {
        map.set(canon.toUpperCase(), canon);
      }
    });
    records.forEach((r) => {
      const canon = canonicalizeExamName(r.exameTipo || '');
      if (canon && !map.has(canon.toUpperCase())) {
        map.set(canon.toUpperCase(), canon);
      }
    });
    return Array.from(map.values());
  }, [sheetExames, records]);

  // Persiste no localStorage e envia automaticamente em segundo plano para a Planilha Google
  // preservando a ordem exata dos registros existentes
  const persistAndSyncExternal = useCallback(
    (updatedRecords: ExamRecordDoc[], delta?: SheetSyncDelta) => {
      const sorted = [...updatedRecords].sort((a, b) => {
        if (a.seqNumber !== b.seqNumber) return a.seqNumber - b.seqNumber;
        return a.id.localeCompare(b.id);
      });

      recordsRef.current = sorted;
      try {
        localStorage.setItem(LOCAL_STORAGE_RECORDS_KEY, JSON.stringify(sorted));
      } catch {
        // ignore
      }

      void pushToGoogleSheetOnline(gsheetsConfig, sorted, delta);
    },
    [gsheetsConfig]
  );

  const deliveryByRecordKey = useMemo(() => {
    const map = new Map<string, ExamDeliveryDoc>();
    deliveries.forEach((d) => {
      map.set(d.examRecordId, d);
      map.set(`seq_${d.seqNumber}_${d.exameTipo.trim().toUpperCase()}`, d);
    });
    return map;
  }, [deliveries]);

  // Sincronização em tempo real com Firestore
  useEffect(() => {
    testFirestoreConnection();

    const examsQuery = query(
      collection(db, 'exam_records'),
      where('ownerId', '==', CLINIC_SHARED_SCOPE)
    );

    const unsubExams = onSnapshot(
      examsQuery,
      async (snapshot) => {
        if (snapshot.empty && !seededCloudRef.current) {
          seededCloudRef.current = true;
          try {
            localStorage.setItem(LOCAL_STORAGE_SEEDED_FLAG, '1');
          } catch {
            // ignore
          }
          const seedInputs: NewExamInput[] =
            INITIAL_ATTACHED_SPREADSHEET_ROWS.map((r) => ({
              seqNumber: r.seqNumber,
              pedidoEmed: r.pedidoEmed,
              pacienteNome: r.pacienteNome,
              dataRealizado: r.dataRealizado,
              convenio: r.convenio,
              unidadeIndicadora: r.unidadeIndicadora,
              medicoOpto: r.medicoOpto,
              repasseValor: r.repasseValor,
              valorExame: r.valorExame,
              exameTipo: r.exameTipo,
              observacoes: r.observacoes,
            }));
          try {
            await createBatchExamRecords(CLINIC_SHARED_SCOPE, seedInputs);
          } catch (err) {
            console.warn('Aviso ao inicializar dados na nuvem:', err);
          }
          return;
        }

        if (snapshot.empty) {
          return;
        }

        seededCloudRef.current = true;
        try {
          localStorage.setItem(LOCAL_STORAGE_SEEDED_FLAG, '1');
        } catch {
          // ignore
        }

        const docs: ExamRecordDoc[] = snapshot.docs.map((d) => {
          const data = d.data();
          const seq = Number(data.seqNumber || 1);
          const ped = String(data.pedidoEmed || '').trim();
          const rawExam = String(data.exameTipo || 'OCT de Retina e Glaucoma');
          const rawMedico = String(data.medicoOpto || 'FORA').trim().toUpperCase();

          return {
            id: d.id,
            ownerId: String(data.ownerId || CLINIC_SHARED_SCOPE),
            seqNumber: seq,
            pedidoEmed: ped,
            pacienteNome: String(data.pacienteNome || '').trim().toUpperCase(),
            dataRealizado: String(data.dataRealizado || '2026-10-08'),
            mesCompetencia: String(data.mesCompetencia || '2026-10'),
            convenio: String(data.convenio || 'SÃO MIGUEL').trim().toUpperCase(),
            unidadeIndicadora: canonicalizeUnidadeName(
              String(data.unidadeIndicadora || 'São Mateus 1')
            ),
            medicoOpto: rawMedico || 'FORA',
            repasseValor: Number(data.repasseValor || 0),
            valorExame: Number(data.valorExame || 0),
            exameTipo: canonicalizeExamName(rawExam),
            observacoes: String(data.observacoes || 'a ser entregue').trim(),
          };
        });

        const sorted = docs
          .sort((a, b) => {
            if (a.seqNumber !== b.seqNumber) return a.seqNumber - b.seqNumber;
            return a.id.localeCompare(b.id);
          })
          .map((r, idx) => ({ ...r, seqNumber: idx + 1 }));

        setRecords(sorted);
        recordsRef.current = sorted;
        try {
          localStorage.setItem(
            LOCAL_STORAGE_RECORDS_KEY,
            JSON.stringify(sorted)
          );
        } catch {
          // ignore
        }

        // Garante que a Planilha Google Online fique exatamente igual ao Web (Planilha & Produção)
        void pushToGoogleSheetOnline(gsheetsConfig, sorted, {
          action: 'update',
          changedRecords: sorted,
        });
      },
      (error) => {
        console.warn(
          'Firestore listener fallback para armazenamento local:',
          error
        );
      }
    );

    const rulesQuery = query(
      collection(db, 'pricing_rules'),
      where('ownerId', '==', CLINIC_SHARED_SCOPE)
    );
    const unsubRules = onSnapshot(
      rulesQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const loadedRules: CustomPricingRuleDoc[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: String(data.ownerId || CLINIC_SHARED_SCOPE),
              convenio: String(data.convenio || 'SÃO MIGUEL'),
              exameTipo: String(data.exameTipo || 'OCT'),
              valorExame: Number(data.valorExame || 0),
              repasseValor: Number(data.repasseValor || 0),
            };
          });
          setPricingRules(loadedRules);
          try {
            localStorage.setItem(
              LOCAL_STORAGE_PRICING_KEY,
              JSON.stringify(loadedRules)
            );
          } catch {
            // ignore
          }
        }
      },
      () => {
        // ignore fallback
      }
    );

    const deliveriesQuery = query(
      collection(db, 'exam_deliveries'),
      where('ownerId', '==', CLINIC_SHARED_SCOPE)
    );
    const unsubDeliveries = onSnapshot(
      deliveriesQuery,
      (snapshot) => {
        const loadedDeliveries: ExamDeliveryDoc[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId || CLINIC_SHARED_SCOPE),
            examRecordId: String(data.examRecordId || ''),
            seqNumber: Number(data.seqNumber || 1),
            pedidoEmed: String(data.pedidoEmed || ''),
            pacienteNome: String(data.pacienteNome || ''),
            exameTipo: String(data.exameTipo || ''),
            dataRealizado: String(data.dataRealizado || '2026-10-08'),
            pacienteLogin: String(data.pacienteLogin || ''),
            pacienteSenha: String(data.pacienteSenha || ''),
            arquivoNome: String(data.arquivoNome || ''),
            arquivoMime: String(data.arquivoMime || ''),
            arquivoConteudo: String(data.arquivoConteudo || ''),
            laudoObservacoes: String(data.laudoObservacoes || ''),
            retiradoEm: String(data.retiradoEm || ''),
          };
        });
        setDeliveries(loadedDeliveries);
        deliveriesRef.current = loadedDeliveries;
        try {
          localStorage.setItem(
            LOCAL_STORAGE_DELIVERIES_KEY,
            JSON.stringify(loadedDeliveries)
          );
        } catch {
          // ignore
        }
      },
      () => {
        // ignore fallback
      }
    );

    return () => {
      unsubExams();
      unsubRules();
      unsubDeliveries();
    };
  }, []);

  // ===========================================================================
  // INTEGRAÇÃO AUTOMÁTICA EM SEGUNDO PLANO COM A PLANILHA GOOGLE
  // (Busca lista de unidades/catálogos e mantém a Planilha Online 100% idêntica ao Web)
  // ===========================================================================
  const syncCatalogAndNewRowsFromSheet = useCallback(async () => {
    try {
      const result = await pullFromGoogleSheetOnline(
        gsheetsConfig.sheetUrl,
        '2026-10-08'
      );

      if (result.catalog) {
        if (result.catalog.unidades.length > 0) {
          setSheetUnidades(result.catalog.unidades);
        }
        if (result.catalog.convenios.length > 0) {
          setSheetConvenios(result.catalog.convenios);
        }
        if (result.catalog.exames.length > 0) {
          setSheetExames(result.catalog.exames);
        }
      }
    } catch {
      // Silencioso
    }
  }, [gsheetsConfig.sheetUrl]);

  useEffect(() => {
    saveGoogleSheetsConfig(gsheetsConfig);
    void syncCatalogAndNewRowsFromSheet();
    // Garante que a Planilha Online receba imediatamente o estado atual da aba Planilha & Produção
    if (recordsRef.current.length > 0) {
      void pushToGoogleSheetOnline(gsheetsConfig, recordsRef.current, {
        action: 'update',
        changedRecords: recordsRef.current,
      });
    }

    const interval = setInterval(() => {
      void syncCatalogAndNewRowsFromSheet();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [gsheetsConfig, syncCatalogAndNewRowsFromSheet]);

  // Salvar exame anexado + login/senha do paciente
  const handleSaveDelivery = async (
    existingId: string | null,
    input: NewExamDeliveryInput
  ) => {
    const tempId =
      existingId && !existingId.startsWith('virtual_')
        ? existingId
        : generateSafeId('dlv');
    const newDoc: ExamDeliveryDoc = {
      id: tempId,
      ownerId: CLINIC_SHARED_SCOPE,
      examRecordId: input.examRecordId,
      seqNumber: input.seqNumber,
      pedidoEmed: input.pedidoEmed,
      pacienteNome: input.pacienteNome.toUpperCase(),
      exameTipo: input.exameTipo.toUpperCase(),
      dataRealizado: input.dataRealizado,
      pacienteLogin: input.pacienteLogin.toUpperCase(),
      pacienteSenha: input.pacienteSenha.toUpperCase(),
      arquivoNome: input.arquivoNome,
      arquivoMime: input.arquivoMime,
      arquivoConteudo: input.arquivoConteudo,
      laudoObservacoes: input.laudoObservacoes || '',
      retiradoEm: input.retiradoEm || '',
    };

    const realExistingId =
      existingId && !existingId.startsWith('virtual_') ? existingId : null;

    const nextList = realExistingId
      ? deliveriesRef.current.map((d) =>
          d.id === realExistingId ? newDoc : d
        )
      : [
          ...deliveriesRef.current.filter(
            (d) => d.examRecordId !== input.examRecordId
          ),
          newDoc,
        ];

    setDeliveries(nextList);
    deliveriesRef.current = nextList;
    try {
      localStorage.setItem(
        LOCAL_STORAGE_DELIVERIES_KEY,
        JSON.stringify(nextList)
      );
    } catch {
      // ignore
    }

    showToast(
      `Exame anexado! Login: ${newDoc.pacienteLogin} | Senha: ${newDoc.pacienteSenha}`
    );

    try {
      const savedId = await upsertExamDelivery(
        CLINIC_SHARED_SCOPE,
        realExistingId,
        input
      );
      setDeliveries((prev) =>
        prev.map((d) => (d.id === tempId ? { ...d, id: savedId } : d))
      );
    } catch (err) {
      console.warn('Anexo salvo localmente:', err);
    }
  };

  const handleDeleteDelivery = async (deliveryId: string) => {
    const nextList = deliveriesRef.current.filter((d) => d.id !== deliveryId);
    setDeliveries(nextList);
    deliveriesRef.current = nextList;
    try {
      localStorage.setItem(
        LOCAL_STORAGE_DELIVERIES_KEY,
        JSON.stringify(nextList)
      );
    } catch {
      // ignore
    }
    showToast('Anexo de exame removido.');
    try {
      await removeExamDelivery(deliveryId);
    } catch {
      // ignore
    }
  };

  const handlePatientDownloadedExam = async (delivery: ExamDeliveryDoc) => {
    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    await handleSaveDelivery(delivery.id, {
      examRecordId: delivery.examRecordId,
      seqNumber: delivery.seqNumber,
      pedidoEmed: delivery.pedidoEmed,
      pacienteNome: delivery.pacienteNome,
      exameTipo: delivery.exameTipo,
      dataRealizado: delivery.dataRealizado,
      pacienteLogin: delivery.pacienteLogin,
      pacienteSenha: delivery.pacienteSenha,
      arquivoNome: delivery.arquivoNome,
      arquivoMime: delivery.arquivoMime,
      arquivoConteudo: delivery.arquivoConteudo,
      laudoObservacoes: delivery.laudoObservacoes,
      retiradoEm: nowStr,
    });

    const targetRecord = recordsRef.current.find(
      (r) =>
        r.id === delivery.examRecordId || r.seqNumber === delivery.seqNumber
    );
    if (targetRecord && targetRecord.observacoes !== 'Entregue') {
      await handleUpdateExam(targetRecord.id, {
        seqNumber: targetRecord.seqNumber,
        pedidoEmed: targetRecord.pedidoEmed,
        pacienteNome: targetRecord.pacienteNome,
        dataRealizado: targetRecord.dataRealizado,
        convenio: targetRecord.convenio,
        unidadeIndicadora: targetRecord.unidadeIndicadora,
        medicoOpto: targetRecord.medicoOpto,
        repasseValor: targetRecord.repasseValor,
        valorExame: targetRecord.valorExame,
        exameTipo: targetRecord.exameTipo,
        observacoes: 'Entregue',
      });
    }
  };

  const handleSaveCustomPrice = async (
    targetConvenio: string,
    targetExame: string,
    newValor: number,
    newRepasse?: number
  ) => {
    const cleanConv = targetConvenio.trim().toUpperCase();
    const cleanExam = targetExame.trim().toUpperCase();
    const safeValor = Math.max(0, Number(newValor) || 0);
    const safeRepasse =
      newRepasse !== undefined
        ? Math.max(0, Number(newRepasse) || 0)
        : calculateReceptionRepasse(safeValor, cleanConv);

    const existing = pricingRules.find(
      (r) =>
        r.convenio.trim().toUpperCase() === cleanConv &&
        r.exameTipo.trim().toUpperCase() === cleanExam
    );

    const updatedRules: CustomPricingRuleDoc[] = existing
      ? pricingRules.map((r) =>
          r.id === existing.id
            ? { ...r, valorExame: safeValor, repasseValor: safeRepasse }
            : r
        )
      : [
          ...pricingRules,
          {
            id: `local_prc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ownerId: CLINIC_SHARED_SCOPE,
            convenio: cleanConv,
            exameTipo: cleanExam,
            valorExame: safeValor,
            repasseValor: safeRepasse,
          },
        ];

    setPricingRules(updatedRules);
    try {
      localStorage.setItem(
        LOCAL_STORAGE_PRICING_KEY,
        JSON.stringify(updatedRules)
      );
    } catch {
      // ignore
    }

    showToast(
      `Valor padrão atualizado: ${cleanExam} (${cleanConv}) = ${formatCurrencyBRL(
        safeValor
      )} | Repasse de Realização: ${formatCurrencyBRL(safeRepasse)}`
    );

    try {
      await upsertPricingRule(
        CLINIC_SHARED_SCOPE,
        existing && !existing.id.startsWith('local_') ? existing.id : null,
        cleanConv,
        cleanExam,
        safeValor,
        safeRepasse
      );
    } catch (err) {
      console.warn('Regra salva localmente:', err);
    }
  };

  const handleRegisterNewConvenio = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = newConvenioInput.trim().toUpperCase().slice(0, 60);
    if (!cleanName) {
      showToast('Digite o nome do novo convênio.');
      return;
    }

    const nextCustom = Array.from(new Set([...customConvenios, cleanName]));
    setCustomConvenios(nextCustom);
    try {
      localStorage.setItem(
        LOCAL_STORAGE_CUSTOM_CONVENIOS_KEY,
        JSON.stringify(nextCustom)
      );
    } catch {
      // ignore
    }

    setConvenio(cleanName);
    setCustomConvSelect(cleanName);
    setNewConvenioInput('');
    setShowNewConvenioModal(false);

    // Registra uma regra inicial no Firestore para que o novo convênio fique disponível em todos os computadores da clínica
    const defaultExam = examesDisponiveis[0] || 'OCT de Retina e Glaucoma';
    const basePrice = resolveAutoPrice(cleanName, defaultExam, pricingRules);
    await handleSaveCustomPrice(
      cleanName,
      defaultExam,
      basePrice.valorExame,
      basePrice.repasseValor
    );

    showToast(`Novo convênio "${cleanName}" cadastrado e selecionado!`);
  };

  const handleRecalculateAllReceptionRepasses = async () => {
    lastLocalMutationTimeRef.current = Date.now();
    const currentList = recordsRef.current;
    const updatedList = currentList.map((r) => ({
      ...r,
      repasseValor: calculateReceptionRepasse(r.valorExame, r.convenio),
    }));
    setRecords(updatedList);
    persistAndSyncExternal(updatedList, {
      action: 'update',
      changedRecords: updatedList,
    });
    showToast(
      'Todos os repasses foram atualizados na Web e na Planilha Online!'
    );
    try {
      await reconcileExamRecordsInCloud(
        CLINIC_SHARED_SCOPE,
        currentList,
        updatedList
      );
    } catch {
      // ignore
    }
  };

  // ===========================================================================
  // BARRA DE INCLUSÃO RÁPIDA E AUTOMÁTICA
  // ===========================================================================
  const [launchMode, setLaunchMode] = useState<LaunchMode>('single');
  const [submitting, setSubmitting] = useState(false);

  const nextSeqNumber = useMemo(() => {
    if (records.length === 0) return 1;
    return Math.max(...records.map((r) => r.seqNumber)) + 1;
  }, [records]);

  const [pedidoEmed, setPedidoEmed] = useState('');
  const [pacienteNome, setPacienteNome] = useState('');
  const [dataRealizado, setDataRealizado] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [convenio, setConvenio] = useState<string>('SÃO MIGUEL');
  const [unidadeIndicadora, setUnidadeIndicadora] =
    useState<string>('São Mateus 1');
  const [medicoOpto, setMedicoOpto] = useState<string>('FORA');
  const [exameTipo, setExameTipo] = useState<string>('OCT de Retina e Glaucoma');
  const [repasseValor, setRepasseValor] = useState<number>(16);
  const [valorExame, setValorExame] = useState<number>(160);
  const [observacoes, setObservacoes] = useState<string>('a ser entregue');
  const [autoFillBanner, setAutoFillBanner] = useState<string | null>(null);

  const [selectedMultiExams, setSelectedMultiExams] = useState<string[]>([
    'Retinografia Colorida',
    'Campimetria',
    'Paquimetria',
  ]);

  useEffect(() => {
    const calc = resolveAutoPrice(convenio, exameTipo, pricingRules);
    setValorExame(calc.valorExame);
    setRepasseValor(calc.repasseValor);
  }, [convenio, exameTipo, pricingRules]);

  useEffect(() => {
    const calc = resolveAutoPrice(
      customConvSelect,
      customExamSelect,
      pricingRules
    );
    setCustomValorInput(calc.valorExame);
    setCustomRepasseInput(calc.repasseValor);
  }, [customConvSelect, customExamSelect, pricingRules]);

  const currentDefaultForSelected = useMemo(
    () => resolveAutoPrice(convenio, exameTipo, pricingRules),
    [convenio, exameTipo, pricingRules]
  );
  const isCustomPriceModifiedInBar =
    Math.abs(valorExame - currentDefaultForSelected.valorExame) > 0.009 ||
    Math.abs(repasseValor - currentDefaultForSelected.repasseValor) > 0.009;

  const handleLookupHistory = (newPedido: string, newPaciente: string) => {
    const cleanPed = newPedido.trim().toUpperCase();
    const cleanPac = newPaciente.trim().toUpperCase();

    if (cleanPed.length >= 3) {
      const found = recordsRef.current.find(
        (r) => r.pedidoEmed.trim().toUpperCase() === cleanPed
      );
      if (found) {
        if (!pacienteNome) setPacienteNome(found.pacienteNome);
        setConvenio(found.convenio);
        setUnidadeIndicadora(canonicalizeUnidadeName(found.unidadeIndicadora));
        setMedicoOpto(found.medicoOpto);
        setAutoFillBanner(
          `Preenchido automaticamente do Pedido #${found.pedidoEmed} (${found.pacienteNome})`
        );
        return;
      }
    }

    if (cleanPac.length >= 6) {
      const found = recordsRef.current.find(
        (r) => r.pacienteNome.trim().toUpperCase() === cleanPac
      );
      if (found) {
        if (!pedidoEmed && found.pedidoEmed) setPedidoEmed(found.pedidoEmed);
        setConvenio(found.convenio);
        setUnidadeIndicadora(canonicalizeUnidadeName(found.unidadeIndicadora));
        setMedicoOpto(found.medicoOpto);
        setAutoFillBanner(
          `Dados recuperados automaticamente de ${found.pacienteNome}`
        );
      }
    }
  };

  // ===========================================================================
  // FILTROS E EDIÇÃO DIRETA NA LINHA
  // ===========================================================================
  const [searchInput, setSearchInput] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterConvenio, setFilterConvenio] = useState<string>('');
  const [filterUnit, setFilterUnit] = useState<string>('');
  const [filterExame, setFilterExame] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>(''); // YYYY-MM-DD
  const [filterDatePreset, setFilterDatePreset] = useState<
    'all' | 'today' | 'yesterday' | 'last7' | 'custom'
  >('all');

  // Datas de referência para filtros temporais
  const todayISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const yesterdayISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const last7DaysStartISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Contagem de exames produzidos hoje e ontem
  const countProducedToday = useMemo(() => {
    return records.filter((r) => r.dataRealizado === todayISO).length;
  }, [records, todayISO]);

  const countProducedYesterday = useMemo(() => {
    return records.filter((r) => r.dataRealizado === yesterdayISO).length;
  }, [records, yesterdayISO]);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NewExamInput | null>(null);
  const [breakdownRecord, setBreakdownRecord] = useState<ExamRecordDoc | null>(
    null
  );

  const clearAllTableFilters = () => {
    setFilterDate('');
    setFilterDatePreset('all');
    setFilterMonth('');
    setFilterConvenio('');
    setFilterUnit('');
    setFilterExame('');
    setSearchInput('');
  };

  const handleAddExam = async (input: NewExamInput) => {
    lastLocalMutationTimeRef.current = Date.now();
    const recordId = generateSafeId('exm');
    const currentList = recordsRef.current;
    const assignedSeq =
      currentList.length === 0
        ? 1
        : Math.max(...currentList.map((r) => r.seqNumber)) + 1;

    const finalInput: NewExamInput = {
      ...input,
      seqNumber: assignedSeq,
      unidadeIndicadora: canonicalizeUnidadeName(input.unidadeIndicadora),
      exameTipo: canonicalizeExamName(input.exameTipo),
    };

    const newDoc: ExamRecordDoc = {
      id: recordId,
      ownerId: CLINIC_SHARED_SCOPE,
      seqNumber: assignedSeq,
      pedidoEmed: finalInput.pedidoEmed.trim(),
      pacienteNome: finalInput.pacienteNome.trim().toUpperCase(),
      dataRealizado: finalInput.dataRealizado,
      mesCompetencia: finalInput.dataRealizado.slice(0, 7),
      convenio: finalInput.convenio.trim().toUpperCase(),
      unidadeIndicadora: finalInput.unidadeIndicadora,
      medicoOpto: finalInput.medicoOpto.trim().toUpperCase() || 'FORA',
      repasseValor: Number(finalInput.repasseValor) || 0,
      valorExame: Number(finalInput.valorExame) || 0,
      exameTipo: finalInput.exameTipo,
      observacoes: finalInput.observacoes || 'a ser entregue',
    };

    clearAllTableFilters();

    const updatedList = [...currentList, newDoc];
    setRecords(updatedList);
    setLastAddedIds([recordId]);
    setTimeout(() => setLastAddedIds([]), 4500);

    // Envia automaticamente o novo registro para a Planilha Google sem alterar os existentes
    persistAndSyncExternal(updatedList, {
      action: 'append',
      changedRecords: [newDoc],
    });
    showToast(
      `Linha Nº ${assignedSeq} (${newDoc.pacienteNome} · ${newDoc.exameTipo}) enviada automaticamente para a Planilha!`
    );

    try {
      await createExamRecord(CLINIC_SHARED_SCOPE, finalInput, recordId);
    } catch (err) {
      console.warn('Salvo localmente; sincronização em nuvem pendente:', err);
    }
  };

  const handleAddBatchExams = async (inputs: NewExamInput[]) => {
    if (inputs.length === 0) return;
    lastLocalMutationTimeRef.current = Date.now();

    const currentList = recordsRef.current;
    const baseSeq =
      currentList.length === 0
        ? 1
        : Math.max(...currentList.map((r) => r.seqNumber)) + 1;

    const normalizedInputs: NewExamInput[] = inputs.map((inp, idx) => ({
      ...inp,
      seqNumber: baseSeq + idx,
      unidadeIndicadora: canonicalizeUnidadeName(inp.unidadeIndicadora),
      exameTipo: canonicalizeExamName(inp.exameTipo),
    }));

    const customIds = normalizedInputs.map(
      (_, idx) => `${generateSafeId('exm')}_${idx}`
    );

    const newDocs: ExamRecordDoc[] = normalizedInputs.map((input, idx) => ({
      id: customIds[idx],
      ownerId: CLINIC_SHARED_SCOPE,
      seqNumber: input.seqNumber,
      pedidoEmed: input.pedidoEmed.trim(),
      pacienteNome: input.pacienteNome.trim().toUpperCase(),
      dataRealizado: input.dataRealizado,
      mesCompetencia: input.dataRealizado.slice(0, 7),
      convenio: input.convenio.trim().toUpperCase(),
      unidadeIndicadora: input.unidadeIndicadora,
      medicoOpto: input.medicoOpto.trim().toUpperCase() || 'FORA',
      repasseValor: Number(input.repasseValor) || 0,
      valorExame: Number(input.valorExame) || 0,
      exameTipo: input.exameTipo,
      observacoes: input.observacoes || 'a ser entregue',
    }));

    clearAllTableFilters();

    const updatedList = [...currentList, ...newDocs];
    setRecords(updatedList);
    setLastAddedIds(customIds);
    setTimeout(() => setLastAddedIds([]), 5000);

    // Envia automaticamente os novos exames em lote para a Planilha Google
    persistAndSyncExternal(updatedList, {
      action: 'append',
      changedRecords: newDocs,
    });
    showToast(
      `${inputs.length} exames (${newDocs.map((d) => d.exameTipo).join(', ')}) enviados automaticamente para a Planilha!`
    );

    try {
      await createBatchExamRecords(
        CLINIC_SHARED_SCOPE,
        normalizedInputs,
        customIds
      );
    } catch (err) {
      console.warn('Lote salvo localmente; sincronização em nuvem pendente:', err);
    }
  };

  const handleUpdateExam = async (recordId: string, input: NewExamInput) => {
    lastLocalMutationTimeRef.current = Date.now();

    // Atualiza estritamente o registro alterado na sua posição exata (seqNumber), sem reordenar os demais
    const updatedList = recordsRef.current.map((r) => {
      if (r.id !== recordId) return r;
      const modified: ExamRecordDoc = {
        ...r,
        seqNumber: r.seqNumber,
        pedidoEmed: input.pedidoEmed.trim(),
        pacienteNome: input.pacienteNome.trim().toUpperCase(),
        dataRealizado: input.dataRealizado,
        mesCompetencia: input.dataRealizado.slice(0, 7),
        convenio: input.convenio.trim().toUpperCase(),
        unidadeIndicadora: canonicalizeUnidadeName(input.unidadeIndicadora),
        medicoOpto: input.medicoOpto.trim().toUpperCase() || 'FORA',
        repasseValor: Number(input.repasseValor) || 0,
        valorExame: Number(input.valorExame) || 0,
        exameTipo: canonicalizeExamName(input.exameTipo),
        observacoes: input.observacoes || 'a ser entregue',
      };
      return modified;
    });

    const updatedDocRef = updatedList.find((r) => r.id === recordId) || null;

    setRecords(updatedList);
    persistAndSyncExternal(updatedList, {
      action: 'update',
      changedRecords: updatedDocRef ? [updatedDocRef] : [],
    });
    showToast('Registro atualizado automaticamente na Planilha!');

    try {
      const targetPayload: NewExamInput = {
        ...input,
        seqNumber: updatedDocRef ? updatedDocRef.seqNumber : input.seqNumber,
        unidadeIndicadora: canonicalizeUnidadeName(input.unidadeIndicadora),
        exameTipo: canonicalizeExamName(input.exameTipo),
      };
      if (!recordId.startsWith('seed_') && !recordId.startsWith('local_')) {
        try {
          await updateExamRecord(recordId, CLINIC_SHARED_SCOPE, targetPayload);
        } catch {
          await createExamRecord(CLINIC_SHARED_SCOPE, targetPayload, recordId);
        }
      }
    } catch (err) {
      console.warn('Atualização salva localmente:', err);
    }
  };

  const handleDeleteExam = async (recordId: string) => {
    lastLocalMutationTimeRef.current = Date.now();
    const currentList = recordsRef.current;
    const targetToDelete = currentList.find((r) => r.id === recordId);

    const remaining = currentList
      .filter((r) => r.id !== recordId)
      .sort((a, b) => a.seqNumber - b.seqNumber)
      .map((r, idx) => ({ ...r, seqNumber: idx + 1 }));

    setRecords(remaining);
    persistAndSyncExternal(remaining, {
      action: 'delete',
      changedRecords: targetToDelete ? [targetToDelete] : [],
    });

    // Remove também qualquer anexo vinculado ao exame excluído
    const linkedDeliveries = deliveriesRef.current.filter(
      (d) =>
        d.examRecordId === recordId ||
        (targetToDelete &&
          d.seqNumber === targetToDelete.seqNumber &&
          d.exameTipo.trim().toUpperCase() ===
            targetToDelete.exameTipo.trim().toUpperCase())
    );
    if (linkedDeliveries.length > 0) {
      const nextDeliveries = deliveriesRef.current.filter(
        (d) => !linkedDeliveries.some((ld) => ld.id === d.id)
      );
      setDeliveries(nextDeliveries);
      deliveriesRef.current = nextDeliveries;
      try {
        localStorage.setItem(
          LOCAL_STORAGE_DELIVERIES_KEY,
          JSON.stringify(nextDeliveries)
        );
      } catch {
        // ignore
      }
      for (const ld of linkedDeliveries) {
        try {
          await removeExamDelivery(ld.id);
        } catch {
          // ignore
        }
      }
    }

    showToast('Exame removido e Planilha atualizada automaticamente!');

    try {
      if (!recordId.startsWith('seed_') && !recordId.startsWith('local_')) {
        await removeExamRecord(recordId);
      }
      await reconcileExamRecordsInCloud(
        CLINIC_SHARED_SCOPE,
        currentList,
        remaining
      );
    } catch (err) {
      console.warn('Remoção aplicada localmente:', err);
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validation = getMissingExamFields({
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

    if (!validation.isValid) {
      setMissingFieldsAlert({
        type: 'error',
        title: 'Não é possível lançar o exame! Campos obrigatórios faltando:',
        missing: validation.missingRequired,
      });
      showToast(
        `⚠️ Campos obrigatórios faltando: ${validation.missingRequired.join(', ')}`
      );
      if (validation.missingRequired.includes('Nome do Paciente')) {
        pacienteInputRef.current?.focus();
      }
      return;
    }

    if (validation.missingRecommended.length > 0) {
      showToast(
        `Aviso: Exame incluído com campos pendentes: ${validation.missingRecommended.join(', ')}`
      );
      setMissingFieldsAlert({
        type: 'warning',
        title: 'Atenção: Exame incluído, mas com dados pendentes no cadastro:',
        missing: validation.missingRecommended,
      });
    } else {
      setMissingFieldsAlert(null);
    }

    setFormWarning(null);
    setSubmitting(true);
    try {
      await handleAddExam({
        seqNumber: nextSeqNumber,
        pedidoEmed: pedidoEmed.trim(),
        pacienteNome: pacienteNome.trim().toUpperCase(),
        dataRealizado,
        convenio,
        unidadeIndicadora,
        medicoOpto: medicoOpto.trim().toUpperCase() || 'FORA',
        repasseValor,
        valorExame,
        exameTipo,
        observacoes,
      });
      setPacienteNome('');
      setPedidoEmed('');
      setAutoFillBanner(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMultiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validation = getMissingExamFields({
      pacienteNome,
      pedidoEmed,
      dataRealizado,
      convenio,
      unidadeIndicadora,
      medicoOpto,
      exameTipo: selectedMultiExams[0] || '',
      valorExame: 100,
    });

    const missing = [...validation.missingRequired];
    if (selectedMultiExams.length === 0) {
      missing.push('Selecione pelo menos 1 exame');
    }

    if (missing.length > 0) {
      setMissingFieldsAlert({
        type: 'error',
        title: 'Não é possível lançar múltiplos exames! Campos obrigatórios faltando:',
        missing,
      });
      showToast(`⚠️ Campos obrigatórios faltando: ${missing.join(', ')}`);
      return;
    }

    if (validation.missingRecommended.length > 0) {
      showToast(
        `Aviso: Múltiplos exames lançados com dados pendentes: ${validation.missingRecommended.join(', ')}`
      );
      setMissingFieldsAlert({
        type: 'warning',
        title: 'Atenção: Exames incluídos, mas com dados pendentes:',
        missing: validation.missingRecommended,
      });
    } else {
      setMissingFieldsAlert(null);
    }

    setFormWarning(null);
    setSubmitting(true);
    try {
      const inputs: NewExamInput[] = selectedMultiExams.map((ex, idx) => {
        const auto = resolveAutoPrice(convenio, ex, pricingRules);
        return {
          seqNumber: nextSeqNumber + idx,
          pedidoEmed: pedidoEmed.trim(),
          pacienteNome: pacienteNome.trim().toUpperCase(),
          dataRealizado,
          convenio,
          unidadeIndicadora,
          medicoOpto: medicoOpto.trim().toUpperCase() || 'FORA',
          repasseValor: auto.repasseValor,
          valorExame: auto.valorExame,
          exameTipo: ex,
          observacoes,
        };
      });
      await handleAddBatchExams(inputs);
      setPacienteNome('');
      setPedidoEmed('');
      setAutoFillBanner(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyPatientToBar = (rec: ExamRecordDoc) => {
    setLaunchMode('multi');
    setPedidoEmed(rec.pedidoEmed);
    setPacienteNome(rec.pacienteNome);
    setDataRealizado(rec.dataRealizado);
    setConvenio(rec.convenio);
    setUnidadeIndicadora(rec.unidadeIndicadora);
    setMedicoOpto(rec.medicoOpto);
    setObservacoes(rec.observacoes || 'a ser entregue');
    setAutoFillBanner(
      `Paciente "${rec.pacienteNome}" carregado em Multi-Exames — selecione os exames e clique em Incluir.`
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredRecords = useMemo(() => {
    return records
      .filter((item) => {
        // Filtro por Data (Hoje, Ontem, Últimos 7 dias, ou Data Específica)
        if (filterDatePreset === 'today') {
          if (item.dataRealizado !== todayISO) return false;
        } else if (filterDatePreset === 'yesterday') {
          if (item.dataRealizado !== yesterdayISO) return false;
        } else if (filterDatePreset === 'last7') {
          if (item.dataRealizado < last7DaysStartISO || item.dataRealizado > todayISO) return false;
        } else if (filterDatePreset === 'custom' && filterDate) {
          if (item.dataRealizado !== filterDate) return false;
        } else if (filterDate) {
          if (item.dataRealizado !== filterDate) return false;
        }

        const itemMonthName = getMonthNameFromISO(item.dataRealizado);
        const mMonth = !filterMonth || itemMonthName === filterMonth;
        const mConv =
          !filterConvenio ||
          item.convenio.toUpperCase().includes(filterConvenio.toUpperCase());
        const mUnit =
          !filterUnit ||
          canonicalizeUnidadeName(item.unidadeIndicadora) ===
            canonicalizeUnidadeName(filterUnit);
        const mExam =
          !filterExame ||
          canonicalizeExamName(item.exameTipo) ===
            canonicalizeExamName(filterExame);

        const q = searchInput.toLowerCase().trim();
        const mSearch =
          !q ||
          item.pacienteNome.toLowerCase().includes(q) ||
          item.pedidoEmed.toLowerCase().includes(q) ||
          item.exameTipo.toLowerCase().includes(q) ||
          item.medicoOpto.toLowerCase().includes(q) ||
          item.convenio.toLowerCase().includes(q) ||
          (item.observacoes || '').toLowerCase().includes(q);

        if (filterIncompleteOnly) {
          const audit = getMissingExamFields(item);
          if (audit.isValid && audit.allMissing.length === 0) return false;
        }

        return mMonth && mConv && mUnit && mExam && mSearch;
      })
      .sort((a, b) => a.seqNumber - b.seqNumber);
  }, [
    records,
    filterDate,
    filterDatePreset,
    todayISO,
    yesterdayISO,
    last7DaysStartISO,
    filterMonth,
    filterConvenio,
    filterUnit,
    filterExame,
    filterIncompleteOnly,
    searchInput,
  ]);

  const incompleteRecordsCount = useMemo(() => {
    return records.filter((item) => {
      const audit = getMissingExamFields(item);
      return !audit.isValid || audit.allMissing.length > 0;
    }).length;
  }, [records]);

  const summary = useMemo(
    () => calculateSpreadsheetSummary(filteredRecords),
    [filteredRecords]
  );

  const sidebarExamEntries = useMemo(() => {
    const baseSet = new Set<string>(EXAMES_PLANILHA_OFICIAL);
    const extraExams = Object.keys(summary.examCounts).filter(
      (k) => !baseSet.has(k) && (summary.examCounts[k] || 0) > 0
    );
    return [...EXAMES_PLANILHA_OFICIAL, ...extraExams];
  }, [summary]);

  const marginPct =
    summary.totalValor > 0
      ? ((summary.totalLiquido / summary.totalValor) * 100).toFixed(1)
      : '0.0';

  const patientSuggestions = useMemo(() => {
    const map = new Map<string, ExamRecordDoc>();
    for (const r of records) {
      const k = r.pacienteNome.trim().toUpperCase();
      if (k && !map.has(k)) map.set(k, r);
    }
    return Array.from(map.values()).slice(0, 30);
  }, [records]);

  const toggleObsDelivered = async (rec: ExamRecordDoc) => {
    const isDelivered =
      (rec.observacoes || '').toLowerCase().trim() === 'entregue';
    const nextObs = isDelivered ? 'a ser entregue' : 'Entregue';
    await handleUpdateExam(rec.id, {
      seqNumber: rec.seqNumber,
      pedidoEmed: rec.pedidoEmed,
      pacienteNome: rec.pacienteNome,
      dataRealizado: rec.dataRealizado,
      convenio: rec.convenio,
      unidadeIndicadora: rec.unidadeIndicadora,
      medicoOpto: rec.medicoOpto,
      repasseValor: rec.repasseValor,
      valorExame: rec.valorExame,
      exameTipo: rec.exameTipo,
      observacoes: nextObs,
    });
  };

  /**
   * Validação de senha do Painel Administrativo usando hash SHA-256
   * sem expor ou inserir a senha em texto puro no código-fonte.
   */
  const handleVerifyClinicPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCandidate = clinicPinInput.trim();
    if (!rawCandidate || verifyingPin) return;

    setVerifyingPin(true);
    setClinicPinError(null);

    try {
      let authorized = false;

      // 1. Verifica no servidor via endpoint seguro
      try {
        const res = await fetch('/api/auth/verify-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: rawCandidate }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) authorized = true;
        }
      } catch {
        // Fallback para verificação criptográfica SHA-256 local
      }

      // 2. Fallback criptográfico SHA-256 via Web Crypto API
      if (!authorized) {
        const exactDigest = await computeSha256Hex(rawCandidate);
        const lowerDigest = await computeSha256Hex(rawCandidate.toLowerCase());
        if (
          exactDigest === ADMIN_AUTH_DIGEST_HEX ||
          lowerDigest === ADMIN_AUTH_DIGEST_HEX
        ) {
          authorized = true;
        }
      }

      if (authorized) {
        try {
          sessionStorage.setItem(SESSION_ADMIN_AUTH_KEY, '1');
        } catch {
          // ignore
        }
        setIsPublicPatientOnlyMode(false);
        setShowClinicUnlockModal(false);
        setClinicPinInput('');
        setClinicPinError(null);
        setActivePage(1);
      } else {
        setClinicPinError(
          'Credencial administrativa inválida. Verifique a senha informada.'
        );
      }
    } finally {
      setVerifyingPin(false);
    }
  };

  return (
    <div className="bg-slate-100 text-slate-800 antialiased min-h-screen flex flex-col font-sans selection:bg-oftalmo-600 selection:text-white w-full max-w-full overflow-x-hidden">
      {/* CABEÇALHO LIMPO EM 3 ZONAS (MARCA | NAVEGAÇÃO | AÇÃO PRINCIPAL) */}
      <header className="bg-gradient-to-r from-oftalmo-950 via-oftalmo-800 to-oftalmo-900 text-white sticky top-0 z-30 shadow-sm border-b border-oftalmo-700/50 no-print w-full max-w-full">
        <div className="w-full max-w-full mx-auto px-3 sm:px-5 lg:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4 lg:gap-6 min-w-0">
          {/* Zona 1: Marca OftalmoMed */}
          <div className="flex items-center shrink-0">
            <img
              src="/assets/aistudio/oftalmomed-logo_set25_branco_verde_7db96e29.png"
              alt="OftalmoMed"
              className="h-7 sm:h-8 w-auto object-contain cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setActivePage(1)}
            />
          </div>

          {/* Zona 2: Navegação Principal (Visível em telas xl+ no Painel Administrativo) */}
          {!isPublicPatientOnlyMode && (
            <nav className="hidden xl:flex items-center gap-3 2xl:gap-5 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setActivePage(1)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  activePage === 1
                    ? 'border-verde-400 text-white font-bold'
                    : 'border-transparent text-oftalmo-200 hover:text-white'
                }`}
              >
                Planilha & Produção
              </button>
              <button
                type="button"
                onClick={() => setActivePage(2)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  activePage === 2
                    ? 'border-verde-400 text-white font-bold'
                    : 'border-transparent text-oftalmo-200 hover:text-white'
                }`}
              >
                Entrega de Exames
              </button>
              <button
                type="button"
                onClick={() => setActivePage(3)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  activePage === 3
                    ? 'border-verde-400 text-white font-bold'
                    : 'border-transparent text-oftalmo-200 hover:text-white'
                }`}
              >
                Relatórios Internos
              </button>
              <button
                type="button"
                onClick={() => setActivePage(4)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 flex items-center gap-1.5 ${
                  activePage === 4
                    ? 'border-verde-400 text-white font-bold'
                    : 'border-transparent text-oftalmo-200 hover:text-white'
                }`}
              >
                <Target className="w-3.5 h-3.5 text-verde-400" />
                <span>Projeção Meta Mensal</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPricingModal(true)}
                className="py-1 text-oftalmo-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Tabela de Valores
              </button>
              <button
                type="button"
                onClick={() => setShowMotivationalModal(true)}
                className="py-1 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 text-xs shadow-xs"
                title="Abrir mensagem motivadora para atingir a meta"
              >
                <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Meta do Mês</span>
              </button>
            </nav>
          )}

          {/* Zona 3: Ação Principal */}
          <div className="flex items-center gap-2 shrink-0">
            {!isPublicPatientOnlyMode ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(adminSiteUrl);
                    setCopiedAdminUrl(true);
                    setTimeout(() => setCopiedAdminUrl(false), 3000);
                    showToast(
                      `URL do Site Administrativo copiada: ${OFFICIAL_ADMIN_SITE_DOMAIN}`
                    );
                  }}
                  title={`Copiar URL do Site Administrativo: ${adminSiteUrl}`}
                  className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-oftalmo-100 bg-white/10 hover:bg-white/20 border border-white/15 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedAdminUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-verde-400" />
                      <span>{OFFICIAL_ADMIN_SITE_DOMAIN}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-verde-400" />
                      <span>{OFFICIAL_ADMIN_SITE_DOMAIN}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(publicPortalUrl);
                    setCopiedPublicUrl(true);
                    setTimeout(() => setCopiedPublicUrl(false), 3000);
                    showToast(
                      `URL do Portal do Paciente copiada: ${OFFICIAL_PATIENT_PORTAL_DOMAIN}`
                    );
                  }}
                  title={`Copiar URL do Portal do Paciente: ${publicPortalUrl}`}
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedPublicUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-verde-400" />
                      <span>{OFFICIAL_PATIENT_PORTAL_DOMAIN}</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-verde-400" />
                      <span>{OFFICIAL_PATIENT_PORTAL_DOMAIN}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPublicPatientOnlyMode(true);
                    setActivePage(2);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-oftalmo-950 bg-verde-400 hover:bg-verde-500 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Portal do Paciente</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-verde-300 bg-white/10 border border-white/15">
                  {OFFICIAL_PATIENT_PORTAL_DOMAIN}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowClinicUnlockModal(true);
                    setClinicPinError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Lock className="w-3.5 h-3.5 text-verde-400" />
                  <span>Painel Administrativo</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navegação secundária compacta para telas menores que xl */}
        {!isPublicPatientOnlyMode && (
          <div className="flex xl:hidden items-center overflow-x-auto border-t border-white/10 px-3 py-1.5 bg-oftalmo-950/80 text-xs gap-1.5 no-scrollbar w-full max-w-full">
            <button
              type="button"
              onClick={() => setActivePage(1)}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                activePage === 1
                  ? 'bg-white text-oftalmo-950 font-bold shadow-xs'
                  : 'text-oftalmo-200 hover:text-white'
              }`}
            >
              Planilha
            </button>
            <button
              type="button"
              onClick={() => setActivePage(2)}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                activePage === 2
                  ? 'bg-white text-oftalmo-950 font-bold shadow-xs'
                  : 'text-oftalmo-200 hover:text-white'
              }`}
            >
              Entrega de Exames
            </button>
            <button
              type="button"
              onClick={() => setActivePage(3)}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                activePage === 3
                  ? 'bg-white text-oftalmo-950 font-bold shadow-xs'
                  : 'text-oftalmo-200 hover:text-white'
              }`}
            >
              Relatórios
            </button>
            <button
              type="button"
              onClick={() => setActivePage(4)}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                activePage === 4
                  ? 'bg-white text-oftalmo-950 font-bold shadow-xs'
                  : 'text-oftalmo-200 hover:text-white'
              }`}
            >
              <Target className="w-3 h-3 text-verde-400" />
              Projeção Meta
            </button>
            <button
              type="button"
              onClick={() => setShowPricingModal(true)}
              className="px-2.5 py-1 rounded-md text-oftalmo-200 hover:text-white whitespace-nowrap shrink-0 transition-colors"
            >
              Valores
            </button>
            <button
              type="button"
              onClick={() => setShowMotivationalModal(true)}
              className="px-2.5 py-1 rounded-md text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 whitespace-nowrap shrink-0 flex items-center gap-1 font-bold text-xs border border-emerald-500/30 shadow-2xs"
              title="Abrir mensagem motivadora"
            >
              <Flame className="w-3 h-3 text-emerald-400" />
              <span>Meta</span>
            </button>
          </div>
        )}
      </header>

      {/* NOTIFICAÇÃO DE SALVAMENTO AUTOMÁTICO */}
      {syncToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-oftalmo-950 text-white px-4 py-2.5 rounded-xl shadow-xl border border-verde-500/40 flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-verde-400 shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* =====================================================================
          PÁGINA 1 (PAINEL ADMINISTRATIVO): PLANILHA DE PRODUÇÃO E LANÇAMENTOS
      ===================================================================== */}
      {!isPublicPatientOnlyMode && activePage === 1 && (
        <main className="flex-1 w-full max-w-full mx-auto px-3 sm:px-5 py-4 space-y-4 min-w-0 overflow-x-hidden">
          {/* 1. INDICADORES DE PRODUÇÃO */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Faturamento Bruto Exames
                </span>
                <DollarSign className="w-4 h-4 text-oftalmo-700" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                  {formatCurrencyBRL(summary.totalValor)}
                </h3>
                <span className="text-xs text-slate-600 font-medium tabular-nums">
                  {summary.totalExames} exames
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Repasse de Realização (Exames)
                </span>
                <Building2 className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                  {formatCurrencyBRL(summary.totalRepasse)}
                </h3>
                <span className="text-xs text-amber-800 font-medium">
                  3% Part. · 10% Conv.
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Atendimentos por Modalidade
                </span>
                <UserCheck className="w-4 h-4 text-sky-600" />
              </div>
              <div className="mt-2 flex items-center justify-between tabular-nums text-xs text-slate-600">
                <span>
                  <strong className="text-slate-900 font-bold">
                    {summary.countSaoMiguel}
                  </strong>{' '}
                  São Miguel
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="text-slate-900 font-bold">
                    {summary.countParticular}
                  </strong>{' '}
                  Particular
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="text-slate-900 font-bold">
                    {summary.countPartAto}
                  </strong>{' '}
                  Part/Ato
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Resultado Líquido OftalmoMed
                </span>
                <Wallet className="w-4 h-4 text-verde-700" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <h3 className="text-lg sm:text-xl font-bold text-verde-700 tabular-nums">
                  {formatCurrencyBRL(summary.totalLiquido)}
                </h3>
                <span className="text-xs font-medium text-slate-600 tabular-nums">
                  Margem {marginPct}%
                </span>
              </div>
            </div>
          </section>

          {/* 2. PAINEL ÚNICO E LIMPO DE CADASTRO DE EXAMES (ENVIO AUTOMÁTICO PARA A PLANILHA) */}
          <section className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Lançar Exame — Linha Nº {nextSeqNumber}
                </h2>
                <p className="text-xs text-slate-500">
                  Sincronizado automaticamente com a planilha da clínica.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setLaunchMode('single');
                      setFormWarning(null);
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                      launchMode === 'single'
                        ? 'bg-oftalmo-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Individual (1 Exame)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLaunchMode('multi');
                      setFormWarning(null);
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                      launchMode === 'multi'
                        ? 'bg-oftalmo-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Multi-Exames ({selectedMultiExams.length})
                  </button>
                </div>
              </div>
            </div>

            {missingFieldsAlert && (
              <div
                className={`mb-3 p-3.5 rounded-xl border-2 flex items-start justify-between gap-3 shadow-md ${
                  missingFieldsAlert.type === 'error'
                    ? 'bg-rose-50 border-rose-500 text-rose-950 animate-alert-blink'
                    : 'bg-amber-50 border-amber-500 text-amber-950 animate-amber-blink'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative shrink-0 mt-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <AlertCircle
                      className={`relative w-5 h-5 animate-fast-blink ${
                        missingFieldsAlert.type === 'error'
                          ? 'text-rose-600'
                          : 'text-amber-600'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                        Campos Pendentes
                      </span>
                    </div>
                    <h4 className="text-xs font-bold mt-1">
                      {missingFieldsAlert.title}
                    </h4>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {missingFieldsAlert.missing.map((f) => (
                        <span
                          key={f}
                          className={`px-2 py-0.5 text-[11px] font-bold rounded-md flex items-center gap-1 ${
                            missingFieldsAlert.type === 'error'
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
                  onClick={() => setMissingFieldsAlert(null)}
                  className="p-1 hover:bg-black/5 rounded cursor-pointer"
                  title="Fechar Alerta"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {formWarning && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between text-xs text-amber-900 font-semibold">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  {formWarning}
                </span>
                <button
                  type="button"
                  onClick={() => setFormWarning(null)}
                  className="text-amber-800 hover:underline ml-3 text-xs font-bold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            )}

            {autoFillBanner && (
              <div className="mb-3 px-3 py-1.5 bg-oftalmo-50 border border-oftalmo-200 rounded-lg flex items-center justify-between text-xs text-oftalmo-900 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-oftalmo-700 shrink-0" />
                  {autoFillBanner}
                </span>
                <button
                  type="button"
                  onClick={() => setAutoFillBanner(null)}
                  className="text-oftalmo-700 hover:underline ml-3 text-xs font-bold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            )}

            <datalist id="pacientes-sugestoes">
              {patientSuggestions.map((p) => (
                <option key={p.id} value={p.pacienteNome}>
                  {p.convenio} · Pedido #{p.pedidoEmed}
                </option>
              ))}
            </datalist>
            <datalist id="medicos-sugestoes">
              {MEDICOS_OPTO_PADRAO.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>

            {/* MODO 1: LANÇAMENTO INDIVIDUAL */}
            {launchMode === 'single' && (
              <form onSubmit={handleSingleSubmit} className="space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2.5 items-end">
                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Pedido eMed
                    </label>
                    <input
                      type="text"
                      maxLength={VALIDATION_LIMITS.PEDIDO_EMED_MAX}
                      placeholder="Nº Pedido"
                      value={pedidoEmed}
                      onChange={(e) => {
                        setPedidoEmed(e.target.value);
                        setFormWarning(null);
                        handleLookupHistory(e.target.value, pacienteNome);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs tabular-nums font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-3 lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nome do Paciente *
                    </label>
                    <input
                      ref={pacienteInputRef}
                      type="text"
                      list="pacientes-sugestoes"
                      maxLength={VALIDATION_LIMITS.PACIENTE_NOME_MAX}
                      placeholder="NOME COMPLETO DO PACIENTE"
                      value={pacienteNome}
                      onChange={(e) => {
                        setPacienteNome(e.target.value.toUpperCase());
                        setFormWarning(null);
                        handleLookupHistory(pedidoEmed, e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600 uppercase"
                    />
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Data
                    </label>
                    <input
                      type="date"
                      value={dataRealizado}
                      onChange={(e) => setDataRealizado(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs tabular-nums font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600"
                    />
                  </div>

                  <div className="lg:col-span-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Convênio
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setNewConvenioInput('');
                          setShowNewConvenioModal(true);
                        }}
                        className="text-[10px] font-bold text-oftalmo-700 hover:text-oftalmo-900 hover:underline flex items-center gap-0.5 cursor-pointer"
                        title="Cadastrar Novo Convênio"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        Novo
                      </button>
                    </div>
                    <select
                      value={convenio}
                      onChange={(e) => {
                        if (e.target.value === '__NEW_CONVENIO__') {
                          setNewConvenioInput('');
                          setShowNewConvenioModal(true);
                          return;
                        }
                        setConvenio(e.target.value);
                      }}
                      className="w-full px-2 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600"
                    >
                      {conveniosDisponiveis.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__NEW_CONVENIO__">
                        + Cadastrar Novo Convênio...
                      </option>
                    </select>
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Unidade Ind.
                    </label>
                    <select
                      value={unidadeIndicadora}
                      onChange={(e) => setUnidadeIndicadora(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600"
                    >
                      {unidadesDisponiveis.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Médico/Opto
                    </label>
                    <input
                      type="text"
                      list="medicos-sugestoes"
                      value={medicoOpto}
                      onChange={(e) =>
                        setMedicoOpto(e.target.value.toUpperCase())
                      }
                      className="w-full px-2 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600 uppercase"
                    />
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Exame *
                    </label>
                    <select
                      value={exameTipo}
                      onChange={(e) => setExameTipo(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-bold text-oftalmo-900 bg-oftalmo-50 border border-oftalmo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600"
                    >
                      {examesDisponiveis.map((ex) => (
                        <option key={ex} value={ex}>
                          {ex}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                      Repasse (
                      {getReceptionRepasseRate(convenio) === 0.03 ? '3%' : '10%'})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={repasseValor}
                      onChange={(e) =>
                        setRepasseValor(parseFloat(e.target.value) || 0)
                      }
                      className="w-full px-2 py-1.5 text-xs tabular-nums font-bold text-right text-amber-950 bg-amber-50/60 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600"
                    />
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={valorExame}
                      onChange={(e) => {
                        const newVal = parseFloat(e.target.value) || 0;
                        setValorExame(newVal);
                        setRepasseValor(
                          calculateReceptionRepasse(newVal, convenio)
                        );
                      }}
                      className="w-full px-2 py-1.5 text-xs tabular-nums font-semibold text-right text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-oftalmo-600"
                    />
                  </div>

                  <div className="lg:col-span-1">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-1.5 px-3 bg-verde-600 hover:bg-verde-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{submitting ? '...' : 'Incluir'}</span>
                    </button>
                  </div>
                </div>

                {isCustomPriceModifiedInBar && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-oftalmo-50/90 border border-oftalmo-200 rounded-lg text-xs">
                    <span className="text-oftalmo-900 font-medium">
                      Valor de{' '}
                      <strong>
                        {exameTipo} ({convenio})
                      </strong>{' '}
                      ajustado para <strong>{formatCurrencyBRL(valorExame)}</strong>{' '}
                      (Repasse de Realização:{' '}
                      <strong>{formatCurrencyBRL(repasseValor)}</strong>).
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveCustomPrice(
                          convenio,
                          exameTipo,
                          valorExame,
                          repasseValor
                        )
                      }
                      className="px-2.5 py-1 bg-oftalmo-800 hover:bg-oftalmo-700 text-white font-semibold rounded-md flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3 h-3 text-verde-400" />
                      <span>Fixar como Valor Padrão</span>
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* MODO 2: MULTI-EXAMES POR PACIENTE */}
            {launchMode === 'multi' && (
              <form onSubmit={handleMultiSubmit} className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2.5 items-end">
                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Pedido eMed
                    </label>
                    <input
                      type="text"
                      placeholder="Nº Pedido"
                      value={pedidoEmed}
                      onChange={(e) => {
                        setPedidoEmed(e.target.value);
                        handleLookupHistory(e.target.value, pacienteNome);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs tabular-nums font-semibold border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="col-span-2 lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nome do Paciente *
                    </label>
                    <input
                      type="text"
                      list="pacientes-sugestoes"
                      placeholder="NOME DO PACIENTE..."
                      value={pacienteNome}
                      onChange={(e) => {
                        setPacienteNome(e.target.value.toUpperCase());
                        setFormWarning(null);
                        handleLookupHistory(pedidoEmed, e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg uppercase"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Data Realizado
                    </label>
                    <input
                      type="date"
                      value={dataRealizado}
                      onChange={(e) => setDataRealizado(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs tabular-nums border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Convênio
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setNewConvenioInput('');
                          setShowNewConvenioModal(true);
                        }}
                        className="text-[10px] font-bold text-oftalmo-700 hover:text-oftalmo-900 hover:underline flex items-center gap-0.5 cursor-pointer"
                        title="Cadastrar Novo Convênio"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        Novo Convênio
                      </button>
                    </div>
                    <select
                      value={convenio}
                      onChange={(e) => {
                        if (e.target.value === '__NEW_CONVENIO__') {
                          setNewConvenioInput('');
                          setShowNewConvenioModal(true);
                          return;
                        }
                        setConvenio(e.target.value);
                      }}
                      className="w-full px-2 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                    >
                      {conveniosDisponiveis.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__NEW_CONVENIO__">
                        + Cadastrar Novo Convênio...
                      </option>
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Unidade Indicadora
                    </label>
                    <select
                      value={unidadeIndicadora}
                      onChange={(e) => setUnidadeIndicadora(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white"
                    >
                      {unidadesDisponiveis.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Médico / Opto
                    </label>
                    <input
                      type="text"
                      list="medicos-sugestoes"
                      value={medicoOpto}
                      onChange={(e) =>
                        setMedicoOpto(e.target.value.toUpperCase())
                      }
                      className="w-full px-2 py-1.5 text-xs font-medium border border-slate-300 rounded-lg uppercase"
                    />
                  </div>
                </div>

                {/* Seleção Rápida de Kits e Exames */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 mr-1">
                    Protocolos Rápidos:
                  </span>
                  {KITS_DIAGNOSTICOS.map((kit) => (
                    <button
                      key={kit.id}
                      type="button"
                      onClick={() => setSelectedMultiExams([...kit.exames])}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-oftalmo-50 text-oftalmo-900 border border-oftalmo-200 hover:bg-oftalmo-100 transition cursor-pointer"
                    >
                      {kit.nome}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {examesDisponiveis.map((ex) => {
                      const active = selectedMultiExams.includes(ex);
                      const price = resolveAutoPrice(
                        convenio,
                        ex,
                        pricingRules
                      );
                      return (
                        <button
                          key={ex}
                          type="button"
                          onClick={() =>
                            setSelectedMultiExams((prev) =>
                              prev.includes(ex)
                                ? prev.filter((item) => item !== ex)
                                : [...prev, ex]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                            active
                              ? 'bg-oftalmo-800 text-white border-oftalmo-900 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {active && (
                            <Check className="w-3 h-3 text-verde-400" />
                          )}
                          <span>{ex}</span>
                          <span
                            className={`text-[10px] tabular-nums ${
                              active ? 'text-verde-300' : 'text-slate-400'
                            }`}
                          >
                            ({formatCurrencyBRL(price.valorExame)})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || selectedMultiExams.length === 0}
                    className="py-2 px-4 bg-verde-600 hover:bg-verde-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      + Incluir {selectedMultiExams.length} Linhas (Nº{' '}
                      {nextSeqNumber} a{' '}
                      {nextSeqNumber +
                        Math.max(0, selectedMultiExams.length - 1)}
                      )
                    </span>
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* 3. GRADE PRINCIPAL: TABELA DE PRODUÇÃO (10 COLUNAS) + RESUMO POR EXAME (2 COLUNAS) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start w-full max-w-full min-w-0">
            <div className="xl:col-span-10 bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden min-w-0 max-w-full">
              <div className="p-3 bg-slate-50/90 border-b border-slate-200 space-y-2.5">
                {/* Linha 1: Busca e Filtros Gerais */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Buscar paciente, pedido, médico ou exame..."
                        className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-oftalmo-500"
                      />
                    </div>

                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-2 py-1 font-medium"
                    >
                      <option value="">Todos os Meses</option>
                      {MONTHS_LIST.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filterConvenio}
                      onChange={(e) => setFilterConvenio(e.target.value)}
                      className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-2 py-1 font-medium"
                    >
                      <option value="">Todos Convênios</option>
                      {conveniosDisponiveis.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filterUnit}
                      onChange={(e) => setFilterUnit(e.target.value)}
                      className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-2 py-1 font-medium"
                    >
                      <option value="">Todas Unidades</option>
                      {unidadesDisponiveis.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>

                    {(filterDatePreset !== 'all' ||
                      filterDate ||
                      filterMonth ||
                      filterConvenio ||
                      filterUnit ||
                      filterExame ||
                      filterIncompleteOnly ||
                      searchInput) && (
                      <button
                        type="button"
                        onClick={() => {
                          clearAllTableFilters();
                          setFilterIncompleteOnly(false);
                        }}
                        className="px-2 py-1 text-xs font-semibold text-oftalmo-800 bg-oftalmo-50 hover:bg-oftalmo-100 rounded-lg flex items-center gap-1 cursor-pointer"
                        title="Limpar todos os filtros da tabela"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Limpar Filtros
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        triggerDownloadSpreadsheetCSV(
                          records,
                          'CENTRO DIAGNOSTICO - SAO MATEUS 1 - 2026.csv'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Exportar CSV</span>
                    </button>
                  </div>
                </div>

                {/* Linha 2: FILTRO POR DATA (Hoje, Ontem, 7 Dias, Data Específica) */}
                <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-slate-700 flex items-center gap-1 mr-1">
                      <Calendar className="w-3.5 h-3.5 text-oftalmo-700" />
                      <span>Filtrar por Data:</span>
                    </span>

                    {/* Botão de Destaque: Só o que produziu hoje */}
                    <button
                      type="button"
                      onClick={() => {
                        if (filterDatePreset === 'today') {
                          setFilterDatePreset('all');
                          setFilterDate('');
                        } else {
                          setFilterDatePreset('today');
                          setFilterDate(todayISO);
                        }
                      }}
                      className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                        filterDatePreset === 'today'
                          ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/60'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}
                      title={`Filtrar apenas exames produzidos hoje (${formatDateBR(todayISO)})`}
                    >
                      <span className="relative flex h-2 w-2">
                        {filterDatePreset === 'today' && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${
                            filterDatePreset === 'today' ? 'bg-white' : 'bg-emerald-600'
                          }`}
                        ></span>
                      </span>
                      <span>⚡ Só o que produziu hoje</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                          filterDatePreset === 'today'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-emerald-200/80 text-emerald-950'
                        }`}
                      >
                        {countProducedToday}
                      </span>
                    </button>

                    {/* Botão Ontem */}
                    <button
                      type="button"
                      onClick={() => {
                        if (filterDatePreset === 'yesterday') {
                          setFilterDatePreset('all');
                          setFilterDate('');
                        } else {
                          setFilterDatePreset('yesterday');
                          setFilterDate(yesterdayISO);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        filterDatePreset === 'yesterday'
                          ? 'bg-oftalmo-800 text-white font-bold ring-2 ring-oftalmo-400/60'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      <span>Ontem</span>
                      {countProducedYesterday > 0 && (
                        <span className="ml-1 text-[10px] opacity-80">
                          ({countProducedYesterday})
                        </span>
                      )}
                    </button>

                    {/* Botão Últimos 7 dias */}
                    <button
                      type="button"
                      onClick={() => {
                        if (filterDatePreset === 'last7') {
                          setFilterDatePreset('all');
                          setFilterDate('');
                        } else {
                          setFilterDatePreset('last7');
                          setFilterDate('');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        filterDatePreset === 'last7'
                          ? 'bg-oftalmo-800 text-white font-bold ring-2 ring-oftalmo-400/60'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      Últimos 7 dias
                    </button>

                    {/* Botão Todos os Dias */}
                    {filterDatePreset !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterDatePreset('all');
                          setFilterDate('');
                        }}
                        className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 bg-slate-200/70 hover:bg-slate-200 font-semibold cursor-pointer"
                      >
                        Todos os dias
                      </button>
                    )}
                  </div>

                  {/* Seletor de Data Específica */}
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-0.5">
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Outra data:
                    </span>
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilterDate(val);
                        setFilterDatePreset(val ? 'custom' : 'all');
                      }}
                      className="bg-transparent text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
                    />
                    {filterDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterDate('');
                          setFilterDatePreset('all');
                        }}
                        className="text-slate-400 hover:text-slate-700 font-bold ml-0.5 cursor-pointer"
                        title="Limpar data específica"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner Ativo de Data Selecionada */}
                {filterDatePreset !== 'all' && (
                  <div
                    className={`px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs font-semibold border ${
                      filterDatePreset === 'today'
                        ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                        : 'bg-blue-50 text-blue-950 border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>
                        Produção:{' '}
                        <strong>
                          {filterDatePreset === 'today'
                            ? `Hoje (${formatDateBR(todayISO)})`
                            : filterDatePreset === 'yesterday'
                            ? `Ontem (${formatDateBR(yesterdayISO)})`
                            : filterDatePreset === 'last7'
                            ? `Últimos 7 dias`
                            : formatDateBR(filterDate)}
                        </strong>{' '}
                        · <strong>{filteredRecords.length}</strong> exame(s)
                        {filteredRecords.length > 0 && (
                          <>
                            {' '}· Bruto: <strong>{formatCurrencyBRL(summary.totalValor)}</strong>
                            {' '}· Repasse: <strong className="text-amber-900">{formatCurrencyBRL(summary.totalRepasse)}</strong>
                          </>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterDatePreset('all');
                        setFilterDate('');
                      }}
                      className="text-xs underline font-bold hover:opacity-80 cursor-pointer"
                    >
                      Limpar filtro
                    </button>
                  </div>
                )}
              </div>

              {incompleteRecordsCount > 0 && (
                <div className="mx-4 mb-3 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-xs animate-amber-blink">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-600"></span>
                    </span>
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 animate-fast-blink" />
                    <span>
                      <strong>{incompleteRecordsCount}</strong> exame(s) com dados pendentes.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterIncompleteOnly((prev) => !prev)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      filterIncompleteOnly
                        ? 'bg-amber-700 text-white border-amber-800 shadow-xs'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {filterIncompleteOnly ? 'Mostrar Todos' : 'Ver Pendências'}
                  </button>
                </div>
              )}

              <div className="overflow-x-auto w-full max-w-full custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-oftalmo-900 text-white border-b border-oftalmo-800 text-[11px] font-bold uppercase tracking-tight">
                      <th className="py-2 px-1.5 border-r border-oftalmo-800 w-9 text-center">
                        Nº
                      </th>
                      <th className="py-2 px-2 border-r border-oftalmo-800 w-20">
                        PEDIDO
                      </th>
                      <th className="py-2 px-2.5 border-r border-oftalmo-800">
                        NOME PACIENTE
                      </th>
                      <th className="py-2 px-1.5 border-r border-oftalmo-800 w-22 text-center">
                        DATA
                      </th>
                      <th className="py-2 px-2 border-r border-oftalmo-800 w-24">
                        CONVÊNIO
                      </th>
                      <th className="py-2 px-2 border-r border-oftalmo-800 w-28">
                        UNIDADE IND.
                      </th>
                      <th className="py-2 px-2 border-r border-oftalmo-800 w-28">
                        MÉDICO/OPTO
                      </th>
                      <th className="py-2 px-2 border-r border-oftalmo-800 w-24 text-right bg-amber-900/40">
                        REPASSE REALIZ.
                      </th>
                      <th className="py-2 px-2 border-r border-oftalmo-800 w-24 text-right">
                        VALOR EXAME
                      </th>
                      <th className="py-2 px-2 border-r border-oftalmo-800 w-28">
                        EXAMES
                      </th>
                      <th className="py-2 px-1.5 border-r border-oftalmo-800 w-24 text-center">
                        STATUS
                      </th>
                      <th className="py-2 px-1.5 w-32 text-center no-print">
                        AÇÕES
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center bg-slate-50/50">
                          <div className="max-w-md mx-auto space-y-2.5">
                            <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                            <h4 className="text-sm font-bold text-slate-800">
                              {filterDatePreset === 'today'
                                ? `Nenhum exame lançado para hoje (${formatDateBR(todayISO)}) ainda.`
                                : filterDatePreset === 'yesterday'
                                ? `Nenhum exame encontrado para ontem (${formatDateBR(yesterdayISO)}).`
                                : filterDate
                                ? `Nenhum exame encontrado para a data ${formatDateBR(filterDate)}.`
                                : 'Nenhum exame encontrado com os filtros selecionados.'}
                            </h4>
                            <p className="text-xs text-slate-500">
                              {filterDatePreset === 'today'
                                ? 'Novos exames incluídos no formulário acima aparecerão automaticamente aqui com a produção do dia.'
                                : 'Altere ou limpe os filtros de data para visualizar todos os exames lançados.'}
                            </p>
                            <div className="flex items-center justify-center gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  clearAllTableFilters();
                                  setFilterIncompleteOnly(false);
                                }}
                                className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer shadow-xs"
                              >
                                Limpar Filtros de Data
                              </button>
                              {filterDatePreset === 'today' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDataRealizado(todayISO);
                                    pacienteInputRef.current?.focus();
                                  }}
                                  className="px-3.5 py-1.5 bg-verde-600 hover:bg-verde-500 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-xs"
                                >
                                  + Lançar Exame Hoje
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((row) => {
                      const isEditing = editingRowId === row.id;
                      const isRecentlyAdded = lastAddedIds.includes(row.id);
                      const hasDelivery =
                        deliveryByRecordKey.has(row.id) ||
                        deliveryByRecordKey.has(
                          `seq_${row.seqNumber}_${row.exameTipo.trim().toUpperCase()}`
                        );

                      if (isEditing && editDraft) {
                        return (
                          <tr key={row.id} className="bg-oftalmo-50/70">
                            <td className="py-1.5 px-1 border-r border-slate-200 text-center font-bold tabular-nums">
                              {row.seqNumber}
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <input
                                type="text"
                                value={editDraft.pedidoEmed}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    pedidoEmed: e.target.value,
                                  })
                                }
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs tabular-nums"
                              />
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <input
                                type="text"
                                value={editDraft.pacienteNome}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    pacienteNome: e.target.value.toUpperCase(),
                                  })
                                }
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-semibold uppercase"
                              />
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <input
                                type="date"
                                value={editDraft.dataRealizado}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    dataRealizado: e.target.value,
                                  })
                                }
                                className="w-full px-1 py-1 bg-white border border-slate-300 rounded text-xs tabular-nums"
                              />
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
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
                                className="w-full px-1 py-1 bg-white border border-slate-300 rounded text-xs"
                              >
                                {conveniosDisponiveis.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <select
                                value={editDraft.unidadeIndicadora}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    unidadeIndicadora: e.target.value,
                                  })
                                }
                                className="w-full px-1 py-1 bg-white border border-slate-300 rounded text-xs"
                              >
                                {unidadesDisponiveis.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <input
                                type="text"
                                list="medicos-sugestoes"
                                value={editDraft.medicoOpto}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    medicoOpto: e.target.value.toUpperCase(),
                                  })
                                }
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs uppercase"
                              />
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={editDraft.repasseValor}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    repasseValor:
                                      parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-full px-1.5 py-1 bg-amber-50 border border-amber-300 rounded text-xs tabular-nums text-right font-bold"
                              />
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={editDraft.valorExame}
                                onChange={(e) => {
                                  const nextVal =
                                    parseFloat(e.target.value) || 0;
                                  setEditDraft({
                                    ...editDraft,
                                    valorExame: nextVal,
                                    repasseValor: calculateReceptionRepasse(
                                      nextVal,
                                      editDraft.convenio
                                    ),
                                  });
                                }}
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs tabular-nums text-right"
                              />
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
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
                                className="w-full px-1 py-1 bg-white border border-slate-300 rounded font-semibold text-xs"
                              >
                                {examesDisponiveis.map((ex) => (
                                  <option key={ex} value={ex}>
                                    {ex}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 px-1 border-r border-slate-200">
                              <input
                                type="text"
                                value={editDraft.observacoes || ''}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    observacoes: e.target.value,
                                  })
                                }
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await handleUpdateExam(row.id, editDraft);
                                    setEditingRowId(null);
                                    setEditDraft(null);
                                  }}
                                  className="p-1 bg-verde-600 text-white rounded hover:bg-verde-500 cursor-pointer"
                                  title="Salvar"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRowId(null);
                                    setEditDraft(null);
                                  }}
                                  className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const isDelivered =
                        (row.observacoes || '').toLowerCase().trim() ===
                        'entregue';

                      return (
                        <tr
                          key={row.id}
                          onDoubleClick={() => {
                            setEditingRowId(row.id);
                            setEditDraft({
                              seqNumber: row.seqNumber,
                              pedidoEmed: row.pedidoEmed,
                              pacienteNome: row.pacienteNome,
                              dataRealizado: row.dataRealizado,
                              convenio: row.convenio,
                              unidadeIndicadora: row.unidadeIndicadora,
                              medicoOpto: row.medicoOpto,
                              repasseValor: row.repasseValor,
                              valorExame: row.valorExame,
                              exameTipo: row.exameTipo,
                              observacoes: row.observacoes,
                            });
                          }}
                          className={`transition ${
                            isRecentlyAdded
                              ? 'bg-verde-50/90'
                              : 'hover:bg-oftalmo-50/40'
                          }`}
                          title="Duplo clique para editar na linha"
                        >
                          <td className="py-1.5 px-1.5 border-r border-slate-200 tabular-nums text-center text-slate-600 font-semibold">
                            {row.seqNumber}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 tabular-nums text-slate-800 font-medium">
                            {row.pedidoEmed || '—'}
                          </td>
                          <td className="py-1.5 px-2.5 border-r border-slate-200 font-semibold text-slate-900">
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
                          <td className="py-1.5 px-1.5 border-r border-slate-200 tabular-nums text-center text-slate-700">
                            {formatDateBR(row.dataRealizado)}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 font-semibold text-slate-700 whitespace-nowrap">
                            {row.convenio}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 font-medium text-slate-700 whitespace-nowrap">
                            {row.unidadeIndicadora}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 font-medium text-slate-700 whitespace-nowrap">
                            {row.medicoOpto}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 tabular-nums text-right font-semibold text-amber-900 whitespace-nowrap">
                            {formatCurrencyBRL(row.repasseValor)}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 tabular-nums text-right font-semibold text-slate-900 whitespace-nowrap">
                            {formatCurrencyBRL(row.valorExame)}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 font-bold text-oftalmo-900 whitespace-nowrap">
                            {row.exameTipo}
                          </td>
                          <td className="py-1.5 px-1.5 border-r border-slate-200 text-center">
                            <button
                              type="button"
                              onClick={() => toggleObsDelivered(row)}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer whitespace-nowrap ${
                                isDelivered
                                  ? 'bg-verde-50 text-verde-800 border-verde-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                              title="Clique para alternar entre 'a ser entregue' e 'Entregue'"
                            >
                              {row.observacoes || 'a ser entregue'}
                            </button>
                          </td>
                          <td className="py-1.5 px-1.5 text-center no-print">
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setPreselectedExamForPortal(row);
                                  setActivePage(2);
                                }}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 transition cursor-pointer ${
                                  hasDelivery
                                    ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300'
                                    : 'bg-oftalmo-50 text-oftalmo-800 hover:bg-oftalmo-100 border border-oftalmo-200'
                                }`}
                                title="Anexar Exame e Liberar Login/Senha do Paciente"
                              >
                                <KeyRound className="w-3 h-3" />
                                <span>{hasDelivery ? 'Senha' : 'Anexar'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyPatientToBar(row)}
                                className="p-1 text-slate-500 hover:text-verde-700 hover:bg-verde-50 rounded transition cursor-pointer"
                                title="Adicionar mais exames para este paciente (Multi-Exames)"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRowId(row.id);
                                  setEditDraft({
                                    seqNumber: row.seqNumber,
                                    pedidoEmed: row.pedidoEmed,
                                    pacienteNome: row.pacienteNome,
                                    dataRealizado: row.dataRealizado,
                                    convenio: row.convenio,
                                    unidadeIndicadora: row.unidadeIndicadora,
                                    medicoOpto: row.medicoOpto,
                                    repasseValor: row.repasseValor,
                                    valorExame: row.valorExame,
                                    exameTipo: row.exameTipo,
                                    observacoes: row.observacoes,
                                  });
                                }}
                                className="p-1 text-slate-500 hover:text-oftalmo-800 hover:bg-oftalmo-50 rounded transition cursor-pointer"
                                title="Editar linha"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setBreakdownRecord(row)}
                                className="p-1 text-slate-500 hover:text-oftalmo-800 hover:bg-oftalmo-50 rounded transition cursor-pointer"
                                title="Ver detalhes do cálculo"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExam(row.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                title="Apagar exame"
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
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-xs">
                        <td
                          colSpan={7}
                          className="py-2 px-2.5 text-right text-slate-700"
                        >
                          TOTAL ({filteredRecords.length} exames):
                        </td>
                        <td className="py-2 px-2 tabular-nums text-right text-amber-900">
                          {formatCurrencyBRL(summary.totalRepasse)}
                        </td>
                        <td className="py-2 px-2 tabular-nums text-right text-slate-950">
                          {formatCurrencyBRL(summary.totalValor)}
                        </td>
                        <td colSpan={3} className="py-2 px-2.5 text-verde-700">
                          Líquido: {formatCurrencyBRL(summary.totalLiquido)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* PAINEL LATERAL CONSOLIDADO: CONTAGEM POR EXAMES */}
            <aside className="xl:col-span-2 min-w-0 max-w-full">
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="bg-oftalmo-900 text-white py-2 px-3 text-center text-xs font-bold tracking-wider uppercase border-b border-oftalmo-800">
                  Resumo por Exame
                </div>
                <table className="w-full text-xs border-collapse">
                  <tbody className="divide-y divide-slate-200">
                    {sidebarExamEntries.map((ex) => {
                      const countVal = summary.examCounts[ex] || 0;
                      const isFiltered = filterExame === ex;
                      return (
                        <tr
                          key={ex}
                          onClick={() => setFilterExame(isFiltered ? '' : ex)}
                          className={`cursor-pointer transition ${
                            isFiltered
                              ? 'bg-oftalmo-100/80 font-bold'
                              : 'hover:bg-slate-50'
                          }`}
                          title="Clique para filtrar por este exame"
                        >
                          <td className="py-1.5 px-2.5 font-medium text-slate-700 border-r border-slate-200 truncate">
                            {ex}
                          </td>
                          <td
                            className={`py-1.5 px-2.5 tabular-nums text-right font-bold w-12 ${
                              countVal > 0
                                ? 'text-oftalmo-900 bg-oftalmo-50/50'
                                : 'text-slate-400'
                            }`}
                          >
                            {countVal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-oftalmo-950 text-white font-bold text-xs">
                      <td className="py-2 px-2.5 text-center border-r border-oftalmo-800">
                        TOTAL
                      </td>
                      <td className="py-2 px-2.5 tabular-nums text-right text-sm text-verde-400">
                        {summary.totalExames}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* =====================================================================
          PÁGINA 2: ANEXAR EXAMES & PORTAL DE RESULTADOS DE EXAMES DO PACIENTE
      ===================================================================== */}
      {(isPublicPatientOnlyMode || activePage === 2) && (
        <main className="flex-1 w-full max-w-full mx-auto px-3 sm:px-5 py-4 min-w-0 overflow-x-hidden">
          <PatientExamPortalView
            records={records}
            deliveries={deliveries}
            isPublicPatientOnlyMode={isPublicPatientOnlyMode}
            onTogglePublicMode={(pub) => {
              setIsPublicPatientOnlyMode(pub);
              if (pub) setActivePage(2);
            }}
            onSaveDelivery={handleSaveDelivery}
            onDeleteDelivery={handleDeleteDelivery}
            onPatientDownloadedExam={handlePatientDownloadedExam}
            preselectedExamRecord={preselectedExamForPortal}
            onClearPreselectedExam={() => setPreselectedExamForPortal(null)}
          />
        </main>
      )}

      {/* =====================================================================
          PÁGINA 3 (PAINEL ADMINISTRATIVO): RELATÓRIOS MENSAIS
      ===================================================================== */}
      {!isPublicPatientOnlyMode && activePage === 3 && (
        <main className="flex-1 w-full max-w-full mx-auto px-3 sm:px-5 py-4 min-w-0 overflow-x-hidden">
          <MonthlyReportsView records={records} />
        </main>
      )}

      {/* =====================================================================
          PÁGINA 4 (PAINEL ADMINISTRATIVO): PROJEÇÃO META MENSAL
      ===================================================================== */}
      {!isPublicPatientOnlyMode && activePage === 4 && (
        <main className="flex-1 w-full max-w-full mx-auto px-3 sm:px-5 py-4 min-w-0 overflow-x-hidden">
          <MonthlyGoalProjectionView
            records={records}
            onNavigateToSpreadsheet={() => setActivePage(1)}
          />
        </main>
      )}

      {/* MODAL DE AUTENTICAÇÃO DO PAINEL ADMINISTRATIVO */}
      {showClinicUnlockModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-oftalmo-800" />
                <h3 className="text-sm font-bold text-slate-900">
                  Acesso ao Painel Administrativo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowClinicUnlockModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Área restrita para gestão interna, lançamento de exames e
              relatórios da Clínica OftalmoMed.
            </p>
            <form onSubmit={handleVerifyClinicPin} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Senha Administrativa
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={clinicPinInput}
                  onChange={(e) => setClinicPinInput(e.target.value)}
                  placeholder="Digite a senha de acesso"
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:outline-none focus:border-oftalmo-700"
                />
              </div>
              {clinicPinError && (
                <p className="text-xs font-semibold text-red-600">
                  {clinicPinError}
                </p>
              )}
              <button
                type="submit"
                disabled={verifyingPin}
                className="w-full py-2.5 bg-oftalmo-800 hover:bg-oftalmo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                {verifyingPin ? 'Verificando...' : 'Acessar Painel Interno'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TABELA DE VALORES ORIGINAIS DE CADA EXAME POR CONVÊNIO */}
      {showPricingModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="px-5 py-3.5 bg-gradient-to-r from-oftalmo-950 via-oftalmo-800 to-oftalmo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Settings2 className="w-5 h-5 text-verde-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    Tabela de Valores por Convênio & Repasse de Realização
                  </h3>
                  <p className="text-[11px] text-oftalmo-200">
                    Regra Oficial de Realização: <strong>Particular = 3%</strong> e{' '}
                    <strong>Convênios = 10%</strong> sobre o valor do exame
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPricingModal(false)}
                className="p-1 text-oftalmo-200 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2.5 bg-amber-50 border border-amber-300 rounded-xl p-3">
                <div className="text-xs font-semibold text-amber-950">
                  <strong>Repasse de Realização:</strong> Ao ajustar o valor de um
                  exame, o repasse de realização é calculado automaticamente em{' '}
                  <strong>3% para Particular/Part-Ato</strong> e{' '}
                  <strong>10% para Convênios</strong>.
                </div>
                <button
                  type="button"
                  onClick={handleRecalculateAllReceptionRepasses}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition cursor-pointer shrink-0"
                >
                  Recalcular Repasses dos Exames Lançados
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 font-bold uppercase text-slate-700">
                        <th className="py-2 px-3 text-left border-r border-slate-200">
                          Exame
                        </th>
                        <th
                          colSpan={2}
                          className="py-2 px-2 text-center bg-emerald-50 text-emerald-900 border-r border-slate-200"
                        >
                          São Miguel Saúde (Valor / Repasse 10%)
                        </th>
                        <th
                          colSpan={2}
                          className="py-2 px-2 text-center bg-amber-50 text-amber-900 border-r border-slate-200"
                        >
                          Particular (Valor / Repasse 3%)
                        </th>
                        <th
                          colSpan={2}
                          className="py-2 px-2 text-center bg-sky-50 text-sky-900"
                        >
                          Part/Ato (Valor / Repasse 3%)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {examesDisponiveis.map((ex) => {
                        const sm = resolveAutoPrice(
                          'SÃO MIGUEL',
                          ex,
                          pricingRules
                        );
                        const part = resolveAutoPrice(
                          'PARTICULAR',
                          ex,
                          pricingRules
                        );
                        const ato = resolveAutoPrice(
                          'PART/ATO',
                          ex,
                          pricingRules
                        );

                        return (
                          <tr key={ex} className="hover:bg-slate-50/80">
                            <td className="py-1.5 px-3 font-bold text-slate-900 border-r border-slate-200">
                              {ex}
                            </td>
                            <td className="py-1 px-2 bg-emerald-50/20">
                              <input
                                type="number"
                                step="0.01"
                                value={sm.valorExame}
                                onChange={(e) => {
                                  const nextVal =
                                    parseFloat(e.target.value) || 0;
                                  handleSaveCustomPrice(
                                    'SÃO MIGUEL',
                                    ex,
                                    nextVal,
                                    calculateReceptionRepasse(
                                      nextVal,
                                      'SÃO MIGUEL'
                                    )
                                  );
                                }}
                                className="w-22 px-2 py-1 text-right tabular-nums font-semibold bg-white border border-slate-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1 px-2 bg-emerald-50/20 border-r border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={sm.repasseValor}
                                onChange={(e) =>
                                  handleSaveCustomPrice(
                                    'SÃO MIGUEL',
                                    ex,
                                    sm.valorExame,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-18 px-2 py-1 text-right tabular-nums text-slate-700 bg-white border border-slate-300 rounded text-xs"
                              />
                            </td>

                            <td className="py-1 px-2 bg-amber-50/20">
                              <input
                                type="number"
                                step="0.01"
                                value={part.valorExame}
                                onChange={(e) => {
                                  const nextVal =
                                    parseFloat(e.target.value) || 0;
                                  handleSaveCustomPrice(
                                    'PARTICULAR',
                                    ex,
                                    nextVal,
                                    calculateReceptionRepasse(
                                      nextVal,
                                      'PARTICULAR'
                                    )
                                  );
                                }}
                                className="w-22 px-2 py-1 text-right tabular-nums font-semibold bg-white border border-slate-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1 px-2 bg-amber-50/20 border-r border-slate-200">
                              <input
                                type="number"
                                step="0.01"
                                value={part.repasseValor}
                                onChange={(e) =>
                                  handleSaveCustomPrice(
                                    'PARTICULAR',
                                    ex,
                                    part.valorExame,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-18 px-2 py-1 text-right tabular-nums text-slate-700 bg-white border border-slate-300 rounded text-xs"
                              />
                            </td>

                            <td className="py-1 px-2 bg-sky-50/20">
                              <input
                                type="number"
                                step="0.01"
                                value={ato.valorExame}
                                onChange={(e) => {
                                  const nextVal =
                                    parseFloat(e.target.value) || 0;
                                  handleSaveCustomPrice(
                                    'PART/ATO',
                                    ex,
                                    nextVal,
                                    calculateReceptionRepasse(
                                      nextVal,
                                      'PART/ATO'
                                    )
                                  );
                                }}
                                className="w-22 px-2 py-1 text-right tabular-nums font-semibold bg-white border border-slate-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1 px-2 bg-sky-50/20">
                              <input
                                type="number"
                                step="0.01"
                                value={ato.repasseValor}
                                onChange={(e) =>
                                  handleSaveCustomPrice(
                                    'PART/ATO',
                                    ex,
                                    ato.valorExame,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-18 px-2 py-1 text-right tabular-nums text-slate-700 bg-white border border-slate-300 rounded text-xs"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-oftalmo-50/70 border border-oftalmo-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-oftalmo-950">
                      Cadastrar Novo Convênio
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Adicione novos convênios para que apareçam imediatamente na
                      planilha de lançamentos e nos filtros.
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={handleRegisterNewConvenio}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={60}
                    value={newConvenioInput}
                    onChange={(e) =>
                      setNewConvenioInput(e.target.value.toUpperCase())
                    }
                    placeholder="Ex: UNIMED, PORTO SEGURO, PREVENT SENIOR..."
                    className="flex-1 min-w-[220px] px-3 py-1.5 bg-white border border-oftalmo-300 rounded-lg text-xs font-bold text-slate-900 uppercase focus:outline-none focus:border-oftalmo-700"
                  />
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-verde-600 hover:bg-verde-500 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Cadastrar Convênio
                  </button>
                </form>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-700">
                  Definir Valor para Outros Convênios
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Convênio
                    </label>
                    <select
                      value={customConvSelect}
                      onChange={(e) => {
                        if (e.target.value === '__NEW_CONVENIO__') {
                          setNewConvenioInput('');
                          setShowNewConvenioModal(true);
                          return;
                        }
                        setCustomConvSelect(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                    >
                      {conveniosDisponiveis.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__NEW_CONVENIO__">
                        + Cadastrar Novo Convênio...
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Exame
                    </label>
                    <select
                      value={customExamSelect}
                      onChange={(e) => setCustomExamSelect(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-oftalmo-900"
                    >
                      {examesDisponiveis.map((ex) => (
                        <option key={ex} value={ex}>
                          {ex}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Valor Original (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={customValorInput}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setCustomValorInput(v);
                        setCustomRepasseInput(
                          calculateReceptionRepasse(v, customConvSelect)
                        );
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs tabular-nums text-right font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Repasse de Realização (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={customRepasseInput}
                      onChange={(e) =>
                        setCustomRepasseInput(parseFloat(e.target.value) || 0)
                      }
                      className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs tabular-nums text-right font-bold text-amber-950"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveCustomPrice(
                          customConvSelect,
                          customExamSelect,
                          customValorInput,
                          customRepasseInput
                        )
                      }
                      className="w-full py-1.5 px-3 bg-oftalmo-800 hover:bg-oftalmo-700 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Save className="w-3.5 h-3.5 text-verde-400" />
                      Salvar Valor
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowPricingModal(false)}
                className="px-5 py-1.5 bg-oftalmo-900 hover:bg-oftalmo-800 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHE DO CÁLCULO POR EXAME */}
      {breakdownRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-oftalmo-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-verde-400">
                  Linha Nº {breakdownRecord.seqNumber} · Pedido #
                  {breakdownRecord.pedidoEmed || 'S/N'}
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  {breakdownRecord.pacienteNome}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBreakdownRecord(null)}
                className="p-1 text-oftalmo-200 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Exame Realizado:</span>
                <span className="font-bold text-oftalmo-900">
                  {breakdownRecord.exameTipo}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Convênio / Modalidade:</span>
                <span className="font-semibold text-slate-800">
                  {breakdownRecord.convenio}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">
                  Unidade Indicadora / Médico:
                </span>
                <span className="font-semibold text-slate-800">
                  {breakdownRecord.unidadeIndicadora} ·{' '}
                  {breakdownRecord.medicoOpto}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Valor Bruto do Exame:</span>
                <span className="tabular-nums font-bold text-slate-900">
                  {formatCurrencyBRL(breakdownRecord.valorExame)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-amber-900 font-bold">
                  Repasse de Realização (
                  {getReceptionRepasseRate(breakdownRecord.convenio) === 0.03
                    ? '3% Particular'
                    : '10% Convênio'}
                  ):
                </span>
                <span className="tabular-nums font-bold text-amber-800">
                  - {formatCurrencyBRL(breakdownRecord.repasseValor)}
                </span>
              </div>
              <div className="flex justify-between py-2.5 bg-verde-50 px-3 rounded-xl border border-verde-200">
                <span className="font-bold text-verde-900">
                  Resultado Líquido Clínica:
                </span>
                <span className="tabular-nums font-bold text-verde-700 text-sm">
                  {formatCurrencyBRL(
                    breakdownRecord.valorExame - breakdownRecord.repasseValor
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CADASTRAR NOVO CONVÊNIO */}
      {showNewConvenioModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-oftalmo-200">
            <div className="p-4 bg-oftalmo-950 text-white flex items-center justify-between border-b-2 border-verde-500">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-verde-400">
                  Cadastro Rápido
                </span>
                <h3 className="text-sm font-bold mt-0.5">
                  Cadastrar Novo Convênio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewConvenioModal(false)}
                className="p-1 text-oftalmo-200 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleRegisterNewConvenio}
              className="p-5 space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nome do Convênio *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={60}
                  value={newConvenioInput}
                  onChange={(e) =>
                    setNewConvenioInput(e.target.value.toUpperCase())
                  }
                  placeholder="Ex: UNIMED, PORTO SEGURO, PREVENT SENIOR..."
                  className="w-full px-3 py-2 text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 uppercase focus:bg-white focus:border-oftalmo-700 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  O novo convênio ficará salvo automaticamente para toda a
                  clínica e já será selecionado no lançamento atual.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewConvenioModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-verde-600 hover:bg-verde-500 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Salvar Convênio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL POP-UP MOTIVADOR DE META — EXIBIDO AO ABRIR O SISTEMA */}
      {showMotivationalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-emerald-400/40 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Topo com gradiente executivo */}
            <div className="relative bg-gradient-to-r from-oftalmo-950 via-oftalmo-900 to-emerald-950 text-white p-5 sm:p-6 border-b border-white/10">
              <button
                type="button"
                onClick={() => setShowMotivationalModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
                title="Fechar (Esc)"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center justify-between gap-3 mb-3 pr-8">
                <div className="flex items-center">
                  <img
                    src="/assets/aistudio/oftalmomed-logo_set25_branco_verde_7db96e29.png"
                    alt="OftalmoMed"
                    className="h-6 sm:h-7 w-auto object-contain"
                  />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-verde-500/20 text-verde-300 border border-verde-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                  <Flame className="w-3 h-3 text-verde-400 animate-pulse" />
                  Meta • São Mateus 1
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Rumo ao Topo da Meta!</span>
                <Target className="w-6 h-6 text-emerald-400" />
              </h2>
              <p className="text-xs text-oftalmo-200 mt-1">
                Centro Diagnóstico São Mateus 1
              </p>
            </div>

            {/* Conteúdo Motivador */}
            <div className="p-5 sm:p-6 space-y-4">
              {/* Mensagem Motivadora */}
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-oftalmo-50 p-4 rounded-2xl border border-emerald-200/90 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed italic">
                      "{MOTIVATIONAL_MESSAGES[motivationalMessageIndex]?.quote || 'Cada exame realizado transforma a visão e a vida de um paciente. Vamos juntos bater nossa meta com dedicação e excelência!'}"
                    </p>
                    <span className="block mt-2 text-[11px] font-bold text-emerald-800">
                      — {MOTIVATIONAL_MESSAGES[motivationalMessageIndex]?.author || 'Equipe OftalmoMed'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status da Meta */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-emerald-600" />
                    Meta {motivationalStats.monthName}: {formatCurrencyBRL(motivationalStats.targetGoal)}
                  </span>
                  <span
                    className={`font-black px-2 py-0.5 rounded-full text-xs ${
                      motivationalStats.isGoalBeaten
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                    }`}
                  >
                    {motivationalStats.pct.toFixed(1)}% atingido
                  </span>
                </div>

                {/* Barra de Progresso */}
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      motivationalStats.isGoalBeaten
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-400'
                        : 'bg-gradient-to-r from-oftalmo-800 via-emerald-600 to-emerald-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(5, motivationalStats.pct))}%`,
                    }}
                  />
                </div>

                {/* Métricas Resumidas */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">
                      Realizado no Mês
                    </span>
                    <span className="text-sm font-black text-slate-900 tabular-nums">
                      {formatCurrencyBRL(motivationalStats.monthBruto)}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">
                      {motivationalStats.isGoalBeaten ? 'Superavit' : 'Falta p/ Meta'}
                    </span>
                    <span
                      className={`text-sm font-black tabular-nums ${
                        motivationalStats.isGoalBeaten
                          ? 'text-emerald-700'
                          : 'text-amber-800'
                      }`}
                    >
                      {motivationalStats.isGoalBeaten
                        ? `+${formatCurrencyBRL(motivationalStats.surplus)}`
                        : formatCurrencyBRL(motivationalStats.remaining)}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 text-center font-medium">
                  {motivationalStats.isGoalBeaten
                    ? '🎉 Parabéns! A meta mensal já foi superada com sucesso!'
                    : `Restam ${motivationalStats.remainingProdDays} dias úteis (Seg a Sáb) de produção para alcançar o objetivo.`}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowMotivationalModal(false)}
                  className="w-full sm:flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Flame className="w-4 h-4 text-emerald-200" />
                  <span>🚀 Bora bater a meta!</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMotivationalModal(false);
                    setActivePage(4);
                  }}
                  className="w-full sm:w-auto py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Target className="w-4 h-4 text-emerald-600" />
                  <span>Ver Projeção</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RODAPÉ INSTITUCIONAL LIMPO */}
      <footer className="bg-white border-t border-slate-200/80 py-3 px-6 mt-auto no-print">
        <div className="w-full max-w-full mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div className="font-semibold text-slate-700">
            Clínica OftalmoMed — Centro Diagnóstico (Unidade São Mateus 1)
          </div>
          <div>
            Central de Atendimento: <strong className="text-slate-700 tabular-nums">(11) 2962-2437</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}
