import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const CONFIG_FILE_PATH = path.resolve(process.cwd(), '.gsheets-config.json');
const EXAM_FILES_DIR = path.resolve(process.cwd(), '.exam-attachments');

try {
  if (!fs.existsSync(EXAM_FILES_DIR)) {
    fs.mkdirSync(EXAM_FILES_DIR, { recursive: true });
  }
} catch {
  // ignore directory creation error
}

const DEFAULT_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbxLmPZVbJtzU4U8KwGIL6lMxq7zvsXAndCyl_N4lwAht-PPZQwiCZgTGN0w5q5GB79V8g/exec';

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1a8MJlzp9onhak7wcsm31G1ZLpuTSri5psPtqzgQoqso/edit?gid=0#gid=0';

// Hash SHA-256 da credencial administrativa configurada (sem expor a senha em texto puro no código-fonte)
const ADMIN_CREDENTIAL_SHA256 =
  process.env.ADMIN_PANEL_PASSWORD_HASH ||
  '17bb572600b1e2b629c219dc24fd8a78e4461bca28ba677891ae92f5bfbb233f';

// Catálogo oficial sincronizado com as Unidades e Exames OftalmoMed
const OFFICIAL_SHEET_CATALOG = {
  unidades: [
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
  ],
  convenios: [
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
  ],
  exames: [
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
  ],
};

interface ServerSheetsConfig {
  sheetUrl: string;
  webhookUrl: string;
  updatedAt: string;
}

function readSavedConfig(): ServerSheetsConfig {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        sheetUrl: parsed.sheetUrl || DEFAULT_SHEET_URL,
        webhookUrl: parsed.webhookUrl || DEFAULT_WEBHOOK_URL,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // ignore
  }
  return {
    sheetUrl: DEFAULT_SHEET_URL,
    webhookUrl: DEFAULT_WEBHOOK_URL,
    updatedAt: new Date().toISOString(),
  };
}

function writeSavedConfig(partial: Partial<ServerSheetsConfig>): ServerSheetsConfig {
  const current = readSavedConfig();
  const next: ServerSheetsConfig = {
    sheetUrl:
      partial.sheetUrl && partial.sheetUrl.includes('/spreadsheets/d/')
        ? partial.sheetUrl.trim()
        : current.sheetUrl.includes('/spreadsheets/d/')
        ? current.sheetUrl
        : DEFAULT_SHEET_URL,
    webhookUrl:
      partial.webhookUrl && partial.webhookUrl.includes('script.google.com')
        ? partial.webhookUrl.trim()
        : current.webhookUrl || DEFAULT_WEBHOOK_URL,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // ignore
  }
  return next;
}

function extractSheetIds(url: string): { spreadsheetId: string | null; gid: string } {
  if (!url) return { spreadsheetId: null, gid: '0' };
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
  return {
    spreadsheetId: idMatch ? idMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : '0',
  };
}

/**
 * Valida estritamente se o texto retornado pelo Google é de fato uma planilha CSV legítima
 * e NUNCA uma página HTML de login/cookies (<style nonce=...>, <script>, <div class="document-root">, etc.).
 */
