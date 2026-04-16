import { createContextKey } from '@connectrpc/connect';
import { Bindings, ServiceLocator } from './types';

// export const kStore = createContextKey<Cache | undefined>(undefined);

export const envStore = createContextKey<Bindings | undefined>(undefined);
export const serviceLocatorStore = createContextKey<ServiceLocator | undefined>(undefined);
