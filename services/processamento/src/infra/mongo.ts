import { MongoClient, Db } from 'mongodb';
import { config } from '../config.js';

let client: MongoClient;
let db: Db;

export async function connectMongo(): Promise<void> {
  client = new MongoClient(config.mongo.url);
  await client.connect();
  db = client.db();
  console.log(`[mongo] Conectado a ${config.mongo.url}`);
}

export function getDb(): Db {
  return db;
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
  }
}
