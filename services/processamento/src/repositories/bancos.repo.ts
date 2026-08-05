import { Collection } from 'mongodb';
import { getDb } from '../infra/mongo.js';
import { BancoInfo } from '@moura/types';

let bancosCol: Collection<BancoInfo>;

function getCollection(): Collection<BancoInfo> {
  if (!bancosCol) {
    const db = getDb();
    bancosCol = db.collection<BancoInfo>('bancos');
  }
  return bancosCol;
}

export async function getAllBancos(): Promise<BancoInfo[]> {
  const col = getCollection();
  return col.find({}).project<BancoInfo>({ bancoId: 1, siteId: 1, contratoId: 1, _id: 0 }).toArray();
}
