import { closeGraphStore, initializeGraphStore } from './graphStore';

async function main(): Promise<void> {
  const databasePath = process.env.GRAPH_DB_PATH;

  try {
    await initializeGraphStore({ databasePath });
    closeGraphStore();

    if (databasePath) {
      console.log(`✅ База данных инициализирована по пути: ${databasePath}`);
    } else {
      console.log('✅ База данных инициализирована в каталоге data/graph.db');
    }
  } catch (error) {
    console.error('❌ Не удалось инициализировать базу данных', error);
    process.exit(1);
  }
}

void main();
