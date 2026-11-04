import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertBackupFileSize,MAX_BACKUP_IMPORT_BYTES} from '../js/backup.js';

test('photo-heavy verified backups can exceed the obsolete 25 MiB limit',()=>{
 assert.equal(MAX_BACKUP_IMPORT_BYTES,64*1024*1024);
 assert.equal(assertBackupFileSize(30*1024*1024),true);
 assert.equal(assertBackupFileSize(MAX_BACKUP_IMPORT_BYTES),true);
 assert.throws(()=>assertBackupFileSize(MAX_BACKUP_IMPORT_BYTES+1),/64 MiB/);
 assert.throws(()=>assertBackupFileSize(Number.POSITIVE_INFINITY),/Invalid backup/);
});

test('import and export use the same explicit size safety contract',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.match(app,/assertBackupFileSize\(file\.size\)/);
 assert.match(app,/blob\.size>MAX_BACKUP_IMPORT_BYTES/);
 assert.doesNotMatch(app,/file\.size>25\*1024\*1024/);
});

test('nominal maximum compact photos plus equally sized place covers fit bounded import',()=>{
 // Upper-bound estimate of JPEG data URI sizes; additional records still add overhead.
 const galleryCopies=120*190000;
 const placeCovers=120*190000;
 assert.ok(galleryCopies+placeCovers<MAX_BACKUP_IMPORT_BYTES);
});
