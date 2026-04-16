// KEPT FOR REFERENCE — YouLangua DAO event pulling logic
// Dependencies removed: eventConverter, eventDbService, cacheService event methods

// import { EventConverter } from '../services/eventConverter'
// import { EventDbService } from '../services/eventDbService'
// import { EventService } from '../services/eventService'
// import { CacheService } from '../services/cacheService'
// import { CONFIG } from '../config'
// import { stringify } from '../utils';
// import type { D1Database } from '@cloudflare/workers-types';
// import type { GEvent } from '../services/eventDbService';


// export class WorldEventsPuller {
//     private eventService: EventService
//     private eventConverter: EventConverter
//     private eventPersister: EventDbService
//     private cacheService: CacheService

//     constructor(db: D1Database, cacheService: CacheService) {
//         this.eventService = new EventService()
//         this.eventConverter = new EventConverter()
//         this.eventPersister = new EventDbService(db)
//         this.cacheService = cacheService
//     }

//     /**
//      * Sync events from blockchain and update cache
//      * @param maxSyncedBlockNumber - The last synced block number
//      * @returns Object containing latestWorldEvents, processed count, errors count, and message
//      */
//     async syncEvents(maxSyncedBlockNumber: bigint): Promise<{
//         latestWorldEvents: GEvent[],
//         processed: number,
//         errors: number,
//         message: string,
//         cacheUpdated: boolean
//     }> {
//         console.log('Starting event synchronization...')

//         // Step 1: Check if cache has valid data
//         const { events: cachedWorldEvents, cacheAgeSeconds } =
//             await this.cacheService.getEventsCache('latestWorldDaoEvents');

//         // If cache has data and is fresh (less than 60 seconds old), return it immediately
//         if (cachedWorldEvents.length > 0 && cacheAgeSeconds !== null && cacheAgeSeconds < 60) {
//             console.log(`Cache is fresh (${cacheAgeSeconds}s old), returning cached data`);
//             return {
//                 latestWorldEvents: cachedWorldEvents,
//                 processed: 0,
//                 errors: 0,
//                 message: `Returning cached data (age: ${cacheAgeSeconds}s)`,
//                 cacheUpdated: false
//             };
//         }

//         // Step 2: Cache is stale or empty, need to refresh
//         console.log(`Cache is stale or empty (age: ${cacheAgeSeconds}s), attempting to refresh`);

//         // Check if another request is already fetching events
//         const hasPendingFetch = await this.cacheService.getFetchPermission('worldEventsFetchStatus');

//         if (hasPendingFetch) {
//             console.log('Another fetch is in progress, returning cached/DB data');
//             // Return cached data if available, otherwise query DB
//             const latestWorldEvents = cachedWorldEvents.length > 0
//                 ? cachedWorldEvents
//                 : await this.eventPersister.getLatestWorldEvents();
//             return {
//                 latestWorldEvents,
//                 processed: 0,
//                 errors: 0,
//                 message: 'Fetch already in progress, returning existing data',
//                 cacheUpdated: false
//             };
//         }

//         // Step 3: Acquire fetch permission and pull from blockchain
//         await this.cacheService.setFetchPermission('worldEventsFetchStatus', 60);

//         try {
//             const logs = await this.eventService.getContractEvents({
//                 fromBlock: maxSyncedBlockNumber
//             })
//             console.log(`Found ${logs.length} logs to process`)

//             let processed = 0;
//             let errors = 0;
//             let hasContractEvents = false;

//             if (logs.length > 0) {
//                 const gEvents = this.eventConverter.logsToGEvents(logs)
//                 console.log(`Converted ${gEvents.length} logs to GEvents`)
//                 if (gEvents.length > 0) {
//                     console.log(stringify(gEvents[0]));
//                 }

//                 // Check if any event is from the contract address
//                 hasContractEvents = gEvents.some(evt => evt.evolver.toLowerCase() === CONFIG.CONTRACT_ADDRESS);

//                 const result = await this.eventPersister.persistGEvents(gEvents)
//                 processed = result.processed;
//                 errors = result.errors;
//             }

//             // Query latest world events from DB
//             console.log('Querying latest world events from DB');
//             const latestWorldEvents = await this.eventPersister.getLatestWorldEvents();

//             // Update world cache
//             await this.cacheService.updateEventsCache('latestWorldDaoEvents', latestWorldEvents);
//             console.log(`Updated world cache with ${latestWorldEvents.length} events`);

//             // If events with contract address were processed, update contract cache
//             if (hasContractEvents) {
//                 console.log('Contract events were pulled, updating contract cache');
//                 const allContractEvents = await this.eventPersister.getAllContractDaoEvents();
//                 await this.cacheService.updateEventsCache('allContractDaoEvents', allContractEvents);
//             }

//             const message = `Sync completed. Processed ${processed} events with ${errors} errors.`
//             console.log(message)
//             return {
//                 latestWorldEvents,
//                 processed,
//                 errors,
//                 message,
//                 cacheUpdated: true
//             }

//         } catch (error) {
//             console.error('Error during event synchronization:', error)
//             throw new Error('Failed to synchronize events')
//         } finally {
//             // Always delete the fetch permission when done
//             await this.cacheService.deleteFetchPermission('worldEventsFetchStatus');
//             console.log('Fetch permission released');
//         }
//     }
// }
