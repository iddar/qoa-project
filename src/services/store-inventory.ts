type InventoryStoreProduct = {
  id: string;
  storeId: string;
  productId?: string;
  cpgId?: string;
  name: string;
  sku?: string;
  unitType: string;
  price: number;
  stock: number;
  status: string;
  createdAt: string;
};

export type InventoryPreviewCandidate = {
  storeProductId: string;
  name: string;
  sku?: string;
  price: number;
  stock: number;
  score: number;
};

export type InventoryPreviewRow = {
  lineNumber: number;
  rawText: string;
  name: string;
  sku?: string;
  quantity: number;
  price?: number;
  status: 'matched' | 'new' | 'ambiguous' | 'invalid';
  matchedStoreProductId?: string;
  matchedProduct?: InventoryStoreProduct;
  candidates?: InventoryPreviewCandidate[];
  errors?: string[];
};

export type InventoryPreviewSummary = {
  totalRows: number;
  matchedRows: number;
  newRows: number;
  ambiguousRows: number;
  invalidRows: number;
  totalQuantity: number;
};

type ParsedInventoryLine = {
  lineNumber: number;
  rawText: string;
  name: string;
  sku?: string;
  quantity: number;
  price?: number;
  errors: string[];
};

type RankedCandidate = {
  product: InventoryStoreProduct;
  score: number;
};

