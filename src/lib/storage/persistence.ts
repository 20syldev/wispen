import { createStore, promisifyRequest, type UseStore } from "idb-keyval";
import { toast } from "sonner";

import { getTranslator } from "@/lib/i18n";
import { createId } from "@/lib/id";
import { normalizeDocument } from "@/lib/storage/serialization";
import { createDocument, documentStore, loadDocument, renameDocument } from "@/lib/stores/document";
import type { WispenDocument } from "@/types/scene";
import { STORAGE_KEYS } from "@/types/settings";

export interface DocumentEntry {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    pageCount: number;
    elementCount: number;
}

const DB_NAME = "wispen";

const STORE_NAME = "documents";

const INDEX_KEY = "index";

const DOC_PREFIX = "doc:";

const SAVE_DELAY = 400;

// A blocked or hanging IndexedDB must not keep the editor from showing up.
const RESTORE_TIMEOUT = 4000;

/**
 * Longest wait for one storage call before it counts as failed, in milliseconds.
 * A hanging IndexedDB never blocks the queue, and with it opening, creating or switching
 * documents.
 */
const STORAGE_TIMEOUT = 10000;

let database: UseStore | null = null;

let queue: Promise<unknown> = Promise.resolve();

let pending: WispenDocument | null = null;

let timer: ReturnType<typeof setTimeout> | undefined;

let saved: { id: string; updatedAt: number } | null = null;

let warned = false;

let rememberedId: string | null = null;

let restoring: Promise<void> | null = null;

/**
 * Rejects with a TimeoutError when a promise takes too long. The work itself goes on: IndexedDB
 * still runs late transactions in the order they were created.
 *
 * @param promise - Work to wait for; it is not cancelled when the delay expires
 * @param ms - Delay before giving up, in milliseconds
 * @returns The value of the promise, when it settles in time
 */
function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const expiry = setTimeout(
            () => reject(new DOMException("Storage timed out", "TimeoutError")),
            ms,
        );
        promise.then(resolve, reject).finally(() => clearTimeout(expiry));
    });
}

/**
 * Runs a callback on the documents object store, opening the database on first use.
 * Being async, it turns the synchronous ReferenceError thrown when IndexedDB does not exist into
 * a rejection, like every other storage failure, hanging calls included.
 *
 * @param mode - "readwrite" for writes, so IndexedDB serializes them with the other writes
 * @param callback - Receives the object store of a fresh transaction
 * @returns What the callback resolves to
 */
async function withStore<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => T | PromiseLike<T>,
): Promise<T> {
    database ??= createStore(DB_NAME, STORE_NAME);
    return deadline(database(mode, callback), STORAGE_TIMEOUT);
}

/**
 * Chains a storage task after the previous ones, so a rename or a deletion never interleaves
 * with an autosave of the same document. Tasks must not enqueue other tasks and wait for them.
 *
 * @param task - Storage work to run once the queue is idle
 * @returns The result of the task
 */
function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
}

/**
 * Builds the storage key of a document.
 *
 * @param id - Document id, prefixed so documents never collide with the index key
 * @returns The key holding the full document
 */
function docKey(id: string): string {
    return `${DOC_PREFIX}${id}`;
}

/**
 * Describes a document for the index.
 *
 * @param doc - Full document, whose pages are only counted
 * @returns Its entry, with page and element counts
 */
export function describeDocument(doc: WispenDocument): DocumentEntry {
    return {
        id: doc.id,
        name: doc.name,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        pageCount: doc.pages.length,
        elementCount: doc.pages.reduce((total, page) => total + page.elements.length, 0),
    };
}

/**
 * Keeps the readable entries of a raw index value.
 *
 * @param raw - Value stored under the index key
 * @returns The valid entries, or null when the index is missing or not a list
 */
function toEntries(raw: unknown): DocumentEntry[] | null {
    if (!Array.isArray(raw)) return null;
    return raw.filter(
        (entry): entry is DocumentEntry =>
            typeof entry === "object" &&
            entry !== null &&
            typeof entry.id === "string" &&
            typeof entry.name === "string" &&
            typeof entry.updatedAt === "number",
    );
}

/**
 * Sorts entries from the most recently updated.
 *
 * @param entries - Entries in any order
 * @returns A new sorted array
 */
