import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { DukiAggService } from "@repo/dukiregistry-apidefs";

const client = createClient(
    DukiAggService,
    createConnectTransport({
        baseUrl: "http://localhost:8788",
        httpVersion: "1.1",
    })
);

client.getQuickOverview({})
    .then(console.log)
    .catch(console.error);
