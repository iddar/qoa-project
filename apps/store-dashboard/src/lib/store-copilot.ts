import type { AgentAction, StorePosDraft, DraftPendingProductChoice } from "@/lib/store-pos";

export type StoreProductLike = {
  id: string;
  name: string;
  sku?: string;
  price: number;
};

export type RequestedOrderItem = {
  query: string;
  quantity: number;
};

export type RankedProductCandidate<TProduct extends StoreProductLike = StoreProductLike> = {
  product: TProduct;
  score: number;
};

const NUMBER_WORDS = new Map<string, number>([
  ["un", 1],
  ["una", 1],
  ["uno", 1],
  ["dos", 2],
  ["tres", 3],
  ["cuatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["siete", 7],
  ["ocho", 8],
  ["nueve", 9],
  ["diez", 10],
]);

const IGNORE_QUERY_TOKENS = new Set(["de", "del", "la", "el", "los", "las", "y", "un", "una", "uno"]);

const ORDER_START = /^(quiero|dame|agrega|añade|anade|ponme|pon|necesito|manda|suma|pide|agr[eé]game|\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/i;
const LEADING_ORDER_VERBS = /^(quiero|dame|agrega|añade|anade|ponme|pon|necesito|manda|suma|pide|agr[eé]game)\b\s*/i;

export const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const levenshteinDistance = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) {
    matrix[row]![0] = row;
  }
  for (let column = 0; column <= right.length; column += 1) {
    matrix[0]![column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost,
      );
    }
  }

  return matrix[left.length]![right.length]!;
};

export const similarityScore = (left: string, right: string) => {
  if (!left || !right) {
    return 0;
  }

  const longest = Math.max(left.length, right.length);
  return 1 - levenshteinDistance(left, right) / longest;
};

export const getProductMatchScore = (query: string, product: StoreProductLike) => {
  const normalizedQuery = normalizeText(query);
  const normalizedName = normalizeText(product.name);
  const normalizedSku = normalizeText(product.sku ?? "");

  if (!normalizedQuery) {
    return 0;
  }

  let score = similarityScore(normalizedQuery, normalizedName) * 0.8;

  if (normalizedName.includes(normalizedQuery)) {
    score = Math.max(score, Math.min(1, 0.82 + normalizedQuery.length / Math.max(normalizedName.length, 1) * 0.12));
  }

  if (normalizedSku && normalizedSku.includes(normalizedQuery)) {
    score = Math.max(score, 0.93);
  }

  const queryTokens = normalizedQuery.split(" ").filter((token) => token && !IGNORE_QUERY_TOKENS.has(token));
  const nameTokens = normalizedName.split(" ").filter((token) => token && !IGNORE_QUERY_TOKENS.has(token));
  if (queryTokens.length > 0 && nameTokens.length > 0) {
    let tokenHits = 0;
    const tokenScores: number[] = [];
    for (const token of queryTokens) {
      const bestTokenScore = nameTokens.reduce((best, candidate) => Math.max(best, similarityScore(token, candidate)), 0);
      tokenScores.push(bestTokenScore);
      if (bestTokenScore >= 0.72) {
        tokenHits += 1;
      }
    }

    const averageTokenScore = tokenScores.reduce((sum, current) => sum + current, 0) / tokenScores.length;
    const minimumTokenScore = Math.min(...tokenScores);
    score = Math.max(score, averageTokenScore * 0.92);

    if (tokenHits === queryTokens.length) {
      score = Math.max(score, minimumTokenScore >= 0.9 ? 0.98 : minimumTokenScore >= 0.8 ? 0.94 : 0.9);
    } else if (tokenHits > 0) {
      score = Math.max(score, 0.62 + (tokenHits / queryTokens.length) * 0.18 + averageTokenScore * 0.08);
    }
  }

  return score;
};

export const rankProductsByQuery = <TProduct extends StoreProductLike>(query: string, products: TProduct[]) =>
  products
    .map((product) => ({
      product,
      score: getProductMatchScore(query, product),
    }))
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8) as RankedProductCandidate<TProduct>[];

export const hasConfidentSingleProductMatch = <TProduct extends StoreProductLike>(rankedCandidates: RankedProductCandidate<TProduct>[]) => {
  const best = rankedCandidates[0];
  const second = rankedCandidates[1];

  if (!best) {
    return false;
  }

  return best.score >= 0.64 && (!second || best.score - second.score >= 0.08 || second.score < 0.56);
};

