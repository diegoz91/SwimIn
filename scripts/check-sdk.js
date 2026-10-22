/**
 * Verifica che sia installata la versione di node-appwrite richiesta dagli
 * script. Con una versione vecchia (es. 12) le chiamate falliscono con errori
 * fuorvianti come "Invalid `databaseId` param" o "Queries must be an array".
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const REQUIRED_MAJOR = 31;

/** Legge la versione dal package.json installato (le versioni recenti non lo esportano). */
function installedVersion() {
    try {
        const require = createRequire(import.meta.url);
        let dir = path.dirname(require.resolve('node-appwrite'));
        while (dir !== path.dirname(dir)) {
            const pkgPath = path.join(dir, 'package.json');
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
                if (pkg.name === 'node-appwrite') return pkg.version;
            }
            dir = path.dirname(dir);
        }
    } catch {
        // non installato: gestito dal chiamante
    }
    return null;
}

export function assertNodeAppwriteVersion() {
    const version = installedVersion();
    const major = version ? Number.parseInt(version, 10) : 0;
    if (major < REQUIRED_MAJOR) {
        console.error(`❌ node-appwrite installato: ${version ?? 'nessuno'}. Serve la versione ${REQUIRED_MAJOR} o superiore.`);
        console.error('   Esegui prima:  git pull  &&  npm install');
        process.exit(1);
    }
}
