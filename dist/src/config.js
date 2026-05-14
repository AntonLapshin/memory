import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const MEMORY_DIR = '.memory';
const CONFIG_FILE = 'config.json';
export function getMemoryRoot() {
    return path.join(os.homedir(), MEMORY_DIR);
}
export function getConfigPath() {
    return path.join(getMemoryRoot(), CONFIG_FILE);
}
export function getDefaultConfig() {
    return {
        version: 1,
        git: {
            remote: '',
            branch: 'main',
        },
        qdrant: {
            url: 'http://localhost:6333',
            collection: 'memories',
        },
        llm: {
            provider: 'ollama',
            model: 'llama3.2',
            baseUrl: 'http://localhost:11434',
        },
        embedding: {
            provider: 'ollama',
            model: 'nomic-embed-text',
            baseUrl: 'http://localhost:11434',
            dimensions: 768,
        },
    };
}
export function loadConfig() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        throw new Error('No memory config found. Run "memory init" first.');
    }
    try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return { ...getDefaultConfig(), ...raw };
    }
    catch (e) {
        throw new Error(`Failed to parse config at ${configPath}: ${e.message}`);
    }
}
export function saveConfig(config) {
    const memoryRoot = getMemoryRoot();
    if (!fs.existsSync(memoryRoot)) {
        fs.mkdirSync(memoryRoot, { recursive: true });
    }
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
export function isInitialized() {
    return fs.existsSync(getConfigPath());
}
export function getAllMemoryFiles() {
    const root = getMemoryRoot();
    if (!fs.existsSync(root))
        return [];
    const files = [];
    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.') && entry.name !== '.memory')
                continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
            else if (entry.name.endsWith('.md')) {
                files.push(path.relative(root, fullPath));
            }
        }
    }
    walk(root);
    return files.sort();
}
//# sourceMappingURL=config.js.map