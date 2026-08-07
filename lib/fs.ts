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
    move?(name: string): Promise<void>;
  }
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemHandle>;
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

export async function existingNames(
  dir: FileSystemDirectoryHandle
): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const handle of dir.values()) {
    names.add(handle.name.toLowerCase());
  }
  return names;
}

// Renomeia no lugar: move() quando o navegador suporta; senão copia e apaga.
export async function renameInFolder(
  dir: FileSystemDirectoryHandle,
  handle: FileSystemFileHandle,
  newName: string
): Promise<void> {
  if (typeof handle.move === "function") {
    await handle.move(newName);
    return;
  }
  const data = await handle.getFile();
  const oldName = handle.name;
  const target = await dir.getFileHandle(newName, { create: true });
  const writable = await target.createWritable();
  await writable.write(data);
  await writable.close();
  await dir.removeEntry(oldName);
}
