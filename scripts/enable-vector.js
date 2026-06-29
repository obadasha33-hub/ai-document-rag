const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('Connecting to database to enable vector extension...');
  const prisma = new PrismaClient();
  try {
    // Execute SQL to enable vector extension
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector extension enabled successfully (or already exists).');
  } catch (err) {
    console.error('❌ Failed to enable pgvector extension:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
