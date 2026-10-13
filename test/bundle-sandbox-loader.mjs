// Development-only loader for exercising npm run bundle's exact module graph.
// Not imported by the submission command itself.
const allowed=new Set(['node:fs','node:path','node:url','node:child_process','node:crypto']);
export async function resolve(specifier,context,nextResolve){
 if(specifier.startsWith('node:')){
  if(!allowed.has(specifier))throw new Error('sandbox_unsupported_import: '+specifier);
 }else if(!specifier.startsWith('.')&&!specifier.startsWith('/')&&!specifier.startsWith('file:')){
  throw new Error('sandbox_package_not_allowed: '+specifier);
 }
 return nextResolve(specifier,context);
}
