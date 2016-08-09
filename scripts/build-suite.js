
var builder = require('./build-a-demo.js');

const BUILDDIR = './www/glsl-gaussian-suite/';
const MAINJSFILE = 'glsl-gaussian-suite.js';
// const MAINHTMLFILE = 'index.html';
// const TITLE = 'glsl-gaussian-suite';

builder.buildADemo({
  BUILDDIR,
  MAINJSFILE,
  assets: ['glsl-gaussian-suite.html', 'glsl-gaussian-suite.css']
});
