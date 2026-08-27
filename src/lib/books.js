import { supabase } from "./supabaseClient";
import { downloadPdfCached, invalidatePdfCache, peekPdfCache } from "./pdfCache";

const BUCKET = "books";

// Cada PDF fica guardado em uma pasta por usuário: <user_id>/<book_id>.pdf
// As políticas do bucket (em schema.sql) garantem que só o dono acessa.
export function bookFilePath(userId, bookId) {
  return `${userId}/${bookId}.pdf`;
}

export async function uploadBookFile(userId, bookId, file) {
  const path = bookFilePath(userId, bookId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
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
async function getBookFileMeta(path) {
  const idx = path.lastIndexOf("/");
  const folder = idx >= 0 ? path.slice(0, idx) : "";
  const filename = idx >= 0 ? path.slice(idx + 1) : path;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: filename, limit: 1 });
  if (error || !data || !data.length) return null;
  const info = data.find(f => f.name === filename) || data[0];
  return info?.updated_at || null;
}

export async function downloadBookFile(path) {
  return downloadPdfCached({
    bucket: BUCKET,
    path,
    downloadFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error) throw error;
      return data; // Blob
    },
    getMetaFn: () => getBookFileMeta(path),
  });
}

// Só olha se o livro já está baixado neste aparelho — nunca baixa nada.
// Usado pelo leitor pra decidir entre abrir a cópia local (0 egress) ou
// abrir por streaming (Range requests, ver getBookFileUrl).
export function peekCachedBookFile(path) {
  return peekPdfCache({ bucket: BUCKET, path });
}

// URL assinada e temporária pro arquivo — permite que o pdf.js abra o PDF
// direto por HTTP (com Range requests), baixando só as páginas visitadas em
// vez do arquivo inteiro. O bucket é privado (ver schema.sql), por isso
// precisa ser assinada; expira sozinha, então não tem problema gerar uma
// nova a cada abertura do leitor.
export async function getBookFileUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteBookFile(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
  await invalidatePdfCache(BUCKET, path);
}
