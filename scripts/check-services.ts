import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { prisma } from '../src/db.js';
import { storage } from '../src/storage.js';

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('PASS: Prisma live database query');

  const key = `checks/${randomUUID()}.txt`;
  const body = 'Skorz storage connectivity check';
  try {
    await storage.upload(key, body, 'text/plain');
    const downloaded = await storage.download(key);
    if (new TextDecoder().decode(downloaded) !== body) {
      throw new Error('Storage content did not match.');
    }
    console.log('PASS: Object Storage upload and download match');
  } finally {
    await storage.delete(key);
    console.log('PASS: Object Storage test object deleted');
  }

  const server = spawn(process.execPath, ['dist/index.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 20000);
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited before readiness')); });
      server.stderr.on('data', data => process.stderr.write(data));
      server.stdout.on('data', data => {
        process.stdout.write(data);
        if (data.toString().includes('Server running at')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const response = await fetch('http://localhost:8000/');
    if (response.status !== 200 || await response.text() !== 'Hello from Express!') {
      throw new Error('Root route response did not match.');
    }
    console.log('PASS: GET / => 200 Hello from Express!');
  } finally {
    server.kill();
  }
} catch (error) {
  // Avoid logging connection strings or SDK request details.
  console.error('FAIL: service check', error instanceof Error ? error.name : 'Unknown error');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  storage.close();
}
