
import type { ConnectRouter } from '@connectrpc/connect';
import { registerDukiAggService } from './services/duki-agg';
import { registerDukerRegistryService } from './services/duker-registry';
import { registerDukigenRegistryService } from './services/dukigen-registry';
import { registerAlmWorldMinterService } from './services/alm-world-minter';
import { registerBlockchainSyncService } from './services/blockchain-sync';
export { setDb } from './shared';

export function registerGrpcRoutes(router: ConnectRouter) {
    registerDukiAggService(router);
    registerDukerRegistryService(router);
    registerDukigenRegistryService(router);
    registerAlmWorldMinterService(router);
    registerBlockchainSyncService(router);
}
