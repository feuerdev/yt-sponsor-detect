// SPDX-License-Identifier: GPL-3.0-or-later
import {hash,readJson,save} from './lib.mjs';
export async function lockTestExposure({file='bench/local/test-ledger.json',frozen,selectionHash,runId,at=new Date().toISOString()}) {
 if(typeof runId!=='string'||!/^[A-Za-z0-9_-]+$/.test(runId))throw Error('Invalid test run identity');
 if(!frozen||typeof selectionHash!=='string'||!selectionHash||frozen.selectionHash!==selectionHash)throw Error('Frozen selection identity mismatch');
 if(typeof file!=='string'||!file||!Number.isFinite(Date.parse(at)))throw Error('Invalid exposure ledger provenance');
 let ledger;try{ledger=await readJson(file);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(ledger&&(ledger.frozenHash!==hash(frozen)||ledger.selectionHash!==selectionHash))throw Error('Locked test already evaluated with a different config or selection; create a fresh holdout');
 if(ledger&&(!Number.isFinite(Date.parse(ledger.firstTestAt))||ledger.attempts!==undefined&&!Array.isArray(ledger.attempts)))throw Error('Corrupt existing exposure history');
 const attempts=ledger?.attempts??[];
 if(attempts.some(a=>a.runId===runId))throw Error('Duplicate test run already recorded');
 const result={...ledger,frozenHash:hash(frozen),selectionHash,firstTestAt:ledger?.firstTestAt??at,policy:ledger?.policy??'Test errors must not tune this holdout',attempts:[...attempts,{runId,at,phase:'before-inference'}]};
 await save(file,result);return result;
}
