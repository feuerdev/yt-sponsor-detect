// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {redactCaptionText} from '../bench/report-export.mjs';

test('caption-free exports preserve numeric evidence and original inputs',()=>{
 const original={fixture:{cues:[{start:1,end:2,text:'PRIVATE CAPTION CANARY'}],provenance:{rawHash:'original-hash'}},raw:{kind:'sponsorskip-words',words:[['PRIVATE WORD CANARY',1000]],probabilities:[[.1,.9]]},metrics:{recall:1},prediction:{segments:[{start:1,end:2}]}};
 const exported=redactCaptionText(original);
 assert.equal(JSON.stringify(exported).includes('CANARY'),false);
 assert.deepEqual(exported.fixture.cues,[{start:1,end:2}]);
 assert.deepEqual(exported.raw.words,[[null,1000]]);
 assert.deepEqual(exported.raw.probabilities,original.raw.probabilities);
 assert.deepEqual(exported.metrics,original.metrics);
 assert.deepEqual(exported.prediction,original.prediction);
 assert.equal(exported.fixture.provenance.rawHash,'original-hash');
 assert.equal(original.fixture.cues[0].text,'PRIVATE CAPTION CANARY');
 assert.equal(original.raw.words[0][0],'PRIVATE WORD CANARY');
});
