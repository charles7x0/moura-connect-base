import { MongoClient, Db } from 'mongodb';
import { config } from '../config.js';

let mongoClient: MongoClient;
let db: Db;

export async function connectMongo(): Promise<void> {
  mongoClient = new MongoClient(config.mongo.url);
  await mongoClient.connect();
  db = mongoClient.db();
  console.log(`[mongo] Conectado a ${config.mongo.url}`);
}

export function getDb(): Db {
  return db;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoClient) await mongoClient.close();
}
