window.benchmarkReady=true;
window.probeGPU=async()=>{
 const adapter=await navigator.gpu?.requestAdapter();
 const result={gpuApi:!!navigator.gpu,usableAdapter:!!adapter,adapterInfo:adapter?{vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,device:adapter.info?.device,description:adapter.info?.description,isFallbackAdapter:adapter.info?.isFallbackAdapter??adapter.isFallbackAdapter??null}:null,features:adapter?[...adapter.features]:[],userAgent:navigator.userAgent,note:'Capability probe only; no device or ONNX graph initialized.'};
 document.querySelector('#result').textContent=JSON.stringify(result,null,2);return result;
};
