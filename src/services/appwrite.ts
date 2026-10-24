import { Client, Account, Databases, Storage, Functions, Query } from 'appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';

const client = new Client()
  .setEndpoint(APPWRITE_CONFIG.endpoint)
  .setProject(APPWRITE_CONFIG.projectId);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

export const testConnection = async (): Promise<boolean> => {
  try {
    await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.profiles,
      [Query.limit(1)]
    );
    return true;
  } catch (error) {
    console.error('❌ Appwrite connection failed:', error);
    return false;
  }
};

/** Una voce del registro dell'account (accessi e modifiche), come la restituisce Appwrite. */
export interface AccountLog {
  event: string;
  time: string;
  ip?: string;
  clientName?: string;
  osName?: string;
  deviceName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  countryName?: string;
}

/** Registro dell'account (GET /account/logs): l'SDK web non ha un metodo dedicato. */
export async function listAccountLogs(): Promise<AccountLog[]> {
  const url = new URL(`${APPWRITE_CONFIG.endpoint.replace(/\/$/, '')}/account/logs`);
  const res = (await client.call('get', url, { 'content-type': 'application/json' })) as { logs?: AccountLog[] };
  return res.logs || [];
}

export { client };