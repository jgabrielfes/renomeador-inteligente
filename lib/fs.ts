// Modo pasta: usa a File System Access API (Chrome/Edge) para ler uma pasta
// local e renomear os arquivos no lugar, após confirmação do usuário.

export interface FolderEntry {
  file: File;
  handle: FileSystemFileHandle;
}

declare global {
  interface Window {
    showDirectoryPicker(options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemFileHandle {
    // O Chromium aceita as duas formas: renomear no lugar e mover para outra
    // pasta (opcionalmente com nome novo).
    move?(name: string): Promise<void>;
    move?(
      destination: FileSystemDirectoryHandle,
      name?: string
    ): Promise<void>;
  }
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemHandle>;
    queryPermission?(descriptor: {
      mode: "read" | "readwrite";
    }): Promise<PermissionState>;
    requestPermission?(descriptor: {
      mode: "read" | "readwrite";
    }): Promise<PermissionState>;
  }
  interface DataTransferItem {
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
  }
}

export function folderPickerAvailable(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// Devolve null se o usuário cancelar o seletor.
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

export async function listFolderFiles(
  dir: FileSystemDirectoryHandle,
  filter: (name: string) => boolean
): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = [];
  for await (const handle of dir.values()) {
    if (handle.kind !== "file" || !filter(handle.name)) continue;
    const fileHandle = handle as FileSystemFileHandle;
    entries.push({ file: await fileHandle.getFile(), handle: fileHandle });
  }
  entries.sort((a, b) =>
    a.file.name.toLowerCase().localeCompare(b.file.name.toLowerCase())
  );
  return entries;
}

// Chromium: quando o drop é UMA pasta, devolve o handle dela — o que permite
// renomear no lugar, igual ao "Selecionar pasta". Precisa ser chamado de forma
// SÍNCRONA dentro do evento de drop (DataTransferItem morre após um await).
export function directoryHandleFromDrop(
  dt: DataTransfer
): Promise<FileSystemDirectoryHandle | null> | null {
  const items = Array.from(dt.items).filter((item) => item.kind === "file");
  if (items.length !== 1) return null;
  const getHandle = items[0].getAsFileSystemHandle?.bind(items[0]);
  if (!getHandle) return null;
  return getHandle().then((handle) =>
    handle?.kind === "directory" ? (handle as FileSystemDirectoryHandle) : null
  );
}

// Handles de pasta arrastada chegam só com leitura; escrita exige pedir
// permissão (o prompt do navegador aparece uma vez).
export async function ensureWritePermission(
  dir: FileSystemDirectoryHandle
): Promise<boolean> {
  if (!dir.requestPermission) return true;
  if ((await dir.queryPermission?.({ mode: "readwrite" })) === "granted") {
    return true;
  }
  return (await dir.requestPermission({ mode: "readwrite" })) === "granted";
}

// Coleta recursivamente os arquivos de um drop (cobre pastas arrastadas em
// qualquer navegador, via webkitGetAsEntry). Também precisa ser chamado de
// forma síncrona no evento de drop.
export function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  const looseFiles: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) looseFiles.push(file);
    }
  }
  if (entries.length === 0 && looseFiles.length === 0) {
    return Promise.resolve(Array.from(dt.files));
  }

  async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject)
      );
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject)
        );
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, out);
      }
    }
  }

  return (async () => {
    const files = [...looseFiles];
    for (const entry of entries) await walk(entry, files);
    return files;
  })();
}

export async function existingNames(
  dir: FileSystemDirectoryHandle
): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const handle of dir.values()) {
    names.add(handle.name.toLowerCase());
  }
  return names;
}

// Sobrescreve o conteúdo de um arquivo da pasta, mantendo o nome. Usado para
// substituir o original pela versão otimizada — é destrutivo e sem desfazer,
// então quem chama deve confirmar com o usuário antes.
export async function overwriteFile(
  handle: FileSystemFileHandle,
  data: Blob
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } catch (err) {
    // Sem o abort, um erro no meio da escrita deixaria o arquivo truncado —
    // e o original do usuário já teria sido perdido.
    await writable.abort();
    throw err;
  }
  await writable.close();
}

/** Cria (ou substitui) um arquivo na pasta e devolve o handle. */
export async function writeNewFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: Blob
): Promise<FileSystemFileHandle> {
  const handle = await dir.getFileHandle(name, { create: true });
  await overwriteFile(handle, data);
  return handle;
}

export async function removeFile(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<void> {
  await dir.removeEntry(name);
}

/** Subpasta da pasta escolhida, criada se ainda não existir. */
export async function getSubfolder(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return dir.getDirectoryHandle(name, { create: true });
}

export async function namesIn(
  dir: FileSystemDirectoryHandle
): Promise<Set<string>> {
  return existingNames(dir);
}

// Renomeia no lugar: move() quando o navegador suporta; senão copia e apaga.
// Com `destination`, além de renomear, move o arquivo para a subpasta.
export async function renameInFolder(
  dir: FileSystemDirectoryHandle,
  handle: FileSystemFileHandle,
  newName: string,
  destination?: FileSystemDirectoryHandle
): Promise<void> {
  if (typeof handle.move === "function") {
    try {
      if (destination) await handle.move(destination, newName);
      else await handle.move(newName);
      return;
    } catch {
      // move() é recente e nem toda implementação aceita as duas formas —
      // principalmente a que muda o arquivo de pasta. Em vez de falhar a
      // operação inteira, cai para copiar+remover, que usa só APIs antigas e
      // produz o mesmo resultado (mais devagar). Não relança de propósito.
    }
  }
  // Sem move() (ou com move() recusado): copia para o destino e só então
  // remove a origem — se a cópia falhar, o arquivo original continua onde está.
  const data = await handle.getFile();
  const oldName = handle.name;
  const target = await (destination ?? dir).getFileHandle(newName, {
    create: true,
  });
  const writable = await target.createWritable();
  await writable.write(data);
  await writable.close();
  await dir.removeEntry(oldName);
}
