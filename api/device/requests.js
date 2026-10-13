import { createDeviceHandler } from '../../src/device-approval.mjs';
import { serverClient } from '../../src/resource-api.mjs';
export default createDeviceHandler('requests', { getClient: serverClient });
