import { createPublicOperationsHandler } from '../src/operations-public.mjs';
import checksHandler from '../src/checks-handler.mjs';
const operationsHandler=createPublicOperationsHandler();
export default function handler(req,res){
  return req.query?.view==='checks'?checksHandler(req,res):operationsHandler(req,res);
}
