# Third-party notices and asset provenance

## Stormlance creature

`assets/galevein_stormlance.glb` was generated locally on 2026-08-13 from the project-owned parametric Blender source in `tools/original-creature/`. Its editable `.blend` source and build metrics are retained outside this public artifact in the project's production-evidence folder. The generator makes geometry and animation from code and does not import a third-party creature asset.

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
