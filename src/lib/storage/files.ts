import { toast } from "sonner";

import { getTranslator } from "@/lib/i18n";
import { createId } from "@/lib/id";
import { getImporters } from "@/lib/registry";
import { downloadBlob, safeFilename } from "@/lib/storage/download";
import { pickFiles } from "@/lib/storage/images";
import { importFiles } from "@/lib/storage/importing";
import { createNewDocument, flushAutosave, readStoredDocument } from "@/lib/storage/persistence";
import {
    FILE_EXTENSION,
    FILE_MIME,
    isWispenFile,
    parseDocumentFile,
    serializeDocument,
} from "@/lib/storage/serialization";
import { documentStore, loadDocument } from "@/lib/stores/document";
import type { WispenDocument } from "@/types/scene";

interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
}

interface FilePickerOptions {
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    id?: string;
}

interface OpenFilePickerOptions extends FilePickerOptions {
    multiple?: boolean;
}

interface SaveFilePickerOptions extends FilePickerOptions {
    suggestedName?: string;
}

interface FileSystemAccessWindow {
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

interface HandlePermissionDescriptor {
    mode: "read" | "readwrite";
}

interface PermissionAwareHandle extends FileSystemFileHandle {
    queryPermission?: (descriptor: HandlePermissionDescriptor) => Promise<PermissionState>;
    requestPermission?: (descriptor: HandlePermissionDescriptor) => Promise<PermissionState>;
}

interface PickedFile {
    file: File;
    handle?: FileSystemFileHandle;
}

const PICKER_ID = "wispen";

const WISPEN_TYPE: FilePickerAcceptType = {
    description: "wispen",
    accept: { [FILE_MIME]: [`.${FILE_EXTENSION}`] },
};

// File each document was opened from or saved to, so saving again writes the same file.
const handles = new Map<string, FileSystemFileHandle>();

/**
 * Returns the File System Access entry points when the browser has them.
 *
 * @returns The window, typed with the optional picker functions
 */
function fileSystemAccess(): FileSystemAccessWindow {
    return window as Window & FileSystemAccessWindow;
}

/**
 * Tells whether an error means the user closed a picker or a permission prompt.
 *
 * @param error - Rejection reason of a picker, a permission request or a write
 * @returns true for an AbortError, which must stay silent
 */
function isAbort(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Lists the extensions and MIME types the open dialog accepts: .wispen and .json files plus
 * every format of the registered importers.
 *
 * @returns Unique accept tokens
 */
function acceptedTokens(): string[] {
    const tokens = [`.${FILE_EXTENSION}`, ".json", ...getImporters().flatMap((i) => i.accept)];
    return [...new Set(tokens)];
}

/**
 * Groups the accepted extensions by MIME type, the shape showOpenFilePicker expects.
 * Extensions declared without a MIME type fall under application/octet-stream.
 *
 * @returns One picker type covering every supported format
 */
function openPickerType(): FilePickerAcceptType {
    const accept: Record<string, string[]> = {
        [FILE_MIME]: [`.${FILE_EXTENSION}`],
        "application/json": [".json"],
    };
    for (const importer of getImporters()) {
        const extensions = importer.accept.filter((token) => token.startsWith("."));
        const mimes = importer.accept.filter((token) => token.includes("/"));
        const target = mimes[0] ?? "application/octet-stream";
        for (const mime of mimes) accept[mime] ??= [];
        accept[target] = [...new Set([...(accept[target] ?? []), ...extensions])];
    }
    return { description: getTranslator("documents")("supportedFiles"), accept };
}

/**
 * Writes text to a file handle, asking for write access first when the browser requires it.
 *
 * @param handle - File chosen by the user
 * @param text - Full file content
 * @throws NotAllowedError when write access is refused, AbortError when the prompt is closed
 */
async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
    const { queryPermission, requestPermission } = handle as PermissionAwareHandle;
    if (queryPermission && requestPermission) {
        const descriptor: HandlePermissionDescriptor = { mode: "readwrite" };
        const granted =
            (await queryPermission.call(handle, descriptor)) === "granted" ||
            (await requestPermission.call(handle, descriptor)) === "granted";
        if (!granted) throw new DOMException("Write access refused", "NotAllowedError");
    }
    const writable = await handle.createWritable();
    try {
        await writable.write(text);
        await writable.close();
    } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
    }
}

/**
 * Gives an opened file a new id when the local copy of the same document is more recent, so
 * opening an old export never overwrites newer local work.
 *
 * @param doc - Document parsed from a file
 * @returns The document as is, or a copy with a fresh id
 */
async function adoptDocument(doc: WispenDocument): Promise<WispenDocument> {
    const stored = await readStoredDocument(doc.id);
    return stored && stored.updatedAt > doc.updatedAt ? { ...doc, id: createId() } : doc;
}

/**
 * Reads the files behind picked or launched handles. A file moved, deleted or locked since it
 * was chosen is reported and skipped, so callers never reject.
 *
 * @param fileHandles - Handles from the open picker or the launch queue
 * @returns The readable files, each with its handle
 */
