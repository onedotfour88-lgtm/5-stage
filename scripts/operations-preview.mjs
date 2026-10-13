import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { buildSnapshot } from '../src/operations.mjs';
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.js':'text/javascript; charset=utf-8'};
const allowed=new Set(['/','/index.html','/operations.html','/operations-app.mjs','/app.mjs','/aleph.config.json','/data.json','/manifest.webmanifest','/offline.html','/sw.js','/icons/app-192.png','/icons/app-512.png']);
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const url=new URL(req.url,'http://127.0.0.1:4173');
 if(req.method==='GET'&&url.pathname==='/api/operations'){
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...buildSnapshot(),previewOnly:true}));return;
 }
 if(req.method!=='GET'||!allowed.has(url.pathname)||url.search){res.writeHead(404);res.end();return;}
 try{const file=url.pathname==='/'?'index.html':url.pathname.slice(1);const ext=file.slice(file.lastIndexOf('.'));
 res.setHeader('Content-Type',types[ext]??'application/octet-stream');res.end(await readFile(new URL('../public/'+file,import.meta.url)));
 }catch{res.writeHead(404);res.end();}
});
server.listen(4173,'127.0.0.1',()=>console.log('화면 미리보기: http://127.0.0.1:4173/operations.html · 실제 API/엔진 실행 아님 · Ctrl+C로 중지'));
