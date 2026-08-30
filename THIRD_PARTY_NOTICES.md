# Third-party notices and asset provenance

## GPU.js 2.24.0

- Source: https://github.com/gpujs/gpu.js
- License: MIT
- Included file: `vendor/gpujs/gpu-browser-2.24.0.min.js`
- License copy: `licenses/gpujs-2.24.0-MIT.txt`
- Use: optional, asynchronous atmospheric compute experiment only
- Provenance and adoption boundary: `GPU_COMPUTE_PROVENANCE.md`

## Sablewing creature

`assets/galevein_sablewing.glb` is an original Galevein silhouette and material
remodel of **Wyvern animated** by Charlie catling, obtained from Fab under
Creative Commons Attribution 4.0 International. The source listing is
<https://www.fab.com/listings/d1faa655-b744-40d1-af90-ff8748f4398d> and the
license is <https://creativecommons.org/licenses/by/4.0/>. The shipped asset
changes the snout, neck, tail, wings, dorsal profile, material palette, selected
control-bone names, and web compression. The full attribution/change receipt is
retained at `licenses/wyvern-animated-CC-BY-4.0.txt`.

Sablewing is an original-IP Galevein character. It is not Night Fury and is not
presented as an official DreamWorks Animation character, asset, or product.

## Audio

- `audio/menu_music_cc0.mp3`: **Eye of the Storm** by Joth, CC0 1.0, obtained from OpenGameArt. No attribution is required; this acknowledgement is retained for traceability.
- The other files in `audio/` are project-generated oscillator/noise compositions. Their generator and synthesis notes are retained in the source workspace and are not part of the served artifact.

## Three.js

This artifact bundles Three.js r165 (`GLTFLoader`, `DRACOLoader`, and `BufferGeometryUtils`) for the WebGL game and Three.js r184 WebGPU/TSL for the isolated ocean renderer. Both are available under the MIT License. The complete r184 text is also retained at `licenses/three-r184-MIT.txt`.

Copyright 2010-2024 Three.js Authors.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Poseidon spectral ocean

The WebGPU ocean uses selected source files from Owen Yuwono's Poseidon at
commit `184721a8eee8b4f78f31dcfdff4734574155685d`, under the MIT License.
The complete license is retained at `licenses/poseidon-MIT.txt` and the exact
file/modification ledger is in `OCEAN_PROVENANCE.md`.

Poseidon's own source records technique lineage from gasgiant/FFT-Ocean (MIT)
and Horvath 2015. Galevein distributes the reviewed Poseidon implementation,
not a separate copy of gasgiant/FFT-Ocean.
