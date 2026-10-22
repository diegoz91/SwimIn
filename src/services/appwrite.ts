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

export { client };