function byRecency(entries: DocumentEntry[]): DocumentEntry[] {
    return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Rewrites the index inside a running transaction, which keeps the document and its entry
 * consistent: both are written, or neither is. Settles once the whole transaction completes,
 * and rejects when it aborts (quota exceeded).
 *
 * @param store - Object store of a readwrite transaction
 * @param change - Receives the current entries and returns the next ones
 */
function updateIndex(
    store: IDBObjectStore,
    change: (entries: DocumentEntry[]) => DocumentEntry[],
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.get(INDEX_KEY);
        request.onsuccess = () => {
            try {
                store.put(change(toEntries(request.result) ?? []), INDEX_KEY);
                resolve(promisifyRequest(store.transaction));
            } catch (error) {
                reject(error);
            }
        };

        // A failed put aborts the transaction first: report its cause, not the read AbortError
        request.onerror = () => reject(store.transaction.error ?? request.error);
    });
}

/**
 * Stores a document and its index entry in one transaction.
 *
 * @param doc - Document written under its own key; the index entry is derived from it by
 *     describeDocument
 */
async function writeDocument(doc: WispenDocument): Promise<void> {
    const entry = describeDocument(doc);
    await withStore("readwrite", (store) => {
        store.put(doc, docKey(doc.id));
        return updateIndex(store, (entries) => [
            ...entries.filter((item) => item.id !== doc.id),
            entry,
        ]);
    });
}

/**
 * Removes a document and its index entry in one transaction.
 *
 * @param id - Document id; unknown ids leave the store unchanged
 */
async function removeDocument(id: string): Promise<void> {
    await withStore("readwrite", (store) => {
        store.delete(docKey(id));
        return updateIndex(store, (entries) => entries.filter((item) => item.id !== id));
    });
}

/**
 * Reads and repairs a stored document.
 *
 * @param id - Document id, as listed in the index
 * @returns The document, or null when it is missing or unreadable
 */
async function readDocument(id: string): Promise<WispenDocument | null> {
    const raw = await withStore("readonly", (store) => promisifyRequest(store.get(docKey(id))));
    if (raw === undefined) return null;
    try {
        return normalizeDocument(raw);
    } catch {
        return null;
    }
}

/**
 * Reads the index, rebuilding it from the stored documents when it is missing or corrupted.
 *
 * @returns Every entry, unsorted
 */
async function readEntries(): Promise<DocumentEntry[]> {
    const entries = toEntries(
        await withStore("readonly", (store) => promisifyRequest(store.get(INDEX_KEY))),
    );
    if (entries) return entries;

    // Every key starting with "doc:" sorts before "doc;", the next character code
    const range = IDBKeyRange.bound(DOC_PREFIX, "doc;", false, true);
    const docs = await withStore("readonly", (store) =>
        promisifyRequest(store.getAll(range) as IDBRequest<unknown[]>),
    );
    const rebuilt = docs.flatMap((raw) => {
        try {
            return [describeDocument(normalizeDocument(raw))];
        } catch {
            return [];
        }
    });
    if (rebuilt.length > 0) {
        await withStore("readwrite", (store) => {
            store.put(rebuilt, INDEX_KEY);
            return promisifyRequest(store.transaction);
        });
    }
    return rebuilt;
}

/**
 * Tells whether a storage error comes from a full disk or an exhausted quota.
 *
 * @param error - Rejection reason of a storage call
 * @returns true for quota errors, whatever the browser naming
 */
function isQuotaError(error: unknown): boolean {
    const name = error instanceof DOMException || error instanceof Error ? error.name : "";
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/**
 * Tells the user once that documents cannot be saved, instead of one toast per autosave.
 * The warning is armed again after the next successful save.
 *
 * @param error - Rejection reason of the failed save
 */
function warnSaveFailure(error: unknown): void {
    if (warned) return;
    warned = true;
    const t = getTranslator("documents");
    const quota = isQuotaError(error);
    toast.error(quota ? t("quotaError") : t("storageError"), {
        id: "storage-error",
        description: quota ? t("quotaHint") : t("storageHint"),
        duration: 10000,
    });
}

/**
 * Writes a document in the queue, reporting failures once.
 *
 * @param doc - Document to write, queued behind the pending storage tasks; a failure warns the user
 *     at most once
 * @returns true when the document reached IndexedDB
 */
function persist(doc: WispenDocument): Promise<boolean> {
    return serial(async () => {
        try {
            await writeDocument(doc);
            if (doc.id === documentStore.getState().document.id) {
                saved = { id: doc.id, updatedAt: doc.updatedAt };
            }
            warned = false;
            return true;
        } catch (error) {
            warnSaveFailure(error);
            return false;
        }
    });
}

/**
 * Stores the id of the displayed document in localStorage, so the next visit reopens it.
 *
 * @param id - Id of the displayed document; writing the same id again is skipped
 */
function rememberDocument(id: string): void {
    if (rememberedId === id) return;
    rememberedId = id;
    try {
        localStorage.setItem(STORAGE_KEYS.lastDocument, id);
    } catch {
        // Reopening the last document is a convenience, the most recent one opens otherwise
    }
}

/**
 * Reads the id of the document displayed during the last visit.
 *
 * @returns The id, or null when unknown or when localStorage is blocked
 */
function lastDocumentId(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEYS.lastDocument);
    } catch {
        return null;
    }
}

