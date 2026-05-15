# Plan Extraction Architecture

The API owns the product pipeline and public contract. Python is currently used only as a technical adapter for PDF vector/raster operations that are already reliable through PyMuPDF.

## Current Boundary

Node.js API owns:

- HTTP controllers, routes, validation, and errors.
- Extraction run creation and storage paths.
- Extraction profile configuration.
- Vision prompt construction.
- Anthropic/Claude tile calls when `VISION_OWNER=node`.
- Detection normalization from model responses.
- Final item aggregation from tile results.
- Element summary generation.
- API response shape.

Python adapter currently owns:

- PDF page IR extraction through PyMuPDF.
- Region and tile generation.
- Vector symbol detection.
- Crop rendering for vision calls.
- Overlay PDF drawing while PyMuPDF remains the PDF writer.

## Migration Direction

Move responsibilities into API modules in this order:

1. Tile selection policy.
2. Detection confidence scoring and deduplication.
3. Catalog/material matching.
4. Overlay generation from API-owned detections.
5. Vector symbol detection, if a Node PDF/vector library proves accurate enough.
6. PDF rendering and overlay writing, only if replacing PyMuPDF does not reduce plan-reading quality.

The goal is not to force a single language. The goal is a stable API-owned domain pipeline with replaceable technical adapters.