function isValidSpreadsheetCsvText(text: string, contentType: string): boolean {
  if (!text) return false;
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml')) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.slice(0, 1500).toLowerCase();
  if (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.startsWith('<style') ||
    lower.startsWith('<script') ||
    lower.startsWith('<div') ||
    lower.includes('document-root') ||
    lower.includes('servicelogin') ||
    lower.includes('sign in to your google account') ||
    lower.includes('script function not found') ||
    lower.includes('<body')
  ) {
    return false;
  }

  // Deve conter cabeçalho esperado da planilha ou linhas de exames válidas
  const upper = trimmed.toUpperCase();
  const hasSpreadsheetMarkers =
    upper.includes('PEDIDO EMED') ||
    upper.includes('NOME PACIENTE') ||
    upper.includes('UNIDADE INDICADORA') ||
    upper.includes('TOPOGRAFIA') ||
    upper.includes('CAMPIMETRIA') ||
    upper.includes('RETINOGRAFIA') ||
    upper.includes('PAQUIMETRIA') ||
    upper.includes('SÃO MIGUEL') ||
    upper.includes('PARTICULAR');

  return hasSpreadsheetMarkers;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '250mb' }));

  // Armazenamento persistente de arquivos de exames (PDFs e Imagens sem limite de quantidade ou tamanho)
  app.post('/api/exam-files/upload', (req, res) => {
    try {
      const filesInput = Array.isArray(req.body?.files) ? req.body.files : [];
      const savedItems: Array<{
        id: string;
        name: string;
        mime: string;
        url: string;
      }> = [];

      for (const item of filesInput) {
        if (!item || typeof item.dataUrl !== 'string' || !item.dataUrl.trim()) {
          continue;
        }
        const safeName = String(item.name || 'Exame.pdf')
          .replace(/[^\w.\-() ]+/g, '_')
          .slice(0, 180);
        const safeMime = String(item.mime || 'application/pdf').slice(0, 100);
        const rawDataUrl = item.dataUrl.trim();

        // Se já for uma URL relativa /api/exam-files/ ou http externa, mantém
        if (
          rawDataUrl.startsWith('/api/exam-files/') ||
          rawDataUrl.startsWith('http://') ||
          rawDataUrl.startsWith('https://')
        ) {
          savedItems.push({
            id: safeName,
            name: safeName,
            mime: safeMime,
            url: rawDataUrl,
          });
          continue;
        }

        const hashId = crypto
          .createHash('sha1')
          .update(`${safeName}_${rawDataUrl.length}_${rawDataUrl.slice(0, 256)}_${rawDataUrl.slice(-256)}`)
          .digest('hex')
          .slice(0, 20);
        const fileId = `exf_${hashId}`;
        const filePath = path.join(EXAM_FILES_DIR, `${fileId}.json`);

        fs.writeFileSync(
          filePath,
          JSON.stringify({
            id: fileId,
            name: safeName,
            mime: safeMime,
            dataUrl: rawDataUrl,
            createdAt: new Date().toISOString(),
          }),
          'utf-8'
        );

        savedItems.push({
          id: fileId,
          name: safeName,
          mime: safeMime,
          url: `/api/exam-files/${fileId}`,
        });
      }

      return res.json({ ok: true, items: savedItems });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        reason: err instanceof Error ? err.message : 'UPLOAD_ERROR',
      });
    }
  });

  app.get('/api/exam-files/:fileId', (req, res) => {
    try {
      const rawId = String(req.params.fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!rawId) {
        return res.status(404).send('Arquivo não encontrado.');
      }
      const filePath = path.join(EXAM_FILES_DIR, `${rawId}.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Arquivo não encontrado.');
      }
      const rawJson = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(rawJson);
      const dataUrl = String(parsed.dataUrl || '');
      const fileName = String(parsed.name || 'Resultado_Exame.pdf').replace(/"/g, '');
      const fallbackMime = String(parsed.mime || 'application/pdf');

      const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/);
      if (match) {
        const mimeType = match[1] || fallbackMime;
        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader(
          'Content-Disposition',
          `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`
        );
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.send(buffer);
      }

      if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
        return res.redirect(dataUrl);
      }

      res.setHeader('Content-Type', fallbackMime);
      return res.send(dataUrl);
    } catch {
      return res.status(500).send('Erro ao carregar arquivo do exame.');
    }
  });

  // Verificação segura de senha administrativa via hash SHA-256 (sem expor a senha no código)
  app.post('/api/auth/verify-admin', (req, res) => {
    const rawPassword = String(req.body?.password || '').trim();
    if (!rawPassword) {
      return res.status(401).json({ ok: false });
    }
    const exactHash = crypto.createHash('sha256').update(rawPassword).digest('hex');
    const lowerHash = crypto
      .createHash('sha256')
      .update(rawPassword.toLowerCase())
      .digest('hex');

    const isValid =
      exactHash === ADMIN_CREDENTIAL_SHA256 ||
      lowerHash === ADMIN_CREDENTIAL_SHA256;

    if (isValid) {
      return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false });
  });

  app.get('/api/gsheets/config', (_req, res) => {
    res.json({
      ok: true,
      config: readSavedConfig(),
      catalog: OFFICIAL_SHEET_CATALOG,
    });
  });

  app.post('/api/gsheets/config', (req, res) => {
    const saved = writeSavedConfig(req.body || {});
    res.json({
      ok: true,
      config: saved,
      catalog: OFFICIAL_SHEET_CATALOG,
    });
  });

  // Busca automática de dados e catálogos (unidades, convênios, exames) da Planilha Google
  app.post('/api/gsheets/pull', async (req, res) => {
    try {
      const saved = writeSavedConfig(req.body || {});
      const candidateUrl = (req.body?.sheetUrl || saved.sheetUrl || DEFAULT_SHEET_URL).trim();
      const webhookUrl = (req.body?.webhookUrl || saved.webhookUrl || DEFAULT_WEBHOOK_URL).trim();

      const { spreadsheetId, gid } = extractSheetIds(candidateUrl);

      if (spreadsheetId) {
        const urlsToTry = [
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}&t=${Date.now()}`,
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
        ];

        for (const url of urlsToTry) {
          try {
            const response = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; OftalmomedSync/2.0)',
                Accept: 'text/csv,text/plain,*/*',
              },
              redirect: 'follow',
            });
            if (response.ok) {
              const contentType = response.headers.get('content-type') || '';
              const text = await response.text();
              if (isValidSpreadsheetCsvText(text, contentType)) {
                return res.json({
                  ok: true,
                  mode: 'csv',
                  csvText: text,
                  sheetUrl: saved.sheetUrl,
                  catalog: OFFICIAL_SHEET_CATALOG,
                });
              }
            }
          } catch {
            // try next
          }
        }
      }

      // Tentativa via Web App Google Apps Script (caso doGet esteja habilitado)
      if (webhookUrl && webhookUrl.includes('script.google.com')) {
        try {
          const sep = webhookUrl.includes('?') ? '&' : '?';
          const response = await fetch(`${webhookUrl}${sep}action=read&t=${Date.now()}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; OftalmomedSync/2.0)',
              Accept: 'application/json,text/csv,text/plain,*/*',
            },
            redirect: 'follow',
          });
          if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            const text = await response.text();
            if (
              text &&
              !text.includes('Script function not found: doGet') &&
              !text.trim().startsWith('<')
            ) {
              try {
                const json = JSON.parse(text);
                if (json && Array.isArray(json.rows)) {
                  return res.json({
                    ok: true,
                    mode: 'json_rows',
                    rows: json.rows,
                    unidades: Array.isArray(json.unidades)
                      ? json.unidades
                      : OFFICIAL_SHEET_CATALOG.unidades,
                    catalog: OFFICIAL_SHEET_CATALOG,
                    sheetUrl: saved.sheetUrl,
                  });
                }
              } catch {
                if (isValidSpreadsheetCsvText(text, contentType)) {
                  return res.json({
                    ok: true,
                    mode: 'csv',
                    csvText: text,
                    catalog: OFFICIAL_SHEET_CATALOG,
                    sheetUrl: saved.sheetUrl,
                  });
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }

      return res.json({
        ok: false,
        reason: 'NO_PUBLIC_READ_SOURCE',
        sheetUrl: saved.sheetUrl,
        catalog: OFFICIAL_SHEET_CATALOG,
      });
    } catch (err) {
      return res.json({
        ok: false,
        reason: err instanceof Error ? err.message : 'SYNC_ERROR',
        catalog: OFFICIAL_SHEET_CATALOG,
      });
    }
  });

  // Envio automático para a Planilha Google preservando a ordem exata das linhas existentes
  app.post('/api/gsheets/push', async (req, res) => {
    try {
      const saved = readSavedConfig();
      const targetWebhook = (
        req.body?.webhookUrl ||
        saved.webhookUrl ||
        DEFAULT_WEBHOOK_URL
      ).trim();
      const payload = req.body?.payload;

      if (!targetWebhook || !payload || !Array.isArray(payload.rows)) {
        return res.json({ ok: false, reason: 'MISSING_PAYLOAD' });
      }

      const response = await fetch(targetWebhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });

      const text = await response.text();
      const isOk = response.ok && text.includes('"ok":true');
      return res.json({
        ok: isOk,
        status: response.status,
        responsePreview: text.slice(0, 300),
      });
    } catch (err) {
      return res.json({
        ok: false,
        reason: err instanceof Error ? err.message : 'PUSH_ERROR',
      });
    }
  });

  // Garante que rotas amigáveis sirvam o SPA corretamente no Vite e em produção
  app.use((req, _res, next) => {
    const lowerPath = req.path.toLowerCase();
    if (
      lowerPath.includes('cdooftalmomedsaomateus1') ||
      lowerPath.includes('resultadoexamesoftalmomed') ||
      lowerPath === '/paciente' ||
      lowerPath === '/portal' ||
      lowerPath === '/portal-paciente' ||
      lowerPath === '/resultados' ||
      lowerPath === '/admin'
    ) {
      const queryPart = req.url.includes('?')
        ? req.url.slice(req.url.indexOf('?'))
        : '';
      if (
        lowerPath.includes('resultadoexamesoftalmomed') ||
        lowerPath === '/paciente' ||
        lowerPath === '/portal' ||
        lowerPath === '/portal-paciente' ||
        lowerPath === '/resultados'
      ) {
        req.url = `/?portal=paciente${queryPart ? '&' + queryPart.slice(1) : ''}`;
      } else {
        req.url = `/?modo=admin${queryPart ? '&' + queryPart.slice(1) : ''}`;
      }
    }
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
