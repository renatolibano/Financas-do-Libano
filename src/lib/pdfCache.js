// Cache local de PDFs baixados do Supabase Storage.
//
// Por quê: cada abertura de um livro/PDF de estudo baixava o arquivo inteiro
// de novo do Storage, mesmo que nada tivesse mudado — isso é o que mais pesa
// no "Egress" do plano gratuito do Supabase. Aqui a gente guarda o PDF já
// baixado no próprio aparelho (via Cache Storage API, a mesma usada por
// Service Workers) e só baixa de novo quando o arquivo realmente mudou no
// servidor (comparando a data de modificação) ou quando ainda não existe
// cópia local.
//
// Isso é só uma otimização de rede: nunca é a única fonte de verdade — se o
// cache falhar ou o navegador não suportar, cai de volta pro download normal.

const CACHE_NAME = "libano-pdf-cache-v1";
const VERSION_HEADER = "x-libano-version";

async function getCacheStore() {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch (e) {
    console.warn("Cache de PDFs indisponível:", e);
    return null;
  }
}

// Chave sintética (não é uma URL real) só pra servir de identificador único
// dentro do Cache Storage.
function cacheKey(bucket, path) {
  return `https://libano-pdf-cache.local/${bucket}/${encodeURIComponent(path)}`;
}

/**
 * Baixa um arquivo com cache local.
 * - downloadFn(): faz o download de verdade (Blob) quando necessário.
 * - getMetaFn(): opcional — devolve algo que identifique a versão atual do
 *   arquivo no servidor (ex.: data de modificação). Se vier null/undefined,
 *   ou se getMetaFn não for informado, confia no cache local sem checar o
 *   servidor (prioriza economizar egress).
 */
export async function downloadPdfCached({ bucket, path, downloadFn, getMetaFn }) {
  const store = await getCacheStore();
  const key = cacheKey(bucket, path);

  let remoteVersion = null;
  if (getMetaFn) {
    try {
      remoteVersion = await getMetaFn();
    } catch (e) {
      // Sem conseguir checar a versão, segue com o cache que já existir.
      remoteVersion = null;
    }
  }

  if (store) {
    try {
      const cachedRes = await store.match(key);
      if (cachedRes) {
        const cachedVersion = cachedRes.headers.get(VERSION_HEADER);
        if (!remoteVersion || cachedVersion === remoteVersion) {
          return await cachedRes.blob();
        }
      }
    } catch (e) {
      console.warn("Falha ao ler PDF do cache:", e);
    }
  }

  const blob = await downloadFn();

  if (store) {
    try {
      const headers = new Headers({ "content-type": "application/pdf" });
      if (remoteVersion) headers.set(VERSION_HEADER, remoteVersion);
      await store.put(key, new Response(blob, { headers }));
    } catch (e) {
      console.warn("Não foi possível guardar o PDF em cache:", e);
    }
  }

  return blob;
}

/**
 * Só verifica se já existe uma cópia local válida — nunca baixa nada.
 * Usado pelos leitores que preferem abrir por streaming (Range requests) na
 * primeira vez, mas continuam usando a cópia local inteira (0 egress) se ela
 * já tiver sido baixada antes (ex.: pelo botão "Baixar para leitura offline").
 *
 * getMetaFn é opcional aqui de propósito: como isso roda toda vez que um PDF
 * é aberto, e sempre chega a acontecer bem antes de decidir por streaming,
 * evitamos gastar uma chamada de rede extra só pra validar a versão — se
 * o arquivo mudou desde o último "baixar offline", o dono vai perceber
 * poucas vezes (edição de PDF de estudo não se aplica a livros) e pode
 * baixar de novo manualmente.
 */
export async function peekPdfCache({ bucket, path }) {
  const store = await getCacheStore();
  if (!store) return null;
  try {
    const cachedRes = await store.match(cacheKey(bucket, path));
    if (!cachedRes) return null;
    return await cachedRes.blob();
  } catch (e) {
    console.warn("Falha ao ler PDF do cache:", e);
    return null;
  }
}

// Chamado depois de um re-upload (ex.: adicionar página a um PDF existente)
// pra garantir que essa mesma aba não continue servindo a versão antiga.
export async function invalidatePdfCache(bucket, path) {
  const store = await getCacheStore();
  if (!store) return;
  try {
    await store.delete(cacheKey(bucket, path));
  } catch (e) {
    console.warn("Não foi possível invalidar o cache do PDF:", e);
  }
}

// Apaga todos os PDFs guardados localmente (usado no botão de configurações).
// Não afeta nada na nuvem — só libera espaço neste aparelho; os PDFs voltam
// a ser baixados normalmente na próxima abertura.
export async function clearAllPdfCache() {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(CACHE_NAME);
  } catch (e) {
    console.warn("Não foi possível limpar o cache de PDFs:", e);
  }
}
