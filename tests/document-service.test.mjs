import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAddress,installDocumentRoutes} from '../document-service.mjs';
test('document reader rejects private and metadata addresses',()=>{
  for(const address of ['127.0.0.1','10.1.1.1','169.254.169.254','172.16.2.3','192.168.1.1','100.64.2.1','::1','::ffff:127.0.0.1','fd00::1'])assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('8.8.8.8'),true);
});
test('arbitrary URL is never accepted as a document id',async()=>{
  let route;installDocumentRoutes({get:(_path,handler)=>{route=handler;}},[]);
  let status,body;const response={status:n=>{status=n;return response;},json:x=>{body=x;return response;}};
  await route({params:{id:'https://example.com/private'},query:{}},response);
  assert.equal(status,404);assert.equal(body.error,'document_not_registered');
});
