import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

export function registerWebDashboard(app: FastifyInstance, webRootPath: string): void {
  app.get('/', async (_request, reply) => sendStaticFile(reply, webRootPath, 'index.html'));

  // The dashboard stylesheet is a real asset instead of an inline <style>
  // block so the surface-wide CSP can stay `default-src 'self'` without an
  // 'unsafe-inline' carve-out.
  app.get('/styles.css', async (_request, reply) => sendStaticFile(reply, webRootPath, 'styles.css'));

  app.get('/dist/:asset', async (request, reply) => {
    const params = request.params as { asset?: string };

    if (!params.asset) {
      return reply.code(404).send({ error: 'Not found.' });
    }

    return sendStaticFile(reply, resolve(webRootPath, 'dist'), params.asset);
  });
}

async function sendStaticFile(reply: FastifyReply, rootPath: string, requestedPath: string): Promise<FastifyReply> {
  const filePath = resolveSafePath(rootPath, requestedPath);

  if (filePath === null) {
    return reply.code(404).send({ error: 'Not found.' });
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      return reply.code(404).send({ error: 'Not found.' });
    }

    const file = await readFile(filePath);
    return reply
      .header('x-content-type-options', 'nosniff')
      .type(contentTypeFor(filePath))
      .send(file);
  } catch (error) {
    if (isFileNotFound(error)) {
      return reply.code(404).send({ error: 'Not found.' });
    }

    throw error;
  }
}

function resolveSafePath(rootPath: string, requestedPath: string): string | null {
  const resolvedRoot = resolve(rootPath);
  const resolvedFile = resolve(resolvedRoot, requestedPath);
  const pathWithinRoot = relative(resolvedRoot, resolvedFile);

  if (pathWithinRoot.startsWith('..') || isAbsolute(pathWithinRoot)) {
    return null;
  }

  return resolvedFile;
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
