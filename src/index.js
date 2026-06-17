import 'dotenv/config';
import { loadAwsSecrets } from './config.js';
import app from './app.js';
import { connectDb } from './db.js';

const port = process.env.PORT || 8080;

async function startServer() {
  await loadAwsSecrets();
  await connectDb();
  const server = app.listen(port, () => {
    console.log(`HelloHello API listening on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other process or set PORT in .env.`);
    } else {
      console.error('Server error:', error);
    }
    process.exit(1);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