const HEADER_TOKENS = new Set(['producto', 'productos', 'nombre', 'sku', 'cantidad', 'cant', 'precio', 'stock']);

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const levenshteinDistance = (left: string, right: string) => {
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

const similarityScore = (left: string, right: string) => {
  if (!left || !right) {
    return 0;
  }

  const longest = Math.max(left.length, right.length);
  return 1 - levenshteinDistance(left, right) / longest;
};

const sanitizeCell = (value: string) => value.trim().replace(/^['"]+|['"]+$/g, '');

const stripListPrefix = (value: string) =>
  value
    .replace(/^[-*•]+\s*/, '')
    .replace(/^\d+[.)-]\s+/, '')
    .trim();

const parseInteger = (value: string) => {
  const normalized = value.replace(/[^\d-]/g, '');
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePrice = (value: string) => {
  const normalized = value.replace(/\$/g, '').replace(/mxn/gi, '').replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
};

const looksLikeSku = (value: string) => {
  const trimmed = sanitizeCell(value);
  if (!trimmed || trimmed.length > 100) {
    return false;
  }

  if (/^sku[:\s-]/i.test(trimmed)) {
    return true;
  }

  const hasLetter = /[a-z]/i.test(trimmed);
  const hasDigit = /\d/.test(trimmed);
  return hasLetter && hasDigit && /^[a-z0-9._-]+$/i.test(trimmed);
};

const normalizeSku = (value: string | undefined) => (value ? sanitizeCell(value).toLowerCase() : '');

const isLikelyHeaderRow = (columns: string[]) => {
  const normalizedColumns = columns.map((column) => normalizeText(column)).filter(Boolean);
  return normalizedColumns.length > 0 && normalizedColumns.every((column) => HEADER_TOKENS.has(column));
};

const splitStructuredColumns = (line: string) => {
  const delimiter = line.includes('\t')
    ? '\t'
    : line.includes('|')
      ? '|'
      : line.includes(';')
        ? ';'
        : line.split(',').length >= 3
          ? ','
          : null;

  if (!delimiter) {
    return null;
  }

  const columns = line.split(delimiter).map(sanitizeCell).filter(Boolean);
  return columns.length >= 2 ? columns : null;
};

const parseStructuredLine = (lineNumber: number, rawText: string, columns: string[]): ParsedInventoryLine | null => {
  if (isLikelyHeaderRow(columns)) {
    return null;
  }

  let quantity: number | null = null;
  let price: number | undefined;
  let sku: string | undefined;
  const remaining = [...columns];

  const numericCandidates = remaining
    .map((value, index) => ({ index, intValue: parseInteger(value), priceValue: parsePrice(value), rawValue: value }))
    .filter((entry) => entry.intValue !== null || entry.priceValue !== null);

  const explicitPrice = numericCandidates.find((entry) => /[$]/.test(entry.rawValue) || entry.rawValue.includes('.'));
  if (explicitPrice?.priceValue !== null && explicitPrice?.priceValue !== undefined) {
    price = explicitPrice.priceValue;
    remaining.splice(explicitPrice.index, 1);
  } else if (numericCandidates.length >= 2) {
    const lastNumeric = numericCandidates[numericCandidates.length - 1];
    if (lastNumeric?.priceValue !== null && lastNumeric?.priceValue !== undefined) {
      price = lastNumeric.priceValue;
      remaining.splice(lastNumeric.index, 1);
    }
  }

  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    const value = remaining[index]!;
    if (!sku && looksLikeSku(value)) {
      sku = sanitizeCell(value).replace(/^sku[:\s-]*/i, '');
      remaining.splice(index, 1);
      continue;
    }

    if (quantity === null) {
      const parsedQuantity = parseInteger(value);
      if (parsedQuantity !== null && parsedQuantity > 0 && /^\s*\d+[\s\w$.,-]*$/i.test(value)) {
        quantity = parsedQuantity;
        remaining.splice(index, 1);
        continue;
      }
    }

    if (price === undefined) {
      const parsedPrice = parsePrice(value);
      if (parsedPrice !== null && (/[$]/.test(value) || value.includes('.') || index === remaining.length - 1)) {
        price = parsedPrice;
        remaining.splice(index, 1);
      }
    }
  }

  const name = remaining.join(' ').trim();
  const errors: string[] = [];
  if (!name) {
    errors.push('No pude identificar el nombre del producto.');
  }
  if (quantity === null || quantity <= 0) {
    errors.push('No pude identificar una cantidad valida.');
  }

  return {
    lineNumber,
    rawText,
    name,
    sku,
    quantity: quantity ?? 0,
    price,
    errors,
  };
};

const parseFreeformLine = (lineNumber: number, rawText: string, cleaned: string): ParsedInventoryLine => {
  let remaining = cleaned;
  let quantity: number | null = null;
  let price: number | undefined;
  let sku: string | undefined;
  const errors: string[] = [];

  const leadingQuantityMatch = remaining.match(
    /^(\d+)\s*(?:x|pz|pza|pzas|pieza|piezas|ud|uds|unidad|unidades)?\s+(.+)$/i,
  );
  if (leadingQuantityMatch) {
    quantity = Number.parseInt(leadingQuantityMatch[1]!, 10);
    remaining = leadingQuantityMatch[2]!.trim();
  }

  const trailingPriceMatch =
    remaining.match(/(.+?)\s+(?:precio\s+)?\$\s*(\d+(?:\.\d{1,2})?)$/i) ??
    remaining.match(/(.+?)\s+(\d+(?:\.\d{1,2})?)\s*mxn$/i);
  if (trailingPriceMatch) {
    remaining = trailingPriceMatch[1]!.trim();
    price = parsePrice(trailingPriceMatch[2]!) ?? undefined;
  }

  const trailingQuantityMatch = remaining.match(
    /(.+?)\s+(\d+)\s*(?:x|pz|pza|pzas|pieza|piezas|ud|uds|unidad|unidades)$/i,
  );
  if (!quantity && trailingQuantityMatch) {
    remaining = trailingQuantityMatch[1]!.trim();
    quantity = Number.parseInt(trailingQuantityMatch[2]!, 10);
  }

  const skuMatch = remaining.match(/(?:sku|codigo)[:\s-]+([a-z0-9._-]+)/i);
  if (skuMatch) {
    sku = skuMatch[1];
    remaining = remaining.replace(skuMatch[0], '').trim();
  }

  if (!quantity) {
    const embeddedQuantityMatch = remaining.match(/^(.*?)[,\s]+(\d+)$/);
    if (embeddedQuantityMatch) {
      remaining = embeddedQuantityMatch[1]!.trim();
      quantity = Number.parseInt(embeddedQuantityMatch[2]!, 10);
    }
  }

  if (!remaining) {
    errors.push('No pude identificar el nombre del producto.');
  }
  if (!quantity || quantity <= 0) {
    errors.push('No pude identificar una cantidad valida.');
  }

  return {
    lineNumber,
    rawText,
    name: remaining,
    sku,
    quantity: quantity ?? 0,
    price,
    errors,
  };
};

const parseInventoryLine = (lineNumber: number, rawText: string) => {
  const cleaned = stripListPrefix(rawText);
  if (!cleaned) {
    return null;
  }

  const structured = splitStructuredColumns(cleaned);
  if (structured) {
    return parseStructuredLine(lineNumber, rawText, structured);
  }

  return parseFreeformLine(lineNumber, rawText, cleaned);
};

const rankProducts = (queryName: string, querySku: string | undefined, products: InventoryStoreProduct[]) => {
  const normalizedName = normalizeText(queryName);
  const normalizedSku = normalizeSku(querySku);

  return products
    .map((product) => {
      const productName = normalizeText(product.name);
      const productSku = normalizeSku(product.sku);

      let score = similarityScore(normalizedName, productName) * 0.82;

      if (normalizedName && productName.includes(normalizedName)) {
        score = Math.max(score, 0.9);
      }
      if (normalizedSku && productSku && productSku === normalizedSku) {
        score = Math.max(score, 1);
      } else if (normalizedSku && productSku && productSku.includes(normalizedSku)) {
        score = Math.max(score, 0.96);
      }

      return { product, score } satisfies RankedCandidate;
    })
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
};

const summarizeRows = (rows: InventoryPreviewRow[]): InventoryPreviewSummary => ({
  totalRows: rows.length,
  matchedRows: rows.filter((row) => row.status === 'matched').length,
  newRows: rows.filter((row) => row.status === 'new').length,
  ambiguousRows: rows.filter((row) => row.status === 'ambiguous').length,
  invalidRows: rows.filter((row) => row.status === 'invalid').length,
  totalQuantity: rows.reduce((sum, row) => sum + (row.status === 'invalid' ? 0 : row.quantity), 0),
});

const toCandidate = (entry: RankedCandidate): InventoryPreviewCandidate => ({
  storeProductId: entry.product.id,
  name: entry.product.name,
  sku: entry.product.sku,
  price: entry.product.price,
  stock: entry.product.stock,
  score: Number(entry.score.toFixed(3)),
});

export const previewInventoryImport = (text: string, products: InventoryStoreProduct[]) => {
  const rows = text
    .split(/\r?\n/)
    .map((line, index) => parseInventoryLine(index + 1, line))
    .filter((row): row is ParsedInventoryLine => Boolean(row))
    .map((row): InventoryPreviewRow => {
      if (row.errors.length > 0) {
        return {
          lineNumber: row.lineNumber,
          rawText: row.rawText,
          name: row.name,
          sku: row.sku,
          quantity: row.quantity,
          price: row.price,
          status: 'invalid',
          errors: row.errors,
        };
      }

      const normalizedSku = normalizeSku(row.sku);
      if (normalizedSku) {
        const exactSkuMatch = products.filter((product) => normalizeSku(product.sku) === normalizedSku);
        if (exactSkuMatch.length === 1) {
          return {
            lineNumber: row.lineNumber,
            rawText: row.rawText,
            name: row.name,
            sku: row.sku,
            quantity: row.quantity,
            price: row.price,
            status: 'matched',
            matchedStoreProductId: exactSkuMatch[0]!.id,
            matchedProduct: exactSkuMatch[0]!,
          };
        }
      }

      const normalizedName = normalizeText(row.name);
      const exactNameMatch = products.filter((product) => normalizeText(product.name) === normalizedName);
      if (exactNameMatch.length === 1) {
        return {
          lineNumber: row.lineNumber,
          rawText: row.rawText,
          name: row.name,
          sku: row.sku,
          quantity: row.quantity,
          price: row.price,
          status: 'matched',
          matchedStoreProductId: exactNameMatch[0]!.id,
          matchedProduct: exactNameMatch[0]!,
        };
      }

      const ranked = rankProducts(row.name, row.sku, products);
      const best = ranked[0];
      const second = ranked[1];
      const confidentMatch =
        best && best.score >= 0.86 && (!second || best.score - second.score >= 0.08 || second.score < 0.72);

      if (confidentMatch) {
        return {
          lineNumber: row.lineNumber,
          rawText: row.rawText,
          name: row.name,
          sku: row.sku,
          quantity: row.quantity,
          price: row.price,
          status: 'matched',
          matchedStoreProductId: best.product.id,
          matchedProduct: best.product,
        };
      }

      if (ranked.length > 0) {
        return {
          lineNumber: row.lineNumber,
          rawText: row.rawText,
          name: row.name,
          sku: row.sku,
          quantity: row.quantity,
          price: row.price,
          status: 'ambiguous',
          candidates: ranked.map(toCandidate),
          errors: ['Encontré varias coincidencias plausibles; revisa la fila antes de confirmar.'],
        };
      }

      return {
        lineNumber: row.lineNumber,
        rawText: row.rawText,
        name: row.name,
        sku: row.sku,
        quantity: row.quantity,
        price: row.price,
        status: 'new',
      };
    });

  return {
    rows,
    summary: summarizeRows(rows),
  };
};

export const summarizeConfirmedInventoryRows = (rows: Array<{ quantityDelta: number; created: boolean }>) => ({
  totalRows: rows.length,
  totalQuantity: rows.reduce((sum, row) => sum + row.quantityDelta, 0),
  createdProducts: rows.filter((row) => row.created).length,
  updatedProducts: rows.filter((row) => !row.created).length,
});
