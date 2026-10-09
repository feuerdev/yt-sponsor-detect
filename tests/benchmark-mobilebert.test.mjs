// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
// Tokenization only; avoid the aggregate module's unrelated optional sharp loader.
import {MobileBertTokenizer} from '@xenova/transformers/src/tokenizers.js';
import * as nli from '../bench/adapters/nli-text.mjs';
const tokenizerJson={model:{type:'WordPiece',unk_token:'[UNK]',continuing_subword_prefix:'##',max_input_chars_per_word:100,vocab:{'[PAD]':0,'[UNK]':1,'[CLS]':2,'[SEP]':3,'ordinary':4,'content':5,'paid':6,'sponsorship':7}},normalizer:{type:'BertNormalizer',clean_text:true,handle_chinese_chars:true,strip_accents:null,lowercase:true},pre_tokenizer:{type:'BertPreTokenizer'},post_processor:{type:'BertProcessing',cls:['[CLS]',2],sep:['[SEP]',3]},decoder:{type:'WordPiece',prefix:'##',cleanup:true},added_tokens:[]};
test('NLI tokenizer bounds actual premise-hypothesis pairs to the graph position limit',()=>{
 const tokenizer=new MobileBertTokenizer(tokenizerJson,{model_max_length:1e30,pad_token:'[PAD]',cls_token:'[CLS]',sep_token:'[SEP]',unk_token:'[UNK]'}),pipeline={tokenizer,model:{config:{max_position_embeddings:512}}};
 const pair=text=>tokenizer(text,{text_pair:'paid sponsorship',padding:true,truncation:true});
 const short=pair('ordinary content');assert.ok(pair('ordinary content '.repeat(400)).input_ids.dims[1]>512);
 nli.configureNliTokenizer(pipeline,512);
 assert.deepEqual(pair('ordinary content').input_ids.data,short.input_ids.data);
 assert.equal(pair('ordinary content '.repeat(400)).input_ids.dims[1],512);
 assert.throws(()=>nli.configureNliTokenizer(pipeline,513),/position limit/);
 assert.throws(()=>nli.configureNliTokenizer({tokenizer,model:{config:{}}},512),/position limit/);
});