/**
 * Displays a document that is already stored, without writing it back.
 *
 * @param doc - Document read from IndexedDB
 */
function showStoredDocument(doc: WispenDocument): void {
    saved = { id: doc.id, updatedAt: doc.updatedAt };
    loadDocument(doc);
    rememberDocument(doc.id);
}

/**
 * Drops the pending autosave without writing it.
 */
function cancelPending(): void {
    clearTimeout(timer);
    timer = undefined;
    pending = null;
}

/**
 * Debounces the save of a changed document. A pending save of another document (the user
 * switched documents in the meantime) is written right away so it is never lost.
 *
 * @param doc - Latest state of the displayed document
 */
function schedule(doc: WispenDocument): void {
    if (pending && pending.id !== doc.id) void persist(pending);
    rememberDocument(doc.id);

    if (saved && saved.id === doc.id && saved.updatedAt === doc.updatedAt) {
        cancelPending();
        return;
    }
    pending = doc;
    clearTimeout(timer);
    timer = setTimeout(() => void flushAutosave(), SAVE_DELAY);
}

/**
 * Asks the browser to keep the local documents when disk space runs low. Best effort: some
 * browsers decide silently, others ignore the request.
 */
async function requestPersistence(): Promise<void> {
    try {
        if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
        await navigator.storage.persist();
    } catch {
        // Durable storage is a bonus, documents are saved either way
    }
}

/**
 * Finds the document to reopen: the last displayed one, else the most recent readable one.
 *
 * @returns The document, or null when nothing is stored or storage is unavailable
 */
function findInitialDocument(): Promise<WispenDocument | null> {
    const lastId = lastDocumentId();
    return serial(async () => {
        if (lastId) {
            const doc = await readDocument(lastId);
            if (doc) return doc;
        }
        for (const entry of byRecency(await readEntries())) {
            const doc = await readDocument(entry.id);
            if (doc) return doc;
        }
        return null;
    }).catch(() => null);
}

/**
 * Builds an empty document named in the active locale.
 *
 * @returns The new document
 */
function blankDocument(): WispenDocument {
    const t = getTranslator("common");
    return createDocument(t("untitled"), t("pageName", { number: 1 }));
}

/**
 * Lists the stored documents, most recently updated first.
 *
 * @returns The index entries, empty when storage is unavailable
 */
export function listDocuments(): Promise<DocumentEntry[]> {
    return serial(readEntries)
        .then(byRecency)
        .catch(() => []);
}

/**
 * Reads a stored document without displaying it.
 *
 * @param id - Document id; the displayed document is read as last saved, without pending changes
 * @returns The repaired document, or null when missing, unreadable or storage is unavailable
 */
export function readStoredDocument(id: string): Promise<WispenDocument | null> {
    return serial(() => readDocument(id)).catch(() => null);
}

/**
 * Saves a document immediately, bypassing the autosave delay.
 *
 * @param doc - Document to write; a pending autosave of the same document that is not newer is
 *     dropped
 * @returns true when the document reached IndexedDB
 */
export function saveDocumentNow(doc: WispenDocument): Promise<boolean> {
    if (pending && pending.id === doc.id && pending.updatedAt <= doc.updatedAt) cancelPending();
    return persist(doc);
}

/**
 * Writes the pending autosave right away, e.g. before switching documents or reloading.
 */
export async function flushAutosave(): Promise<void> {
    const doc = pending;
    cancelPending();
    if (doc) await persist(doc);
}

/**
 * Renames a stored document. The displayed document is renamed through the document store,
 * so the title and the history follow.
 *
 * @param id - Document id, displayed or only stored
 * @param name - New name; blank names are ignored
 * @returns true when the document was renamed
 */
