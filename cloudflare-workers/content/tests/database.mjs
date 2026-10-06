import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export class LocalD1 {
 constructor(seed=true) {
  this.sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')&&(seed||n.startsWith('0001'))).sort())this.sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 }
 prepare(sql) {
  const db=this;
  const build=(values=[])=>{
   const execute=()=>{const stmt=db.sqlite.prepare(sql);if(stmt.columns().length)return{success:true,results:stmt.all(...values),meta:{changes:0}};return{success:true,results:[],meta:{changes:Number(stmt.run(...values).changes)}};};
   return{bind:(...values)=>build(values),first:async()=>execute().results[0]||null,all:async()=>execute(),run:async()=>execute(),execute};
  };return build();
 }
 async batch(stmts){this.sqlite.exec('BEGIN');try{const results=stmts.map(s=>s.execute());this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
}
