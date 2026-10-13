import { createOperationsHandler } from '../src/operations.mjs';
import { serverClient } from '../src/resource-api.mjs';
export default createOperationsHandler({getClient:serverClient});
