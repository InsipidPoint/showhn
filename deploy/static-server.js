/**
 * Lightweight static file server for screenshots.
 * Serves /screenshots/* from app/public/screenshots/
 * Runs behind Traefik — not exposed externally.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.STATIC_PORT || "3334", 10);
const SCREENSHOTS_DIR = path.resolve(__dirname, "../app/public/screenshots");

const MIME_TYPES = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = http.createServer((req, res) => {
  // Only serve /screenshots/*
  if (!req.url.startsWith("/screenshots/")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filename = path.basename(req.url);
  // Sanitize — no directory traversal
  if (filename.includes("..") || filename.includes("/")) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  const filePath = path.join(SCREENSHOTS_DIR, filename);
  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "Cache-Control": "public, max-age=604800, immutable",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[static] Screenshot server listening on :${PORT}`);
});
