import express from 'express';
import { prisma } from './db.js';

const app = express();
const port = 8000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from Express!');
});

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('Connected to Neon database.');

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
} catch {
  console.error('Could not connect to Neon. Check DATABASE_URL and your network connection.');
  await prisma.$disconnect();
  process.exitCode = 1;
}