export const extractRequestedOrderItems = (message: string): RequestedOrderItem[] => {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage || !ORDER_START.test(normalizedMessage)) {
    return [];
  }

  const trimmedIntent = normalizedMessage.replace(LEADING_ORDER_VERBS, "").trim();
  const segments = (trimmedIntent || normalizedMessage)
    .split(/\s+y\s+|,/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments
    .map((segment) => {
      const quantityMatch = segment.match(/^(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b\s+(.*)$/i);
      const quantityToken = quantityMatch?.[1]?.toLowerCase();
      const rawQuery = quantityMatch?.[2] ?? segment;
      const quantity = quantityToken
        ? Number.isNaN(Number(quantityToken))
          ? (NUMBER_WORDS.get(quantityToken) ?? 1)
          : Number(quantityToken)
        : 1;

      const query = rawQuery
        .replace(/^(de|del|la|el|los|las|unos|unas)\s+/i, "")
        .trim();

      if (!query) {
        return null;
      }

      return {
        query,
        quantity: Math.max(1, quantity),
      } satisfies RequestedOrderItem;
    })
    .filter((item): item is RequestedOrderItem => Boolean(item));
};

export const planRequestedOrderItems = <TProduct extends StoreProductLike>(message: string, products: TProduct[]) => {
  const requests = extractRequestedOrderItems(message);

  const resolved: Array<{ request: RequestedOrderItem; match: RankedProductCandidate<TProduct> }> = [];
  const unresolved: Array<{ request: RequestedOrderItem; candidates: RankedProductCandidate<TProduct>[] }> = [];

  for (const request of requests) {
    const ranked = rankProductsByQuery(request.query, products);
    if (hasConfidentSingleProductMatch(ranked)) {
      resolved.push({ request, match: ranked[0]! });
      continue;
    }

    unresolved.push({ request, candidates: ranked.slice(0, 3) });
  }

  return {
    requests,
    resolved,
    unresolved,
  };
};

export const resolvePendingProductChoiceSelection = (choices: DraftPendingProductChoice[], selection: string) => {
  if (choices.length === 0) {
    return {
      resolved: false as const,
      reason: "no_pending_choices" as const,
      candidates: [],
    };
  }

  const normalizedSelection = normalizeText(selection);
  const rankedChoices = choices
    .map((choice) => ({
      choice,
      score: Math.max(
        similarityScore(normalizedSelection, normalizeText(choice.name)),
        ...normalizeText(choice.name)
          .split(" ")
          .filter(Boolean)
          .map((token) => similarityScore(normalizedSelection, token)),
      ),
    }))
    .sort((left, right) => right.score - left.score);

  const best = rankedChoices[0];
  const second = rankedChoices[1];

  if (!best || best.score < 0.55) {
    return {
      resolved: false as const,
      reason: "no_match" as const,
      candidates: choices,
    };
  }

  const confidentChoice = !second || best.score - second.score >= 0.12 || second.score < 0.58;
  if (!confidentChoice) {
    return {
      resolved: false as const,
      reason: "needs_confirmation" as const,
      candidates: rankedChoices.slice(0, 3).map((entry) => entry.choice),
    };
  }

  return {
    resolved: true as const,
    choice: best.choice,
  };
};

export const getInitialCopilotActions = (): AgentAction[] => [
  {
    id: "welcome-add-refrescos",
    label: "2 refrescos",
    prompt: "Agrega 2 refrescos al pedido.",
    variant: "secondary",
  },
  {
    id: "welcome-find-botanas",
    label: "Buscar papas",
    prompt: "Busca unas papas para el carrito.",
    variant: "secondary",
  },
  {
    id: "welcome-scan-card",
    label: "Ligar tarjeta",
    prompt: "Quiero ligar la tarjeta del cliente.",
    kind: "capture-qr",
    variant: "secondary",
  },
];

export const buildCopilotActions = (draft: StorePosDraft): AgentAction[] => {
  if (draft.pendingProductChoices && draft.pendingProductChoices.length > 0) {
    return draft.pendingProductChoices.slice(0, 4).map((choice) => ({
      id: `pending-choice-${choice.storeProductId}`,
      label: choice.name,
      prompt: `Elijo esta opción del pedido pendiente: ${choice.name}`,
      variant: "secondary",
    }));
  }

  const actions: AgentAction[] = [];

  if (draft.items.length > 0) {
    if (!draft.customer) {
      actions.push({
        id: "draft-link-customer",
        label: "Ligar tarjeta",
        prompt: "Quiero ligar la tarjeta del cliente.",
        kind: "capture-qr",
        variant: "secondary",
      });
    } else {
      actions.push({
        id: "draft-remove-customer",
        label: "Quitar cliente",
        prompt: "Quita el cliente de este pedido.",
        variant: "secondary",
      });
    }

    actions.push({
      id: "draft-confirm-sale",
      label: "Confirmar venta",
      prompt: "Confirma la venta actual.",
      variant: "primary",
    });
    actions.push({
      id: "draft-clear-cart",
      label: "Vaciar pedido",
      prompt: "Vacía el pedido actual.",
      variant: "danger",
    });
  }

  return actions;
};