async function readHandles(fileHandles: readonly FileSystemFileHandle[]): Promise<PickedFile[]> {
    const picked: PickedFile[] = [];
    for (const handle of fileHandles) {
        try {
            picked.push({ file: await handle.getFile(), handle });
        } catch {
            toast.error(getTranslator("documents")("readError", { name: handle.name }));
        }
    }
    return picked;
}

/**
 * Opens picked files: .wispen files become the displayed document (the last one wins when
 * several are given), every other file goes through the importers.
 *
 * @param picked - Files with their handles when available
 */
async function openPicked(picked: PickedFile[]): Promise<void> {
    const t = getTranslator("documents");
    const others: File[] = [];

    for (const { file, handle } of picked) {
        try {
            if (!isWispenFile(await file.slice(0, 256).text())) {
                others.push(file);
                continue;
            }
            await flushAutosave();
            const doc = await adoptDocument(parseDocumentFile(await file.text()));
            loadDocument(doc);
            if (handle) handles.set(doc.id, handle);
            else handles.delete(doc.id);
            toast.success(t("opened", { name: doc.name }));
        } catch {
            toast.error(t("readError", { name: file.name }));
        }
    }

    if (others.length > 0) await importFiles(others);
}

/**
 * Downloads a document as a .wispen file, for browsers without the File System Access API
 * and for copies of documents that are not displayed.
 *
 * @param doc - Serialized as it is, without flushing the autosave; the file name comes from its
 *     sanitized name
 */
export function downloadDocument(doc: WispenDocument): void {
    const name = `${safeFilename(doc.name)}.${FILE_EXTENSION}`;
    downloadBlob(new Blob([serializeDocument(doc)], { type: FILE_MIME }), name);
    toast.success(getTranslator("documents")("downloaded", { name }));
}

/**
 * Starts a new empty document, saved locally like any other.
 */
export async function newDocument(): Promise<void> {
    await createNewDocument();
}

/**
 * Opens a .wispen file (or any importable file) from the disk. With the File System Access
 * API the file handle is remembered, so the next save writes back to the same file.
 */
export async function openFile(): Promise<void> {
    const { showOpenFilePicker } = fileSystemAccess();
    if (showOpenFilePicker) {
        let fileHandles: FileSystemFileHandle[] | null = null;
        try {
            fileHandles = await showOpenFilePicker.call(window, {
                id: PICKER_ID,
                types: [openPickerType()],
            });
        } catch (error) {
            if (isAbort(error)) return;
        }
        if (fileHandles) {
            await openPicked(await readHandles(fileHandles));
            return;
        }
    }

    const files = await pickFiles(acceptedTokens().join(","));
    await openPicked(files.map((file) => ({ file })));
}

/**
 * Saves the current document to a new .wispen file, always asking for the location, or
 * downloads it when the browser cannot write files.
 */
export async function saveFileAs(): Promise<void> {
    const t = getTranslator("documents");
    const { name } = documentStore.getState().document;
    const { showSaveFilePicker } = fileSystemAccess();

    if (showSaveFilePicker) {
        let handle: FileSystemFileHandle | null = null;
        try {
            handle = await showSaveFilePicker.call(window, {
                id: PICKER_ID,
                suggestedName: `${safeFilename(name)}.${FILE_EXTENSION}`,
                types: [WISPEN_TYPE],
            });
        } catch (error) {
            if (isAbort(error)) return;
        }
        if (handle) {
            // Written as it is once the picker closes, and remembered for that same document
            const doc = documentStore.getState().document;
            try {
                await writeHandle(handle, serializeDocument(doc));
                handles.set(doc.id, handle);
                toast.success(t("saved", { name: handle.name }));
            } catch (error) {
                if (!isAbort(error)) toast.error(t("saveError"));
            }
            return;
        }
    }

    downloadDocument(documentStore.getState().document);
}

/**
 * Saves the current document to a .wispen file on the disk: back to the file it was opened
 * from or last saved to when possible, else to a new location.
 */
export async function saveFile(): Promise<void> {
    const doc = documentStore.getState().document;
    const handle = handles.get(doc.id);
    if (handle) {
        try {
            await writeHandle(handle, serializeDocument(doc));
            toast.success(getTranslator("documents")("saved", { name: handle.name }));
            return;
        } catch (error) {
            if (isAbort(error)) return;
            handles.delete(doc.id);
        }
    }
    await saveFileAs();
}

/**
 * Opens the files the operating system launched the installed app with (file_handlers of the
 * manifest), keeping their handles so saving writes back to them.
 *
 * @param launched - Handles received from window.launchQueue; directories are ignored
 */
export async function openLaunchedFiles(launched: readonly FileSystemHandle[]): Promise<void> {
    const fileHandles = launched.filter(
        (handle): handle is FileSystemFileHandle => handle.kind === "file",
    );
    await openPicked(await readHandles(fileHandles));
}
