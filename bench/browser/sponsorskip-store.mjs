// Adapter glue only. Inference/decoder in vendor module derived from upstream GPL source.
export const loadManifest=async()=>({});
export async function resolveVariant() {
 const base=new URL('../assets/sponsorskip-base/',import.meta.url);
 const meta=await (await fetch(new URL('detector_meta.json',base))).json();
 const response=await fetch(new URL('detector_fp16.onnx',base));if(!response.ok)throw new Error('Missing SponsorSkip weights');
 return {meta,model:await response.arrayBuffer(),version:'3468d080e70e4be8272d979ce5fd10bcea7cf9f5'};
}
