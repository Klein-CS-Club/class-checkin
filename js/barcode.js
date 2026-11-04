// Code 39: nine alternating bars/spaces, 3 wide elements, one narrow inter-character gap.
// The scanner must emit the label's identifier followed by Enter, with Code 39 enabled.
const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
const encodings=[0x034,0x121,0x061,0x160,0x031,0x130,0x070,0x025,0x124,0x064,0x109,0x049,0x148,0x019,0x118,0x058,0x00d,0x10c,0x04c,0x01c,0x103,0x043,0x142,0x013,0x112,0x052,0x007,0x106,0x046,0x016,0x181,0x0c1,0x1c0,0x091,0x190,0x0d0,0x085,0x184,0x0c4,0x0a8,0x0a2,0x08a,0x02a];
export function barcodeSvg(identifier) {
  if(!/^[A-Z0-9-]{3,40}$/.test(identifier))throw Error('Invalid scan identifier.');
  let x=10,rects='';
  for(const c of '*'+identifier+'*'){
    const pattern=c==='*'?0x094:encodings[alphabet.indexOf(c)];
    for(let i=0;i<9;i++){const w=(pattern & (1<<(8-i)))?3:1;if(i%2===0)rects+=`<rect x="${x}" y="0" width="${w}" height="45"/>`;x+=w;}x++;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x+9} 45" role="img" aria-label="Barcode ${identifier}" preserveAspectRatio="none">${rects}</svg>`;
}
