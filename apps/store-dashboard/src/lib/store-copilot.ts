import type { DraftPendingProductChoice } from "@/lib/store-pos";

export type StoreProductLike = {
  id: string;
  name: string;
  sku?: string;
  price: number;
};

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

  let score = similarityScore(normalizedQuery, normalizedName);

  if (normalizedName.includes(normalizedQuery)) {
    score = Math.max(score, Math.min(1, 0.82 + normalizedQuery.length / Math.max(normalizedName.length, 1) * 0.12));
  }

  if (normalizedSku && normalizedSku.includes(normalizedQuery)) {
    score = Math.max(score, 0.93);
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const nameTokens = normalizedName.split(" ").filter(Boolean);
  if (queryTokens.length > 0 && nameTokens.length > 0) {
    let tokenHits = 0;
    for (const token of queryTokens) {
      const bestTokenScore = nameTokens.reduce((best, candidate) => Math.max(best, similarityScore(token, candidate)), 0);
      if (bestTokenScore >= 0.72) {
        tokenHits += 1;
      }
      score = Math.max(score, bestTokenScore * 0.92);
    }

    if (tokenHits === queryTokens.length) {
      score = Math.max(score, 0.88);
    } else if (tokenHits > 0) {
      score = Math.max(score, 0.7 + tokenHits / queryTokens.length * 0.14);
    }
  }

  return score;
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
