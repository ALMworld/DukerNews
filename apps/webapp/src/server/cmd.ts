// /**
//  * createServerFn wrapper for unified HandleCmd RPC.
//  */

// import { createServerFn } from '@tanstack/react-start'
// import { handleCmd } from '../services/cmd-handler'
// import type { Cmd } from '@repo/apidefs'

// export const handleCommand = createServerFn({ method: 'POST' })
//     .inputValidator((input: Cmd) => input)
//     .handler(async ({ data }) => handleCmd(data))
