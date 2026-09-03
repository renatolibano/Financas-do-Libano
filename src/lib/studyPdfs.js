import { supabase } from "./supabaseClient";
import { downloadPdfCached, invalidatePdfCache } from "./pdfCache";
import { optimizePdfBlob } from "./pdfOptimize";
import { idbGet, idbSet } from "./idbStorage";

const BUCKET = "study_pdfs";
const OPTIMIZE_MARK_PREFIX = "pdf_optimize_checked:study_pdfs:";

// Cada PDF de estudo fica guardado em uma pasta por usuário: <user_id>/<pdf_id>.pdf
// As políticas do bucket (em schema.sql) garantem que só o dono acessa.
// Bucket separado do de "Livros" para manter as duas estantes independentes.
export function studyPdfFilePath(userId, pdfId) {
  return `${userId}/${pdfId}.pdf`;
}

export async function uploadStudyPdfFile(userId, pdfId, file) {
  const path = studyPdfFilePath(userId, pdfId);
  const optimized = await optimizePdfBlob(file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, optimized || file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  // O arquivo mudou de conteúdo — descarta a cópia local antiga pra não
  // servir a versão desatualizada nesta mesma sessão.
  await invalidatePdfCache(BUCKET, path);
  return path;
}

// Data de modificação do arquivo no Storage, usada só pra saber se o PDF em
// cache local ainda é válido (evita rebaixar o arquivo à toa).
async function getStudyPdfFileMeta(path) {
  const idx = path.lastIndexOf("/");
  const folder = idx >= 0 ? path.slice(0, idx) : "";
  const filename = idx >= 0 ? path.slice(idx + 1) : path;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: filename, limit: 1 });
  if (error || !data || !data.length) return null;
  const info = data.find(f => f.name === filename) || data[0];
  return info?.updated_at || null;
}

// Baixa um PDF de estudo já enviado, tenta otimizar e reenvia se valer a
// pena. Usado pela ação "Otimizar PDFs enviados" nas Configurações, pra
// aplicar o ganho também no que já estava no Storage antes dessa função existir.
//
// `list()` (metadata, quase de graça) é usado pra checar se esse arquivo já
// foi verificado antes e não mudou desde então — só nesse caso pula o
// download de verdade, que é o que conta como egress no Supabase. Assim,
// rodar essa ação de novo depois só gasta egress com PDFs novos ou que
// mudaram, não com a estante inteira outra vez.
export async function optimizeExistingStudyPdfFile(userId, pdfId) {
  const path = studyPdfFilePath(userId, pdfId);
  const markKey = OPTIMIZE_MARK_PREFIX + path;
  const meta = await getStudyPdfFileMeta(path);
  if (meta) {
    const lastChecked = await idbGet(markKey, null);
    if (lastChecked === meta) return { changed: false, savedBytes: 0, skipped: true };
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  const optimized = await optimizePdfBlob(data);
  if (!optimized) {
    if (meta) await idbSet(markKey, meta);
    return { changed: false, savedBytes: 0 };
  }
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, optimized, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw upErr;
  await invalidatePdfCache(BUCKET, path);
  const newMeta = await getStudyPdfFileMeta(path);
  if (newMeta) await idbSet(markKey, newMeta);
  return { changed: true, savedBytes: data.size - optimized.size };
}

export async function downloadStudyPdfFile(path) {
  return downloadPdfCached({
    bucket: BUCKET,
    path,
    downloadFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error) throw error;
      return data; // Blob
    },
    getMetaFn: () => getStudyPdfFileMeta(path),
  });
}

export async function deleteStudyPdfFile(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
  await invalidatePdfCache(BUCKET, path);
}

