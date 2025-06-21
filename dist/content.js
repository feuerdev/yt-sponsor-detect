(function () {
	'use strict';

	console.log("Content script loaded.");const o=[];chrome.runtime.onMessage.addListener((e,s,n)=>{e.type==="SPONSORED_SEGMENT_FOUND"&&(console.log("Received sponsored segment:",e.payload),o.push(e.payload),console.log("All detected segments:",o));});

})();
