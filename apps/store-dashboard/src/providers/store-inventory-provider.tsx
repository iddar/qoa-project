"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { createEmptyInventoryDraft, resolveInventoryRowState, type InventoryDraftReceipt, type InventoryDraftRow, type StoreInventoryDraft } from "@/lib/store-inventory";

type StoreInventoryContextValue = {
  draft: StoreInventoryDraft;
  replaceDraft: (nextDraft: StoreInventoryDraft) => void;
  setRows: (rows: InventoryDraftRow[]) => void;
  updateRow: (rowId: string, updates: Partial<InventoryDraftRow>) => void;
  removeRow: (rowId: string) => void;
  setLastReceipt: (receipt: InventoryDraftReceipt | null) => void;
  resetDraft: () => void;
};

const StoreInventoryContext = createContext<StoreInventoryContextValue | null>(null);

export function StoreInventoryProvider({ children }: { children: React.ReactNode }) {
  const { tenantId, tenantType } = useAuth();
  const storageKey = tenantType === "store" && tenantId ? `store-inventory-draft:${tenantId}` : null;
  const [draft, setDraft] = useState<StoreInventoryDraft>(createEmptyInventoryDraft);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current || !storageKey) {
      return;
    }

    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      isInitialized.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as StoreInventoryDraft;
      setDraft({
        rows: parsed.rows ?? [],
        lastReceipt: parsed.lastReceipt ?? null,
      });
    } catch {
      // ignore restore failures
    }
    isInitialized.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  const value = useMemo<StoreInventoryContextValue>(
    () => ({
      draft,
      replaceDraft: (nextDraft) => setDraft(nextDraft),
      setRows: (rows) => {
        setDraft((current) => ({
          ...current,
          rows: rows.map(resolveInventoryRowState),
          lastReceipt: null,
        }));
      },
      updateRow: (rowId, updates) => {
        setDraft((current) => ({
          ...current,
          rows: current.rows.map((row) => row.id === rowId ? resolveInventoryRowState({ ...row, ...updates }) : row),
        }));
      },
      removeRow: (rowId) => {
        setDraft((current) => ({
          ...current,
          rows: current.rows.filter((row) => row.id !== rowId),
        }));
      },
      setLastReceipt: (lastReceipt) => {
        setDraft((current) => ({
          ...current,
          lastReceipt,
        }));
      },
      resetDraft: () => setDraft(createEmptyInventoryDraft()),
    }),
    [draft],
  );

  return <StoreInventoryContext.Provider value={value}>{children}</StoreInventoryContext.Provider>;
}

export function useStoreInventory() {
  const context = useContext(StoreInventoryContext);
  if (!context) {
    throw new Error("useStoreInventory must be used within StoreInventoryProvider");
  }

  return context;
}
