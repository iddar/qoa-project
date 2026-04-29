---
name: liteparse
description: Parse PDF, DOCX, XLSX, PPTX, images and other documents to extract text content using the lit CLI (liteparse). Use when you need to inspect, classify, or understand the content of files with cryptic names, unknown documents, invoices, receipts, contracts, medical reports, or any file where the content is not obvious from the filename. Also use when organizing files by category or when verifying that files are correctly classified.
---

# liteparse — Document Content Parser

This skill provides fast text extraction from PDFs, Office documents, images, and other file formats using the `lit` (liteparse) CLI tool.

## When to Use

- **Classifying files**: A file has a cryptic name (UUID, hash, generic name like `file.pdf`, `reporte.pdf`) and you need to know what it contains.
- **Verifying placement**: You're unsure if a file is in the correct folder.
- **Organizing downloads**: You need to sort many files into categories and want to read their actual content first.
- **Processing documents**: You need to extract text from invoices, receipts, contracts, medical reports, certificates, etc.

## Basic Usage

Parse a single file and show the first lines:

```bash
lit parse "/path/to/file.pdf" | head -n 30
```

Parse with specific options:

```bash
lit parse "/path/to/file.pdf" --format text --max-pages 5 | head -n 50
```

For images that may need OCR:

```bash
lit parse "/path/to/image.png" --ocr-language es | head -n 30
```

## Batch Parsing

Parse all files in a directory to an output directory:

```bash
lit batch-parse "/path/to/input/dir" "/path/to/output/dir" --format text
```

## Supported Formats

- **Documents**: PDF, DOCX, XLSX, PPTX, EPUB, MOBI
- **Images**: PNG, JPG, HEIC, TIFF, BMP (with OCR)
- **Archives**: ZIP (contents listed), RAR
- **Other**: TXT, MD, CSV, JSON, HTML

## Workflow for File Classification

1. Identify files with suspicious or unknown names:
   ```bash
   find . -maxdepth 1 -type f | grep -E '[0-9a-f]{8}-|file\.pdf$|reporte\.pdf$|documento'
   ```

2. Parse each suspicious file:
   ```bash
   lit parse "suspicious-file.pdf" | head -n 20
   ```

3. Based on content, move to the correct folder:
   - Contains "RFC", "Folio fiscal", "CFDI" → Finanzas/Facturas
   - Contains "ESTADO DE CUENTA", "BBVA" → Finanzas/Bancos
   - Contains "Comisión Federal de Electricidad" → Finanzas/Facturas (CFE)
   - Contains "pasaporte", "visa", "identificación" → Documentos Personales
   - Contains "examen", "laboratorio", "resultado" → Documentos Personales/Salud
   - Contains "cotización", "propuesta" → Negocios
   - Contains academic/paper content → Código/Tech o Investigación
   - Contains "software", "installer", "dmg", "pkg" → Instaladores

4. Verify with `head` or `grep` for keywords before moving.

## Common Patterns

Check if a PDF is a CFDI (Mexican invoice):
```bash
lit parse "file.pdf" | grep -iE 'folio fiscal|rfc emisor|rfc receptor'
```

Check if it's a bank statement:
```bash
lit parse "file.pdf" | grep -iE 'estado de cuenta|bbva|banamex|hsbc|santander'
```

Check if it's a payroll receipt:
```bash
lit parse "file.pdf" | grep -iE 'recibo de nómina|quincena|sueldo|imss'
```

## Notes

- `lit parse` outputs plain text by default (`--format text`).
- Use `| head -n N` to avoid flooding the terminal with long documents.
- For scanned documents or images with text, OCR is enabled by default.
- The tool is fast for PDFs and Office docs; images may take longer due to OCR.
