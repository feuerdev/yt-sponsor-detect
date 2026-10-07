// SPDX-License-Identifier: GPL-3.0-or-later
export function configureNliTokenizer(pipeline,maxLength) {
 const limit=pipeline.model.config.max_position_embeddings;
 if(!Number.isSafeInteger(limit)||limit<=0||!Number.isSafeInteger(maxLength)||maxLength<=0||maxLength>limit)throw new Error('Invalid NLI graph position limit');
 // Transformers 2 zero-shot pipeline ignores caller max_length. Its internal
 // pair tokenizer does honor this property; pinned metadata has a 1e30 sentinel.
 pipeline.tokenizer.model_max_length=maxLength;
}
