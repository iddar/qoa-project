import { expect, test } from 'bun:test';
import { previewInventoryImport } from '../services/store-inventory';

test('previewInventoryImport classifies matched, new and invalid rows', () => {
  const preview = previewInventoryImport(`2 Refresco 600ml\nGalletas Mantequilla, GAL-001, 6, 30\nSolo texto roto`, [
    {
      id: 'sp-1',
      storeId: 'store-1',
      name: 'Refresco 600ml',
      sku: 'REF-600',
      unitType: 'piece',
      price: 25,
      stock: 3,
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ]);

  expect(preview.rows).toHaveLength(3);
  expect(preview.rows[0]?.status).toBe('matched');
  expect(preview.rows[1]?.status).toBe('new');
  expect(preview.rows[2]?.status).toBe('invalid');
  expect(preview.summary.totalQuantity).toBe(8);
});
