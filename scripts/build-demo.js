
var builder = require('./build-a-demo.js');

const BUILDDIR = './www/glsl-gaussian-demo/';
const MAINJSFILE = 'glsl-gaussian-demo.js';
const MAINHTMLFILE = 'index.html';
const TITLE = 'glsl-gaussian Static Demo';

builder.buildADemo({BUILDDIR, MAINJSFILE, MAINHTMLFILE, TITLE});
