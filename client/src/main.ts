import Phaser from 'phaser';
import { Client, Session, RpcResponse } from '@heroiclabs/nakama-js';

class MainScene extends Phaser.Scene {
    private nakamaClient!: Client;
    private session: Session | null = null;
    private statusText!: Phaser.GameObjects.Text;

    constructor() {
        super('MainScene');
    }

    preload() { }

    async create() {
        this.statusText = this.add.text(10, 10, 'Connecting...', { color: '#ffffff' });

        const host = import.meta.env.VITE_NAKAMA_HOST || '127.0.0.1';
        const port = parseInt(import.meta.env.VITE_NAKAMA_PORT || '7350', 10);
        const useSSL = (import.meta.env.VITE_NAKAMA_SSL || 'false') === 'true';
        const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY || 'defaultkey';

    // Nakama Client expects port as a string per typings.
    this.nakamaClient = new Client(serverKey, host, String(port), useSSL);

        // Quick health probe (HEAD /healthcheck) to differentiate server-down vs auth errors.
        try {
            await this.healthProbe(host, port, useSSL);
        } catch (e) {
            const msg = 'Server unreachable (health check failed). Is Docker running and port ' + port + ' open?';
            console.error(msg, e);
            this.statusText.setText(msg);
            return;
        }

        try {
            const deviceId = this.getOrCreateDeviceId();
            this.session = await this.nakamaClient.authenticateDevice(deviceId, true);
            this.statusText.setText('Authenticated. Creating match...');

            // Create a new async match then fetch its state
            const createRes = await this.nakamaClient.rpc(this.session, 'create_match', { size: 2 });
            console.log('Created match (raw):', createRes);
            interface CreateMatchPayload { match_id: string; size: number }
            let match_id: string;
            try {
                const parsed = this.parseRpcPayload<CreateMatchPayload>(createRes);
                match_id = parsed.match_id;
                console.log('Parsed create_match payload:', parsed);
            } catch (e) {
                throw new Error('Failed to parse create_match response: ' + (e instanceof Error ? e.message : e));
            }
            if (!match_id) throw new Error('No match_id returned from create_match');

            this.statusText.setText('Match created. Fetching state...');
            const stateRes = await this.nakamaClient.rpc(this.session, 'get_state', { match_id });
            interface GetStatePayload { error?: string; [k: string]: unknown }
            try {
                const stateParsed = this.parseRpcPayload<GetStatePayload>(stateRes);
                if (stateParsed.error) {
                    console.warn('get_state error response', stateParsed);
                    this.statusText.setText('State error: ' + stateParsed.error);
                } else {
                    console.log('State RPC parsed result', stateParsed);
                    this.statusText.setText('State loaded (check console).');
                }
            } catch (e) {
                console.error('Failed to parse get_state response', e, stateRes);
                this.statusText.setText('State parse error (see console).');
            }
        } catch (err) {
            const detailed = await this.formatError(err);
            console.error('Authentication/RPC error:', detailed);
            this.statusText.setText('Auth/RPC error (see console).');
        }
    }

    private getOrCreateDeviceId(): string {
        const key = 'device_id';
        let existing = localStorage.getItem(key);
        if (!existing) {
            existing = crypto.randomUUID();
            localStorage.setItem(key, existing);
        }
        return existing;
    }

    private async healthProbe(host: string, port: number, useSSL: boolean): Promise<void> {
        const scheme = useSSL ? 'https' : 'http';
        const url = `${scheme}://${host}:${port}/healthcheck`; // Nakama health endpoint
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
            throw new Error('Health check HTTP ' + res.status);
        }
    }

    private async formatError(err: unknown): Promise<string> {
        // Nakama client errors sometimes have json() to extract server response.
        if (!err) return 'Unknown error';
        try {
            interface JsonCapable { json: () => Promise<unknown> }
            const hasJson = (v: unknown): v is JsonCapable => typeof (v as { json?: unknown }).json === 'function';
            if (hasJson(err)) {
                const inner = await err.json();
                return JSON.stringify(inner);
            }
        } catch (_) {
            // swallow
        }
        if (err instanceof Error) return err.message;
        return String(err);
    }

    private parseRpcPayload<T>(res: RpcResponse): T {
        const raw: unknown = (res as RpcResponse).payload as unknown;
        if (typeof raw === 'string') {
            return JSON.parse(raw) as T;
        }
        if (raw && typeof raw === 'object') {
            return raw as T; // already parsed
        }
        throw new Error('Unsupported payload type: ' + typeof raw);
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game',
    width: 800,
    height: 600,
    backgroundColor: '#202030',
    scene: [MainScene]
};

new Phaser.Game(config);
