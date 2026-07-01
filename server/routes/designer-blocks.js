/**
 * Designer Blocks API (S-D7)
 * Manages community element packs from ~/.salilvnair/istorybook/designer-blocks/
 *
 * GET   /api/designer/blocks          — list installed block manifests
 * POST  /api/designer/blocks/scaffold — scaffold a new block directory
 * PATCH /api/designer/blocks/:id/enabled — toggle enabled flag in manifest
 */
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const BLOCKS_DIR = path.join(os.homedir(), '.salilvnair', 'istorybook', 'designer-blocks');

export function designerBlocksRouter() {
  const router = Router();

  // ── List installed blocks ──────────────────────────────────────────────────
  router.get('/api/designer/blocks', async (_req, res) => {
    let dirs = [];
    try {
      dirs = await fs.readdir(BLOCKS_DIR);
    } catch {
      return res.json({ blocks: [], blocksDir: BLOCKS_DIR });
    }

    const blocks = [];
    for (const dir of dirs) {
      const manifestPath = path.join(BLOCKS_DIR, dir, 'designer-block.json');
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        blocks.push({ ...manifest, _dir: dir });
      } catch {
        // skip dirs with missing/corrupt manifest
      }
    }

    res.json({ blocks, blocksDir: BLOCKS_DIR });
  });

  // ── Scaffold a new block ───────────────────────────────────────────────────
  router.post('/api/designer/blocks/scaffold', async (req, res) => {
    const { id, name, author } = req.body || {};
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'id must be lowercase-kebab (a-z0-9-)' });
    }

    const blockDir = path.join(BLOCKS_DIR, id);
    const manifest = {
      id,
      name: name || id,
      version: '1.0.0',
      author: author || 'me',
      enabled: true,
      elements: [
        {
          type: `${id}.example`,
          baseType: 'sticker',
          palette: { icon: '⭐', label: 'Example element', group: name || id },
          defaults: { w: 80, h: 80, props: { emoji: '⭐', size: 56, opacity: 1 } },
        },
      ],
    };

    try {
      await fs.mkdir(blockDir, { recursive: true });
      await fs.writeFile(
        path.join(blockDir, 'designer-block.json'),
        JSON.stringify(manifest, null, 2),
      );
      res.json({ created: blockDir, manifest });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Toggle enabled flag ────────────────────────────────────────────────────
  router.patch('/api/designer/blocks/:id/enabled', async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body || {};
    const manifestPath = path.join(BLOCKS_DIR, id, 'designer-block.json');
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      manifest.enabled = Boolean(enabled);
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      res.json({ ok: true, manifest });
    } catch {
      res.status(404).json({ error: `block '${id}' not found` });
    }
  });

  return router;
}