export async function renameStoredDocument(id: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (documentStore.getState().document.id === id) {
        renameDocument(trimmed);
        await flushAutosave();
        return true;
    }
    return serial(async () => {
        const doc = await readDocument(id);
        if (!doc) return false;
        await writeDocument({ ...doc, name: trimmed, updatedAt: Date.now() });
        return true;
    }).catch((error: unknown) => {
        warnSaveFailure(error);
        return false;
    });
}

/**
 * Stores a copy of a document under a new id, named after the original in the active locale.
 * The copy is not displayed.
 *
 * @param id - Document to copy; the displayed one is copied with its latest changes
 * @returns The entry of the copy, or null when the source is missing or saving failed
 */
export async function duplicateStoredDocument(id: string): Promise<DocumentEntry | null> {
    const current = documentStore.getState().document;
    if (current.id === id) await flushAutosave();
    const source = current.id === id ? current : await readStoredDocument(id);
    if (!source) return null;

    const now = Date.now();
    const copy: WispenDocument = {
        ...source,
        id: createId(),
        name: getTranslator("common")("copyOf", { name: source.name }),
        createdAt: now,
        updatedAt: now,
    };
    return (await persist(copy)) ? describeDocument(copy) : null;
}

/**
 * Deletes a stored document. When it is the displayed one, the most recent other document is
 * opened instead, or a new one when none is left.
 *
 * @param id - Document id; its pending autosave is dropped when it is the displayed one
 * @returns true when the document was removed from storage
 */
export async function deleteStoredDocument(id: string): Promise<boolean> {
    if (documentStore.getState().document.id === id) {
        cancelPending();
        const others = (await listDocuments()).filter((entry) => entry.id !== id);
        let next: WispenDocument | null = null;
        for (const entry of others) {
            next = await readStoredDocument(entry.id);
            if (next) break;
        }
        if (next) showStoredDocument(next);
        else await createNewDocument();
    }
    return serial(() => removeDocument(id))
        .then(() => true)
        .catch(() => false);
}

/**
 * Displays a stored document, saving the changes of the current one first.
 *
 * @param id - Document id; the displayed document stays as is
 * @returns true when the document is displayed
 */
export async function openStoredDocument(id: string): Promise<boolean> {
    await flushAutosave();
    if (documentStore.getState().document.id === id) return true;
    const doc = await readStoredDocument(id);
    if (!doc) {
        toast.error(getTranslator("documents")("openError"));
        return false;
    }
    showStoredDocument(doc);
    return true;
}

/**
 * Starts a new empty document, saved locally right away so it shows up in the list.
 *
 * @returns The new document
 */
export async function createNewDocument(): Promise<WispenDocument> {
    await flushAutosave();
    const doc = blankDocument();
    loadDocument(doc);
    rememberDocument(doc.id);
    await saveDocumentNow(documentStore.getState().document);
    return doc;
}

/**
 * Displays the document to start with: the last opened one, else the most recent one, else a
 * new document, saved right away.
 */
async function restore(): Promise<void> {
    const doc = await deadline(findInitialDocument(), RESTORE_TIMEOUT).catch(() => null);
    if (doc) {
        showStoredDocument(doc);
        void requestPersistence();
        return;
    }
    const fresh = blankDocument();
    loadDocument(fresh);
    rememberDocument(fresh.id);
    void persist(documentStore.getState().document);
}

/**
 * Restores the last opened document from local storage, or starts a fresh one. Works in memory
 * when IndexedDB is unavailable. Runs once per page load: a second boot (React strict mode,
 * remounted editor) waits for the first restore instead of creating another document.
 */
export function restoreSession(): Promise<void> {
    restoring ??= restore();
    return restoring;
}

/**
 * Saves the current document locally whenever it changes, debounced, and right away when the
 * page is hidden or closed.
 *
 * @returns A function stopping the autosave after writing what is pending
 */
export function startAutosave(): () => void {
    let revision = documentStore.getState().revision;
    rememberDocument(documentStore.getState().document.id);

    const unsubscribe = documentStore.subscribe(() => {
        const state = documentStore.getState();
        if (state.revision === revision) return;
        revision = state.revision;
        schedule(state.document);
    });
    const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") void flushAutosave();
    };
    const onPageHide = () => void flushAutosave();
    const onStorage = (event: StorageEvent) => {
        // Another tab displayed its own document: the next change here writes our id again
        if (event.key === STORAGE_KEYS.lastDocument) rememberedId = event.newValue;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("storage", onStorage);
    return () => {
        unsubscribe();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("storage", onStorage);
        void flushAutosave();
    };
}
