

npx wrangler dev


npx wrangler d1 execute youlingua_world --local --command="SELECT 1"

npx wrangler d1 execute youlingua_world --local --file=./schemas/001_schema.sql



npx wrangler d1 execute youlingua_world --local --file=./schemas/query.sql

npx wrangler d1 execute youlingua_world --remote --file=./schemas/query.sql

npx wrangler d1 execute youlingua_world --local --file=./schemas/001_schema.sql

npx wrangler d1 execute youlingua_world --remote --file=./schemas/001_schema.sql


// generate 
pnpm wagmi generate

// query
curl https://bsc-mainnet.infura.io/v3/90a9c3e2dac3411da08f7c2830716d82 \
curl https://bnb-testnet.g.alchemy.com/v2/dd7jSIeEr4Lg0U1vU2IvR \
