"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { createEmptyDraft, type DraftCustomer, type DraftItem, type DraftTransaction, type StorePosDraft } from "@/lib/store-pos";

type StorePosContextValue = {
  draft: StorePosDraft;
  isAgentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
  addItem: (item: Omit<DraftItem, "quantity">, quantity?: number) => void;
  updateItemQuantity: (storeProductId: string, quantity: number) => void;
  removeItem: (storeProductId: string) => void;
  clearItems: () => void;
  setCustomer: (customer: DraftCustomer | null) => void;
  clearCustomer: () => void;
  setLastTransaction: (transaction: DraftTransaction | null) => void;
  replaceDraft: (nextDraft: StorePosDraft) => void;
  resetDraft: () => void;
};

const StorePosContext = createContext<StorePosContextValue | null>(null);

export function StorePosProvider({ children }: { children: React.ReactNode }) {
  const { tenantId, tenantType } = useAuth();
  const storageKey = tenantType === "store" && tenantId ? `store-pos-draft:${tenantId}` : null;
  const [draft, setDraft] = useState<StorePosDraft>(createEmptyDraft);
  const [isAgentOpen, setAgentOpen] = useState(false);

  useEffect(() => {
    if (!storageKey) {
      setDraft(createEmptyDraft());
      return;
    }

    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      setDraft(createEmptyDraft());
      return;
    }

    try {
      const parsed = JSON.parse(raw) as StorePosDraft;
      setDraft({
        items: parsed.items ?? [],
        customer: parsed.customer ?? null,
        lastTransaction: parsed.lastTransaction ?? null,
      });
    } catch {
      setDraft(createEmptyDraft());
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  const value = useMemo<StorePosContextValue>(
    () => ({
      draft,
      isAgentOpen,
      setAgentOpen,
      addItem: (item, quantity = 1) => {
        setDraft((current) => {
          const existing = current.items.find((entry) => entry.storeProductId === item.storeProductId);
          if (existing) {
            return {
              ...current,
              items: current.items.map((entry) =>
                entry.storeProductId === item.storeProductId
                  ? { ...entry, quantity: entry.quantity + quantity }
                  : entry,
              ),
            };
          }

          return {
            ...current,
            items: [...current.items, { ...item, quantity }],
          };
        });
      },
      updateItemQuantity: (storeProductId, quantity) => {
        setDraft((current) => ({
          ...current,
          items:
            quantity <= 0
              ? current.items.filter((entry) => entry.storeProductId !== storeProductId)
              : current.items.map((entry) =>
                  entry.storeProductId === storeProductId ? { ...entry, quantity } : entry,
                ),
        }));
      },
      removeItem: (storeProductId) => {
        setDraft((current) => ({
          ...current,
          items: current.items.filter((entry) => entry.storeProductId !== storeProductId),
        }));
      },
      clearItems: () => {
        setDraft((current) => ({
          ...current,
          items: [],
        }));
      },
      setCustomer: (customer) => {
        setDraft((current) => ({
          ...current,
          customer,
        }));
      },
      clearCustomer: () => {
        setDraft((current) => ({
          ...current,
          customer: null,
        }));
      },
      setLastTransaction: (lastTransaction) => {
        setDraft((current) => ({
          ...current,
          lastTransaction,
        }));
      },
      replaceDraft: (nextDraft) => {
        setDraft(nextDraft);
      },
      resetDraft: () => {
        setDraft(createEmptyDraft());
      },
    }),
    [draft, isAgentOpen],
  );

  return <StorePosContext.Provider value={value}>{children}</StorePosContext.Provider>;
}

export function useStorePos() {
  const context = useContext(StorePosContext);
  if (!context) {
    throw new Error("useStorePos must be used within StorePosProvider");
  }

  return context;
}
