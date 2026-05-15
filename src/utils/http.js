import fs from 'node:fs';

export function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

export function notFound(req, res, headers = {}) {
  sendJson(
    res,
    404,
    {
      error: 'Not Found',
      path: req.url,
    },
    headers
  );
}

export function streamFile(res, filePath, { contentType, fileName, headers = {} } = {}) {
  const stat = fs.statSync(filePath);
  const disposition = fileName ? `inline; filename="${fileName}"` : 'inline';
  res.writeHead(200, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': disposition,
    ...headers,
  });
  fs.createReadStream(filePath).pipe(res);
}
